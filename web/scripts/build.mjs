// Production build with esbuild alone (no vite, no Cloudflare plugin):
//
//   node scripts/build.mjs           client (dist/client) + Cloudflare Worker (dist/ironterm)
//   node scripts/build.mjs --node    … + the self-hosted Node server (dist/server/main.mjs)
//
// The Worker output is what `wrangler deploy` uploads: dist/ironterm/index.js plus a generated
// dist/ironterm/wrangler.json, and .wrangler/deploy/config.json pointing wrangler at it (the same
// layout @cloudflare/vite-plugin produced, so your wrangler.jsonc needs no changes).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(import.meta.url), "../..");
const dist = join(root, "dist");

/** `import x from "./file?raw"`: the file's text as a string export (as in vite). */
export const rawPlugin = {
  name: "raw",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({ contents: readFileSync(args.path, "utf8"), loader: "text" }));
  },
};

/** esbuild options shared by the production and dev client builds. */
export function clientOptions(outdir, { dev = false } = {}) {
  return {
    entryPoints: { index: join(root, "src/main.tsx") },
    outdir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2022", "safari16"],
    jsx: "automatic",
    jsxImportSource: "preact",
    minify: !dev,
    charset: "utf8", // keep · → ✓ etc. as UTF-8 instead of \u escapes: smaller
    sourcemap: dev ? "inline" : false,
    entryNames: dev ? "[name]" : "[name]-[hash]",
    chunkNames: dev ? "[name]" : "[name]-[hash]",
    assetNames: dev ? "[name]" : "[name]-[hash]",
    metafile: true,
    // fonts are optional files in public/fonts (see scripts/copy-fonts.mjs), resolved at runtime
    external: ["/fonts/*"],
    logLevel: "warning",
    plugins: [rawPlugin],
  };
}

/** index.html with the built entry script and stylesheet (plus [extraHead] in dev). */
export function writeIndexHtml(outDir, metafile, assetsPrefix, extraHead = "") {
  const outputs = Object.entries(metafile.outputs);
  const entry = outputs.find(([, o]) => o.entryPoint?.endsWith("src/main.tsx"));
  if (!entry) throw new Error("no entry chunk in the build output");
  const [js, info] = entry;
  const css = info.cssBundle;
  const tags = [
    css ? `<link rel="stylesheet" href="${assetsPrefix}${basename(css)}" />` : "",
    `<script type="module" src="${assetsPrefix}${basename(js)}"></script>`,
    extraHead,
  ].filter(Boolean).join("\n    ");
  const html = readFileSync(join(root, "index.html"), "utf8")
    .replace(/\s*<script type="module" src="\/src\/main.tsx"><\/script>/, "")
    .replace("</head>", `  ${tags}\n  </head>`);
  writeFileSync(join(outDir, "index.html"), html);
}

async function buildClient() {
  const out = join(dist, "client");
  rmSync(out, { recursive: true, force: true });
  cpSync(join(root, "public"), out, { recursive: true, filter: (p) => !p.endsWith(".gitkeep") });
  const r = await build(clientOptions(join(out, "assets")));
  writeIndexHtml(out, r.metafile, "/assets/");
  // Workers Assets: never upload these if they end up next to the client files
  writeFileSync(join(out, ".assetsignore"), "wrangler.json\n.dev.vars\n");
  return r.metafile;
}

// ───────────────────────────── Cloudflare Worker ─────────────────────────────

/** JSON with comments and trailing commas (wrangler.jsonc). */
export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { // copy strings verbatim
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
      if (i === 0) throw new Error("unterminated comment");
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

async function buildWorker() {
  const configPath = existsSync(join(root, "wrangler.jsonc")) ? join(root, "wrangler.jsonc") : join(root, "wrangler.example.jsonc");
  const config = parseJsonc(readFileSync(configPath, "utf8"));
  // same folder name as @cloudflare/vite-plugin: the worker name with - as _
  const out = join(dist, (config.name ?? "ironterm").replace(/-/g, "_"));
  rmSync(out, { recursive: true, force: true });
  const r = await build({
    entryPoints: [join(root, config.main ?? "worker/index.ts")],
    outfile: join(out, "index.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    mainFields: ["module", "main"],
    external: ["cloudflare:*", "node:*"],
    minify: false,
    sourcemap: true,
    metafile: true,
    logLevel: "warning",
    plugins: [rawPlugin],
  });
  // Paths in the generated config are relative to it (wrangler resolves them from there).
  const rel = (p) => relative(out, resolve(dirname(configPath), p));
  const deployConfig = {
    ...config,
    $schema: undefined,
    main: "index.js",
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    ...(config.assets ? { assets: { ...config.assets, directory: rel("dist/client") } } : {}),
    d1_databases: (config.d1_databases ?? []).map((d) => (d.migrations_dir ? { ...d, migrations_dir: rel(d.migrations_dir) } : d)),
    configPath,
    userConfigPath: configPath,
    topLevelName: config.name,
  };
  writeFileSync(join(out, "wrangler.json"), JSON.stringify(deployConfig));
  mkdirSync(join(root, ".wrangler/deploy"), { recursive: true });
  writeFileSync(join(root, ".wrangler/deploy/config.json"), JSON.stringify({ configPath: relative(join(root, ".wrangler/deploy"), join(out, "wrangler.json")), auxiliaryWorkers: [] }));
  return r.metafile;
}

// ───────────────────────────── Node server ─────────────────────────────

export const nodeServerOptions = (entry, outfile) => ({
  entryPoints: [join(root, entry)],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  logLevel: "warning",
  plugins: [rawPlugin],
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
});

const size = (metafile) => Object.values(metafile.outputs).reduce((n, o) => n + o.bytes, 0);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const node = process.argv.includes("--node");
  const [client, worker] = await Promise.all([buildClient(), buildWorker()]);
  const lines = [`dist/client   ${kb(size(client))} (${Object.keys(client.outputs).length} files)`, `dist/ironterm ${kb(size(worker))}`];
  if (node) {
    const r = await build({ ...nodeServerOptions("server/main.ts", join(dist, "server/main.mjs")), metafile: true });
    lines.push(`dist/server   ${kb(size(r.metafile))}`);
  }
  const hash = createHash("sha256").update(readFileSync(join(dist, "client/index.html"))).digest("hex").slice(0, 8);
  console.log(`${lines.join("\n")}\nbuilt in ${((performance.now() - t0) / 1000).toFixed(2)}s (index.html ${hash})`);
}
