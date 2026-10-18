import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeD1 } from "../server/d1";
import { generateKeyPair, importPrivate, SIG_HEADER, signRequest } from "../worker/social/sign";
import directory, { LIMITS } from "./worker";

const DIR = "https://dir.example";
const servers = new Map<string, { publicKey: string; key: CryptoKey; serve?: string }>();
const realFetch = globalThis.fetch;
let env: { DB: NodeD1; SOCIAL_ALLOW_HTTP?: string };

async function server(origin: string) {
  const kp = await generateKeyPair();
  const s = { publicKey: kp.publicKey, key: await importPrivate(kp.privateJwk) };
  servers.set(origin, s);
  return s;
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(new Request(input as RequestInfo, init).url);
    const s = servers.get(u.origin);
    if (!s || u.pathname !== "/.well-known/ironterm") throw new TypeError("fetch failed");
    return Response.json({ v: 1, server: u.origin, handle: null, name: null, publicKey: s.serve ?? s.publicKey, directory: null, software: "ironterm" });
  });
});
afterAll(() => { vi.stubGlobal("fetch", realFetch); vi.unstubAllGlobals(); });

let ipN = 0;
async function req(method: string, path: string, opts: { body?: unknown; as?: string; signer?: string; ip?: string; now?: number } = {}) {
  const url = `${DIR}${path}`;
  const text = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers: Record<string, string> = { "cf-connecting-ip": opts.ip ?? `10.0.0.${++ipN % 250}` };
  if (opts.as) {
    const s = servers.get(opts.signer ?? opts.as)!;
    headers[SIG_HEADER] = await signRequest({ key: s.key, server: opts.as, method, url, body: text ?? "", now: opts.now });
  }
  const r = await directory.fetch(new Request(url, { method, headers, body: text }) as never, env as never);
  return { status: r.status, data: (await r.json()) as any };
}
const reg = (origin: string, handle: string, extra: Record<string, unknown> = {}) =>
  req("POST", "/v1/register", { as: origin, body: { handle, name: handle.toUpperCase(), server: origin, publicKey: servers.get(origin)!.publicKey, listed: true, ...extra } });

describe("directory (§3)", () => {
  beforeAll(async () => {
    env = { DB: new NodeD1(":memory:") };
    for (const o of ["https://a.example", "https://b.example", "https://c.example", "http://h.example"]) await server(o);
  });

  it("registers a signed, verified handle and serves it", async () => {
    expect((await reg("https://a.example", "sam")).data).toEqual({ ok: true, handle: "sam" });
    const u = (await req("GET", "/v1/users/sam")).data;
    expect(u).toMatchObject({ handle: "sam", name: "SAM", server: "https://a.example", publicKey: servers.get("https://a.example")!.publicKey });
    expect(u.updatedAt).toBeTruthy();
    expect((await req("GET", "/v1/users/SAM")).status).toBe(200);
    expect((await req("GET", "/v1/users/nobody")).status).toBe(404);
  });

  it("enforces the handle rules", async () => {
    for (const h of ["a", "-sam", "Sam", "sam!", "x".repeat(31), "_x"]) expect((await reg("https://b.example", h)).status).toBe(400);
    expect((await reg("https://b.example", "ok_handle-2")).status).toBe(200);
  });

  it("refuses unsigned, mis-signed, stale and mismatched registrations", async () => {
    const body = { handle: "bee", name: "B", server: "https://b.example", publicKey: servers.get("https://b.example")!.publicKey, listed: true };
    expect((await req("POST", "/v1/register", { body })).status).toBe(401);
    // signed by another key than the one in the body
    expect((await req("POST", "/v1/register", { body, as: "https://b.example", signer: "https://c.example" })).status).toBe(401);
    // signed as one server, registering another
    expect((await req("POST", "/v1/register", { body: { ...body, server: "https://c.example" }, as: "https://b.example" })).status).toBe(401);
    expect((await req("POST", "/v1/register", { body, as: "https://b.example", now: Date.now() - 400_000 })).status).toBe(401);
    // the server's .well-known serves another key: no proof it controls the origin
    servers.get("https://b.example")!.serve = servers.get("https://c.example")!.publicKey;
    expect((await req("POST", "/v1/register", { body, as: "https://b.example" })).status).toBe(403);
    delete servers.get("https://b.example")!.serve;
  });

  it("refuses a takeover by another key; the owner can update and rename", async () => {
    expect((await reg("https://c.example", "sam")).status).toBe(409);
    expect((await reg("https://a.example", "sam", { name: "Samuel", listed: false })).status).toBe(200);
    expect((await req("GET", "/v1/users/sam")).data.name).toBe("Samuel");
    // one handle per key: a new handle releases the old one
    expect((await reg("https://a.example", "sammy")).status).toBe(200);
    expect((await req("GET", "/v1/users/sam")).status).toBe(404);
    expect((await reg("https://c.example", "sam")).status).toBe(200);
  });

  it("http servers only with SOCIAL_ALLOW_HTTP", async () => {
    expect((await reg("http://h.example", "hhh")).status).toBe(401);
    env.SOCIAL_ALLOW_HTTP = "1";
    expect((await reg("http://h.example", "hhh")).status).toBe(200);
    delete env.SOCIAL_ALLOW_HTTP;
  });

  it("searches listed users by handle or name prefix", async () => {
    expect((await req("GET", "/v1/search?q=d")).status).toBe(400);
    const r = (await req("GET", "/v1/search?q=SA")).data;
    expect(r.users.map((u: { handle: string }) => u.handle)).toEqual(["sam", "sammy"]);
    expect(Object.keys(r.users[0]).sort()).toEqual(["handle", "name", "server"]);
    await reg("https://a.example", "sammy", { listed: false });
    expect((await req("GET", "/v1/search?q=sa")).data.users.map((u: { handle: string }) => u.handle)).toEqual(["sam"]);
    // wildcards are literal
    expect((await req("GET", "/v1/search?q=%25%25")).data.users).toEqual([]);
  });

  it("deletes only with the same key", async () => {
    expect((await req("DELETE", "/v1/users/sammy", { as: "https://c.example" })).status).toBe(401);
    expect((await req("DELETE", "/v1/users/sammy")).status).toBe(401);
    expect((await req("DELETE", "/v1/users/sammy", { as: "https://a.example" })).status).toBe(200);
    expect((await req("GET", "/v1/users/sammy")).status).toBe(404);
  });

  it("rate-limits per client", async () => {
    const [max] = LIMITS.search;
    let last = 0;
    for (let i = 0; i <= max; i++) last = (await req("GET", "/v1/search?q=sa", { ip: "192.0.2.1" })).status;
    expect(last).toBe(429);
    expect((await req("GET", "/v1/search?q=sa", { ip: "192.0.2.2" })).status).toBe(200);
  });
});
