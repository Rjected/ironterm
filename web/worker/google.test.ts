import { describe, expect, it } from "vitest";
import { loginRedirect, verifyIdToken } from "./google";

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const CLIENT = "client.apps.googleusercontent.com";

let n = 0;
async function setup() {
  const kid = `k${++n}`;
  const kp = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid } as JsonWebKey & { kid: string };
  const sign = async (claims: object) => {
    const h = b64url(enc.encode(JSON.stringify({ alg: "RS256", kid })));
    const p = b64url(enc.encode(JSON.stringify(claims)));
    const s = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, enc.encode(`${h}.${p}`)));
    return `${h}.${p}.${b64url(s)}`;
  };
  return { sign, jwks: async () => ({ keys: [jwk] }) };
}
const good = () => ({ iss: "https://accounts.google.com", aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, email: "Me@Example.com", email_verified: true });

describe("verifyIdToken", () => {
  it("accepts a valid token for an allowed email", async () => {
    const { sign, jwks } = await setup();
    expect(await verifyIdToken(await sign(good()), CLIENT, ["me@example.com"], jwks)).toBe("me@example.com");
  });
  it("rejects other accounts, audiences, issuers, expiry, unverified email", async () => {
    const { sign, jwks } = await setup();
    const bad = async (c: object) => verifyIdToken(await sign({ ...good(), ...c }), CLIENT, ["me@example.com"], jwks);
    await expect(bad({ email: "else@example.com" })).rejects.toThrow(/isn't allowed/);
    await expect(bad({ aud: "other" })).rejects.toThrow(/audience/);
    await expect(bad({ iss: "https://evil" })).rejects.toThrow(/issuer/);
    await expect(bad({ exp: 1000 })).rejects.toThrow(/expired/);
    await expect(bad({ email_verified: false })).rejects.toThrow(/verified/);
  });
  it("rejects a tampered signature", async () => {
    const { sign, jwks } = await setup();
    const [h, , s] = (await sign(good())).split(".");
    const forged = b64url(enc.encode(JSON.stringify({ ...good(), email: "me@example.com" , aud: CLIENT, extra: 1 })));
    await expect(verifyIdToken(`${h}.${forged}.${s}`, CLIENT, ["me@example.com"], jwks)).rejects.toThrow(/signature/);
  });
});

describe("loginRedirect", () => {
  it("sends to Google with PKCE and a signed flow cookie", async () => {
    const res = await loginRedirect({ clientId: CLIENT, clientSecret: "x", sessionSecret: "s", allowed: ["me@example.com"] }, "https://gym.example.com", "//evil.com");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("redirect_uri")).toBe("https://gym.example.com/auth/callback");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^ht_oauth=.*HttpOnly; Secure; SameSite=Lax/);
    // protocol-relative return paths fall back to "/"
    const ret = cookie.split("=")[1].split(".")[3];
    expect(atob(ret.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (ret.length % 4)) % 4))).toBe("/");
  });
});
