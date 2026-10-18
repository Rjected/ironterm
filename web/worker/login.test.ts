// Password sign-in: wrong guesses are throttled per address and globally; bad bodies are 400s/401s.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import { passwordMatches } from "./auth";
import { LOGIN_LIMITS } from "./ratelimit";

const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York", APP_PASSWORD: "correct horse battery staple", SESSION_SECRET: "s" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

const login = (password: unknown, ip: string, raw?: string) =>
  worker.fetch!(new Request("https://gym.example.com/api/login", { method: "POST", headers: { "cf-connecting-ip": ip }, body: raw ?? JSON.stringify({ password }) }) as never, env, ctx);

describe("password sign-in", () => {
  it("compares passwords without length or prefix leaks", async () => {
    expect(await passwordMatches("abc", "abc")).toBe(true);
    expect(await passwordMatches("ab", "abc")).toBe(false);
    expect(await passwordMatches("", "abc")).toBe(false);
  });

  it("answers malformed bodies with 401, not a 500", async () => {
    expect((await login(undefined, "198.51.100.9", "not json")).status).toBe(401);
    expect((await login(12345, "198.51.100.9")).status).toBe(401);
  });

  it("locks an address out after too many wrong passwords, without affecting others", async () => {
    const [max] = LOGIN_LIMITS.ip;
    for (let i = 0; i < max; i++) expect((await login("guess" + i, "203.0.113.1")).status).toBe(401);
    const blocked = await login("correct horse battery staple", "203.0.113.1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // the owner elsewhere still gets in, and a success clears that address's count
    const ok = await login("correct horse battery staple", "203.0.113.2");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^ht_session=/);
  });
});
