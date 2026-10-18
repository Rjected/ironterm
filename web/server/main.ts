// Self-hosted server: runs the same worker (worker/index.ts) on plain Node, with SQLite instead
// of D1, files from dist/client instead of Workers Assets, and a timer instead of the cron
// trigger. Configure with environment variables (see web/SELF_HOSTING.md).
//
//   node dist/server/main.mjs            # after `pnpm build:node`
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import worker from "../worker/index";
import { NodeD1 } from "./d1";
import { isLocal } from "./local";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA = resolve(process.env.DATA_DIR ?? "./data");
const STATIC = resolve(process.env.STATIC_DIR ?? join(here, "../client"));
const SYNC_MIN = Number(process.env.SYNC_MINUTES ?? 15);

mkdirSync(DATA, { recursive: true });
const DB = new NodeD1(join(DATA, "hevy.sqlite"));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain",
};

/** Workers Assets stand-in: real files, else index.html (single-page app). */
const ASSETS = {
  async fetch(req: Request): Promise<Response> {
    const path = decodeURIComponent(new URL(req.url).pathname);
    let file = normalize(join(STATIC, path));
    if (!file.startsWith(STATIC)) return new Response("Not found", { status: 404 });
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // like Workers' SPA mode: unknown pages get the app, unknown files 404
      if (extname(path)) return new Response("Not found", { status: 404 });
      file = join(STATIC, "index.html");
    }
    if (!existsSync(file)) return new Response("Build the client first (pnpm build:node).", { status: 500 });
    const immutable = path.startsWith("/assets/");
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" },
    });
  },
};

// Same names as the worker's vars/secrets; anything unset is simply off.
const KEYS = [
  "HEVY_API_KEY", "APP_PASSWORD", "SESSION_SECRET", "WEBHOOK_SECRET", "TIMEZONE", "ALLOWED_EMAILS",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET",
  "SOCIAL_DIRECTORY", "SOCIAL_ALLOW_HTTP", "SOCIAL_ORIGIN",
];
const env: Record<string, unknown> = { DB, ASSETS };
for (const k of KEYS) if (process.env[k]) env[k] = process.env[k];

const pending = new Set<Promise<unknown>>();
const ctx = {
  waitUntil(p: Promise<unknown>) { const q = Promise.resolve(p).catch((e) => console.error(e)).finally(() => pending.delete(q)); pending.add(q); },
  passThroughOnException() {},
  props: {},
};

function toRequest(req: IncomingMessage): Request {
  // Behind a reverse proxy (Caddy, nginx, Cloudflare Tunnel…) trust its scheme/host so the
  // Google redirect URI and cookies use the public origin.
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? "http";
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? `localhost:${PORT}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) for (const x of Array.isArray(v) ? v : [v]) headers.append(k, x);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream);
  return new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, body, duplex: "half" } as RequestInit);
}

async function send(res: ServerResponse, r: Response) {
  const h: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => { if (k !== "set-cookie") h[k] = v; });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) h["set-cookie"] = cookies;
  res.writeHead(r.status, h);
  if (!r.body) return res.end();
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
  res.end();
}

// With no login configured the worker only serves "localhost", judged by the URL's host. Here the
// Host and X-Forwarded-* headers are client-controlled (a DNS-rebinding page can set them), so
// decide from the socket and the raw headers instead (server/local.ts). Anything else gets the
// same 403 the worker would give.
const loginConfigured = !!(env.APP_PASSWORD || (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && env.ALLOWED_EMAILS) || env.ACCESS_AUD);
if (!loginConfigured) console.warn("No login configured (APP_PASSWORD or Google): only requests from this machine are served.");

createServer(async (req, res) => {
  try {
    // Social endpoints answer other servers without a login (every /social/v1/* call is signed).
    const peer = /^\/(\.well-known\/ironterm|social\/)/.test(req.url ?? "");
    if (!loginConfigured && !isLocal(req) && !peer) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "No login configured for this server. Set APP_PASSWORD or Google sign-in (see SELF_HOSTING.md)." }));
    }
    await send(res, await worker.fetch!(toRequest(req) as never, env as never, ctx as never));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
}).listen(PORT, HOST, () => console.log(`ironterm on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT} · data ${DATA}`));

// The worker's cron, on a timer: sync Hevy (and WHOOP) every SYNC_MINUTES.
const tick = () => Promise.resolve(worker.scheduled?.({ cron: "timer", scheduledTime: Date.now(), noRetry() {} } as never, env as never, ctx as never)).catch((e) => console.error("sync", e));
if (SYNC_MIN > 0) { setTimeout(tick, 5_000); setInterval(tick, SYNC_MIN * 60_000); }

const stop = async () => { await Promise.allSettled([...pending]); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
