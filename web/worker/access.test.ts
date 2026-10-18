import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccessCerts, verifyAccess } from "./auth";

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-tag";

async function keypair(kid: string) {
  const kp = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid } as { kid: string; kty: string; n: string; e: string };
  const sign = async (claims: object, header: object = { alg: "RS256", kid }) => {
    const h = b64url(enc.encode(JSON.stringify(header)));
    const p = b64url(enc.encode(JSON.stringify(claims)));
    const s = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, enc.encode(`${h}.${p}`)));
    return `${h}.${p}.${b64url(s)}`;
  };
  return { jwk, sign };
}

const good = () => ({ iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email: "Me@Example.com" });
const req = (token: string) => new Request("https://app.example/api/bootstrap", { headers: { "cf-access-jwt-assertion": token } });

describe("verifyAccess (Cloudflare Access JWT)", () => {
  beforeEach(() => resetAccessCerts());
  afterEach(() => vi.useRealTimers());

  it("accepts a valid token for an allowed email", async () => {
    const k = await keypair("a");
    expect(await verifyAccess(req(await k.sign(good())), TEAM, AUD, ["me@example.com"], async () => ({ keys: [k.jwk] }))).toBe("me@example.com");
  });

  it("rejects missing or bad exp, wrong issuer, wrong audience, future nbf, other emails", async () => {
    const k = await keypair("a");
    const certs = async () => ({ keys: [k.jwk] });
    const check = async (c: object) => verifyAccess(req(await k.sign({ ...good(), ...c })), TEAM, AUD, ["me@example.com"], certs);
    expect(await check({ exp: undefined })).toBeNull();
    expect(await check({ exp: "9999999999" })).toBeNull();
    expect(await check({ exp: Math.floor(Date.now() / 1000) - 5 })).toBeNull();
    expect(await check({ iss: "https://evil.cloudflareaccess.com" })).toBeNull();
    expect(await check({ aud: ["other"] })).toBeNull();
    expect(await check({ nbf: Math.floor(Date.now() / 1000) + 3600 })).toBeNull();
    expect(await check({ email: "someone@else.com" })).toBeNull();
  });

  it("rejects other algorithms, forged signatures and garbage without throwing", async () => {
    const k = await keypair("a");
    const certs = async () => ({ keys: [k.jwk] });
    expect(await verifyAccess(req(await k.sign(good(), { alg: "none", kid: "a" })), TEAM, AUD, [], certs)).toBeNull();
    const t = await k.sign(good());
    const forged = t.split(".").slice(0, 2).join(".") + "." + b64url(new Uint8Array(256));
    expect(await verifyAccess(req(forged), TEAM, AUD, [], certs)).toBeNull();
    for (const g of ["x", "a.b.c", "!!.??.**", `${t}.extra`]) expect(await verifyAccess(req(g), TEAM, AUD, [], certs)).toBeNull();
  });

  it("refetches the certs when Access rotates to a new key", async () => {
    const old = await keypair("old"), next = await keypair("new");
    let keys = [old.jwk];
    let fetches = 0;
    const certs = async () => { fetches++; return { keys }; };
    expect(await verifyAccess(req(await old.sign(good())), TEAM, AUD, [], certs)).toBe("me@example.com");
    keys = [next.jwk];
    // within the first minute an unknown kid doesn't hammer the certs endpoint
    expect(await verifyAccess(req(await next.sign(good())), TEAM, AUD, [], certs)).toBeNull();
    expect(fetches).toBe(1);
    // after that, an unknown kid triggers a refetch rather than waiting out the hour
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(await verifyAccess(req(await next.sign(good())), TEAM, AUD, [], certs)).toBe("me@example.com");
    expect(fetches).toBe(2);
  });
});
