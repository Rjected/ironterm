import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Your own Cloudflare config lives in wrangler.jsonc (gitignored). A fresh clone, CI and the
// self-hosted build fall back to the example so everything still builds.
const configPath = existsSync("wrangler.jsonc") ? "wrangler.jsonc" : "wrangler.example.jsonc";

export default defineConfig({
  plugins: [cloudflare({ configPath })],
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
});
