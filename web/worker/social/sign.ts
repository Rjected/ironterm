// Ed25519 request signing between Ironterm servers and the directory (docs/social/PROTOCOL.md §2).
// WebCrypto only, so the same code runs in Workers, Node 22 and the directory.

export const SKEW_S = 300;
export const SIG_HEADER = "Ironterm-Signature";

const enc = new TextEncoder();

export function b64url(b: Uint8Array | ArrayBuffer): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const hex = (b: ArrayBuffer | Uint8Array) => [...(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (data: string | Uint8Array<ArrayBuffer>) => hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));

/** Friend.id: first 12 hex chars of sha256(server origin). */
export const friendId = async (origin: string) => (await sha256hex(origin)).slice(0, 12);

/** Human-checkable key fingerprint: first 16 hex chars of sha256(raw key), in groups of 4. */
export async function fingerprint(publicKey: string): Promise<string> {
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = unb64url(publicKey); } catch { return ""; }
  return (await sha256hex(raw)).slice(0, 16).match(/.{4}/g)!.join("-");
}

export interface KeyPair { publicKey: string; privateJwk: JsonWebKey }

export async function generateKeyPair(): Promise<KeyPair> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return { publicKey: b64url(raw), privateJwk: jwk };
}

export const importPrivate = (jwk: JsonWebKey) => crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);

/** "https://a.example" from anything URL-shaped; null when it isn't an http(s) origin. */
export function normOrigin(s: string | null | undefined, allowHttp: boolean): string | null {
  if (!s || typeof s !== "string" || s.length > 300) return null;
  let u: URL;
  try { u = new URL(s.includes("://") ? s : `https://${s}`); } catch { return null; }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

export function signingString(method: string, pathAndQuery: string, target: string, ts: number | string, bodyHash: string): string {
  return ["ironterm-v1", method.toUpperCase(), pathAndQuery, target, String(ts), bodyHash].join("\n");
}

/** Header value for a request from `server` to `url`. */
export async function signRequest(opts: { key: CryptoKey; server: string; method: string; url: string; body?: string; now?: number }): Promise<string> {
  const u = new URL(opts.url);
  const ts = Math.floor((opts.now ?? Date.now()) / 1000);
  const msg = signingString(opts.method, u.pathname + u.search, u.origin, ts, await sha256hex(opts.body ?? ""));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, opts.key, enc.encode(msg));
  return `server="${opts.server}", ts="${ts}", sig="${b64url(sig)}"`;
}

export interface ParsedSig { server: string; ts: number; sig: string }

export function parseSigHeader(h: string | null): ParsedSig | null {
  if (!h || h.length > 1000) return null;
  const out: Record<string, string> = {};
  for (const m of h.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  if (!out.server || !out.ts || !out.sig || !/^\d{1,12}$/.test(out.ts)) return null;
  return { server: out.server, ts: Number(out.ts), sig: out.sig };
}

export async function verifySig(publicKey: string, msg: string, sig: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", unb64url(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, unb64url(sig), enc.encode(msg));
  } catch {
    return false;
  }
}

/**
 * Checks everything but the key: header shape, clock skew and target origin. `self` is the
 * receiver's canonical origin. Returns the claimed sender so the caller can pick a key, then call
 * `verifyRequest`.
 */
export function precheck(req: Request, self: string, allowHttp: boolean, now = Date.now()): { ok: true; parsed: ParsedSig; server: string } | { ok: false; status: 401; error: string } {
  const p = parseSigHeader(req.headers.get(SIG_HEADER));
  if (!p) return { ok: false, status: 401, error: "missing or malformed signature" };
  const server = normOrigin(p.server, allowHttp);
  if (!server || server !== p.server) return { ok: false, status: 401, error: "bad sender origin" };
  if (Math.abs(now / 1000 - p.ts) > SKEW_S) return { ok: false, status: 401, error: "timestamp outside the allowed window" };
  return { ok: true, parsed: p, server };
}

/** Full check with the sender's key. `rawBody` is the exact body text ("" for none). */
export async function verifyRequest(req: Request, rawBody: string, self: string, publicKey: string, parsed: ParsedSig): Promise<boolean> {
  const u = new URL(req.url);
  const msg = signingString(req.method, u.pathname + u.search, self, parsed.ts, await sha256hex(rawBody));
  return verifySig(publicKey, msg, parsed.sig);
}
