import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

describe("Dockerfile", () => {
  it("health-checks the port the server actually listens on", () => {
    const hc = dockerfile.split("\n").find((l) => l.startsWith("HEALTHCHECK"))!;
    expect(hc).toContain("process.env.PORT");
    expect(hc).not.toMatch(/127\.0\.0\.1:8787/);
  });
});
