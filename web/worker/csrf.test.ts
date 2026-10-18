// CSRF: state-changing requests must come from the app's own pages unless they carry a bearer token.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { csrfBlock } from "./auth";
import { NodeD1 } from "../server/d1";

const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

const call = async (method: string, path: string, headers: Record<string, string> = {}, body: unknown = { mode: "local" }) => {
  const r = await worker.fetch!(new Request(`http://localhost${path}`, { method, headers: { "content-type": "text/plain", ...headers }, body: method === "GET" ? undefined : JSON.stringify(body) }) as never, env, ctx);
  return { status: r.status, data: (await r.json()) as { error?: string } };
};

describe("csrfBlock", () => {
  const req = (method: string, headers: Record<string, string>) => new Request("https://gym.example.com/api/x", { method, headers });
  const mine = ["https://gym.example.com"];

  it("lets reads through", () => {
    expect(csrfBlock(req("GET", { "sec-fetch-site": "cross-site" }), mine)).toBeNull();
  });
  it("judges writes by Sec-Fetch-Site first", () => {
    expect(csrfBlock(req("POST", { "sec-fetch-site": "same-origin" }), mine)).toBeNull();
    expect(csrfBlock(req("POST", { "sec-fetch-site": "none" }), mine)).toBeNull();
    expect(csrfBlock(req("POST", { "sec-fetch-site": "cross-site" }), mine)).toMatch(/cross-site/);
    expect(csrfBlock(req("PUT", { "sec-fetch-site": "same-site" }), mine)).toMatch(/same-site/);
    // a proxy that rewrote the host doesn't matter when the browser says same-origin
    expect(csrfBlock(req("POST", { "sec-fetch-site": "same-origin", origin: "https://public.example" }), mine)).toBeNull();
  });
  it("falls back to Origin", () => {
    expect(csrfBlock(req("DELETE", { origin: "https://gym.example.com" }), mine)).toBeNull();
    expect(csrfBlock(req("DELETE", { origin: "https://evil.example" }), mine)).toMatch(/cross-origin/);
    expect(csrfBlock(req("POST", { origin: "null" }), mine)).toMatch(/cross-origin/);
  });
  it("allows non-browser clients and bearer tokens", () => {
    expect(csrfBlock(req("POST", {}), mine)).toBeNull();
    expect(csrfBlock(req("POST", { authorization: "Bearer ht_abc", "sec-fetch-site": "cross-site" }), mine)).toBeNull();
  });
});

describe("worker CSRF guard", () => {
  it("blocks a cross-site text/plain POST on localhost (no login)", async () => {
    const r = await call("PUT", "/api/mode", { "sec-fetch-site": "cross-site", origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/cross-site/);
    expect((await call("POST", "/api/tokens", { origin: "https://evil.example" }, { name: "x" })).status).toBe(403);
    expect((await call("POST", "/api/social/setup", { "sec-fetch-site": "same-site" }, { handle: "x" })).status).toBe(403);
  });

  it("serves the app's own requests and reads", async () => {
    expect((await call("PUT", "/api/mode", { "sec-fetch-site": "same-origin", origin: "http://localhost" })).status).toBe(200);
    expect((await call("PUT", "/api/mode", { origin: "http://localhost" })).status).toBe(200);
    expect((await call("GET", "/api/bootstrap", { "sec-fetch-site": "cross-site" })).status).toBe(200);
  });

  it("leaves webhooks and server-to-server endpoints to their own checks", async () => {
    expect((await call("POST", "/api/hevy/webhook", { "sec-fetch-site": "cross-site" })).data.error).toBe("unauthorized");
    expect((await call("POST", "/social/v1/inbox", { "sec-fetch-site": "cross-site" })).data.error).toMatch(/signature/);
  });
});
