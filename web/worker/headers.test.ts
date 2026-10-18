import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import { API_CSP, PAGE_HEADERS, withSecurityHeaders } from "./headers";

const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

describe("security headers", () => {
  it("public/_headers (Workers Assets) matches PAGE_HEADERS", () => {
    const text = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
    const lines = text.split("\n").filter((l) => /^\s+\S+:/.test(l));
    const parsed = Object.fromEntries(lines.map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
    expect(parsed).toEqual(PAGE_HEADERS);
    expect(text).toMatch(/^\/\*$/m);
  });

  it("API responses carry nosniff, a locked-down CSP and no framing", async () => {
    const r = await worker.fetch!(new Request("http://localhost/api/bootstrap") as never, env, ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe(API_CSP);
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    const nf = await worker.fetch!(new Request("http://localhost/api/nope") as never, env, ctx);
    expect(nf.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("works on redirects (immutable headers) and keeps a response's own CSP", () => {
    const r = withSecurityHeaders(Response.redirect("https://example.com/", 302));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://example.com/");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const own = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } }));
    expect(own.headers.get("content-security-policy")).toContain("unsafe-inline");
  });

  it("the page CSP allows no inline or third-party script", () => {
    const csp = PAGE_HEADERS["content-security-policy"];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
