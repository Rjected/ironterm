import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't spin up the Cloudflare runtime.
export default defineConfig({ test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "directory/**/*.test.ts", "server/**/*.test.ts", "cli/**/*.test.ts"] } });
