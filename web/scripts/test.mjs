// Test runner: bundles every *.test.ts with esbuild (aliasing "vitest" to packages/test, our
// small vitest-compatible API) and runs the bundles with Node's built-in test runner.
//
//   pnpm test                    # everything
//   pnpm test strong cli         # only test files whose path contains "strong" or "cli"
//   UPDATE_SNAPSHOTS=1 pnpm test # rewrite snapshots
//   TEST_REPORTER=spec pnpm test # one line per test (default: dot)
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const out = join(root, ".test-dist");
const DIRS = ["shared", "worker", "directory", "server", "cli", "packages"];

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, found);
    else if (name.endsWith(".test.ts")) found.push(p);
  }
  return found;
}

const filters = process.argv.slice(2);
const files = DIRS.flatMap((d) => { try { return walk(join(root, d)); } catch { return []; } })
  .filter((f) => !filters.length || filters.some((s) => relative(root, f).includes(s)))
  .sort();
if (!files.length) {
  console.error(`no test files match ${filters.join(" ")}`);
  process.exit(1);
}

/** `import.meta.url` in our sources means the .ts file (tests read fixtures next to it), not the bundle. */
const sourceUrls = {
  name: "source-import-meta-url",
  setup(b) {
    b.onLoad({ filter: /\.tsx?$/ }, (args) => {
      if (args.path.includes("node_modules")) return undefined;
      const text = readFileSync(args.path, "utf8");
      if (!text.includes("import.meta.url")) return undefined;
      return { contents: text.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(args.path).href)), loader: args.path.endsWith("x") ? "tsx" : "ts" };
    });
  },
};

rmSync(out, { recursive: true, force: true });
const t0 = performance.now();
await build({
  entryPoints: files,
  outdir: out,
  outbase: root,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  splitting: false,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "inline",
  logLevel: "warning",
  alias: { vitest: join(root, "packages/test/index.ts") },
  jsx: "automatic",
  jsxImportSource: "preact",
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  plugins: [sourceUrls],
});
const bundled = ((performance.now() - t0) / 1000).toFixed(1);

const reporter = process.env.TEST_REPORTER ?? "dot";
const outputs = files.map((f) => join(out, relative(root, f)).replace(/\.ts$/, ".mjs"));
const r = spawnSync(
  process.execPath,
  ["--test", "--test-force-exit", `--test-reporter=${reporter}`, "--enable-source-maps", "--disable-warning=ExperimentalWarning", ...outputs],
  { stdio: "inherit", cwd: root, env: { ...process.env, IRONTERM_TEST_ROOT: root } },
);
console.log(`${files.length} test files (bundled in ${bundled}s)`);
process.exit(r.status ?? 1);
