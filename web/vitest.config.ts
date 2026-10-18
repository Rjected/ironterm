import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't spin up the Cloudflare runtime.
// Generous timeouts: the end-to-end tests run several in-process servers and replay a year of
// data, which takes well under a second on a laptop but much longer on a busy CI runner or a
// loaded machine. A timeout here means "hung", not "slow".
export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "directory/**/*.test.ts", "server/**/*.test.ts", "cli/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
