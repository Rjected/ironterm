// Webhook authentication: Hevy's bearer secret and WHOOP's HMAC signature with a replay window.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import { verifyWebhook } from "./whoop";

const SECRET = "whoop-client-secret";
const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York", WEBHOOK_SECRET: "hevy-hook", WHOOP_CLIENT_ID: "id", WHOOP_CLIENT_SECRET: SECRET, APP_PASSWORD: "pw" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

async function sign(ts: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + raw)))));
}
const whoopReq = (headers: Record<string, string>, raw: string) => new Request("https://gym.example.com/api/whoop/webhook", { method: "POST", headers, body: raw });

describe("WHOOP webhook signature", () => {
  const raw = JSON.stringify({ id: 1, type: "workout.deleted" });

  it("accepts a fresh, correctly signed event", async () => {
    const ts = String(Date.now());
    expect(await verifyWebhook(env, whoopReq({ "x-whoop-signature": await sign(ts, raw), "x-whoop-signature-timestamp": ts }, raw), raw)).toBe(true);
  });

  it("rejects a wrong signature, a tampered body, and stale or non-numeric timestamps", async () => {
    const ts = String(Date.now());
    const sig = await sign(ts, raw);
    expect(await verifyWebhook(env, whoopReq({ "x-whoop-signature": sig.replace(/^./, "A"), "x-whoop-signature-timestamp": ts }, raw), raw)).toBe(false);
    expect(await verifyWebhook(env, whoopReq({ "x-whoop-signature": sig, "x-whoop-signature-timestamp": ts }, raw + " "), raw + " ")).toBe(false);
    const old = String(Date.now() - 16 * 60_000);
    expect(await verifyWebhook(env, whoopReq({ "x-whoop-signature": await sign(old, raw), "x-whoop-signature-timestamp": old }, raw), raw)).toBe(false);
    // a signature over a non-numeric timestamp used to skip the replay window entirely
    for (const bad of ["abc", "", "1e12", " 1"]) {
      expect(await verifyWebhook(env, whoopReq({ "x-whoop-signature": await sign(bad, raw), "x-whoop-signature-timestamp": bad }, raw), raw)).toBe(false);
    }
  });

  it("the endpoint answers 401 to unsigned events", async () => {
    expect((await worker.fetch!(whoopReq({}, raw) as never, env, ctx)).status).toBe(401);
  });
});

describe("Hevy webhook", () => {
  const hook = (auth?: string) => worker.fetch!(new Request("https://gym.example.com/api/hevy/webhook", { method: "POST", headers: auth ? { authorization: auth } : {}, body: "{}" }) as never, env, ctx);
  it("needs the exact bearer secret", async () => {
    expect((await hook()).status).toBe(401);
    expect((await hook("Bearer nope")).status).toBe(401);
    expect((await hook("Bearer hevy-hook-and-more")).status).toBe(401);
    expect((await hook("Bearer hevy-hook")).status).toBe(200);
  });
});
