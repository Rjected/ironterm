// Optional password gate. If APP_PASSWORD is unset the API is open, which is fine behind
// Cloudflare Access (recommended) or on localhost. The UI shows a warning when nothing is set.

const COOKIE = "ht_session";
const TTL = 60 * 60 * 24 * 30;

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function sessionCookie(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return `${COOKIE}=${exp}.${await hmac(secret, String(exp))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function isAuthed(req: Request, secret: string): Promise<boolean> {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`${COOKIE}=(\\d+)\\.([\\w-]+)`));
  if (!m) return false;
  if (Number(m[1]) < Date.now() / 1000) return false;
  return safeEqual(m[2], await hmac(secret, m[1]));
}

// ───────── Cloudflare Access (Google login in front of the app) ─────────
// Access signs every request with a JWT. Verifying it here means a request that skips Access
// (e.g. a stray *.workers.dev URL) still gets rejected.

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let certCache: { at: number; keys: Jwk[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function verifyAccess(req: Request, teamDomain: string, aud: string, allowed: string[]): Promise<string | null> {
  const token = req.headers.get("cf-access-jwt-assertion") ?? (req.headers.get("cookie") ?? "").match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (!certCache || Date.now() - certCache.at > 3600_000) {
    const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    certCache = { at: Date.now(), keys: ((await r.json()) as { keys: Jwk[] }).keys };
  }
  const jwk = certCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true } as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const auds: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud) || payload.exp * 1000 < Date.now()) return null;
  const email = String(payload.email ?? "").toLowerCase();
  if (allowed.length && !allowed.includes(email)) return null;
  return email || "service";
}
