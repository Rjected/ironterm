// Session cookies: signed subject, and sessions made from an app token end when the token is revoked.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import { OWNER, sessionCookie, sessionSubject } from "./auth";

const SECRET = "test-session-secret";
const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York", APP_PASSWORD: "pw", SESSION_SECRET: SECRET } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;
const BASE = "https://gym.example.com";

const cookieOf = (setCookie: string) => setCookie.split(";")[0];
const fetchW = (path: string, init: RequestInit = {}) => worker.fetch!(new Request(BASE + path, init) as never, env, ctx);

describe("session cookies", () => {
  it("round-trips the subject and rejects tampering", async () => {
    const c = cookieOf(await sessionCookie(SECRET));
    const req = (cookie: string) => new Request(BASE, { headers: { cookie } });
    expect(await sessionSubject(req(c), SECRET)).toBe(OWNER);
    expect(await sessionSubject(req(c), "other-secret")).toBeNull();
    // swapping the subject breaks the signature
    expect(await sessionSubject(req(c.replace(".o.", ".tabc.")), SECRET)).toBeNull();
    const t = cookieOf(await sessionCookie(SECRET, "tAbC_-1"));
    expect(await sessionSubject(req(`x=1; ${t}; y=2`), SECRET)).toBe("tAbC_-1");
  });

  it("refuses old-format and expired cookies", async () => {
    const req = (cookie: string) => new Request(BASE, { headers: { cookie } });
    expect(await sessionSubject(req("ht_session=9999999999.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"), SECRET)).toBeNull();
    const c = cookieOf(await sessionCookie(SECRET)).replace(/=\d+\./, "=1000.");
    expect(await sessionSubject(req(c), SECRET)).toBeNull();
    await expect(sessionCookie(SECRET, "o.x")).rejects.toThrow();
  });

  it("a session traded for an app token dies when the token is revoked", async () => {
    // owner signs in with the password and creates an app token
    const login = await fetchW("/api/login", { method: "POST", body: JSON.stringify({ password: "pw" }) });
    const owner = cookieOf(login.headers.get("set-cookie")!);
    const created = await (await fetchW("/api/tokens", { method: "POST", headers: { cookie: owner }, body: JSON.stringify({ name: "phone" }) })).json() as { id: string; token: string };

    // the app trades it for a web session
    const form = new FormData();
    form.set("token", created.token);
    const traded = await fetchW("/auth/app", { method: "POST", body: form });
    expect(traded.status).toBe(302);
    const appSession = cookieOf(traded.headers.get("set-cookie")!);
    expect(appSession).toContain(`.t${created.id}.`);
    expect((await fetchW("/api/bootstrap", { headers: { cookie: appSession } })).status).toBe(200);

    // revoke the token: its session stops working, the owner's doesn't
    expect((await fetchW(`/api/tokens/${created.id}`, { method: "DELETE", headers: { cookie: owner } })).status).toBe(200);
    expect((await fetchW("/api/bootstrap", { headers: { cookie: appSession } })).status).toBe(401);
    expect((await fetchW("/api/bootstrap", { headers: { cookie: owner } })).status).toBe(200);
  });
});
