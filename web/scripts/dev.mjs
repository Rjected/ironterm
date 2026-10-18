// Dev server: http://localhost:5173 (PORT to change). esbuild watches the client and the Node
// server; the app runs as the self-hosted Node server (the same worker code, SQLite in ./data)
// and the page reloads itself after every rebuild. Settings come from your environment, e.g.
// HEVY_API_KEY=… pnpm dev, or .dev.vars (with none set you get demo data).
import { context } from "esbuild";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { clientOptions, nodeServerOptions, root, writeIndexHtml } from "./build.mjs";

const PORT = Number(process.env.PORT ?? 5173);
const APP_PORT = PORT + 1;
const out = join(root, ".dev");
const client = join(out, "client");
// a script file, not inline: the app's CSP only allows scripts from 'self'
const RELOAD_JS = `new EventSource("/__reload").onmessage = () => location.reload();\n`;

rmSync(out, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
cpSync(join(root, "public"), client, { recursive: true });

const listeners = new Set();
const reload = () => { for (const res of listeners) res.write("data: reload\n\n"); };

/** KEY=value lines from .dev.vars (the file wrangler dev reads), if there is one. */
function devVars() {
  const file = join(root, ".dev.vars");
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") vars[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

let app = null;
function restartApp() {
  app?.kill();
  app = spawn(process.execPath, ["--enable-source-maps", "--disable-warning=ExperimentalWarning", join(out, "server/main.mjs")], {
    stdio: "inherit",
    env: { SYNC_MINUTES: "0", DATA_DIR: join(root, "data"), ...devVars(), ...process.env, PORT: String(APP_PORT), HOST: "127.0.0.1", STATIC_DIR: client },
  });
}

/** Resolves once the (re)started app answers, or after 15 s. */
async function whenAppUp() {
  for (let i = 0; i < 150; i++) {
    try { await fetch(`http://127.0.0.1:${APP_PORT}/favicon.svg`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
}

const done = (name, after) => ({
  name,
  setup(b) {
    let t = 0;
    b.onStart(() => { t = performance.now(); });
    b.onEnd((r) => {
      if (r.errors.length) return; // esbuild already printed them; keep the last good build running
      console.log(`[dev] ${name} rebuilt in ${Math.round(performance.now() - t)} ms`);
      after(r);
    });
  },
});

const clientCtx = await context({
  ...clientOptions(join(client, "assets"), { dev: true }),
  plugins: [...clientOptions("").plugins, done("client", (r) => { writeIndexHtml(client, r.metafile, "/assets/", `<script src="/__reload.js"></script>`); reload(); })],
});
const serverCtx = await context({
  ...nodeServerOptions("server/main.ts", join(out, "server/main.mjs")),
  sourcemap: "inline",
  plugins: [...nodeServerOptions("", "").plugins, done("server", () => { restartApp(); whenAppUp().then(reload); })],
});
await Promise.all([clientCtx.watch(), serverCtx.watch()]);

// The page talks to this port: the reload channel here, everything else proxied to the app.
createServer((req, res) => {
  if (req.url === "/__reload.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
    res.end(RELOAD_JS);
    return;
  }
  if (req.url === "/__reload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    listeners.add(res);
    req.on("close", () => listeners.delete(res));
    return;
  }
  const upstream = request({ host: "127.0.0.1", port: APP_PORT, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  // while the app restarts: a page that reloads itself once it's back
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><body style="background:#000;color:#aaa;font:14px ui-monospace,monospace;padding:24px">restarting…<script src="/__reload.js"></script>`);
  });
  req.pipe(upstream);
}).listen(PORT, "127.0.0.1", () => console.log(`[dev] http://localhost:${PORT}`));

const stop = () => { app?.kill(); clientCtx.dispose(); serverCtx.dispose(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
