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

/** Password check that leaks neither the password's length nor where a guess first differs. */
export async function passwordMatches(guess: string, password: string): Promise<boolean> {
  const h = async (x: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
  const [a, b] = await Promise.all([h(guess), h(password)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/**
 * Who a session belongs to: OWNER for a real sign-in (Google, password), or `t<id>` when an app
 * token was traded for it (/auth/app), so revoking the token also ends the sessions it made.
 */
export const OWNER = "o";
const SUB_RE = /^(o|t[\w-]{1,40})$/;

export async function sessionCookie(secret: string, sub: string = OWNER): Promise<string> {
  if (!SUB_RE.test(sub)) throw new Error("bad session subject");
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return `${COOKIE}=${exp}.${sub}.${await hmac(secret, `${exp}.${sub}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * The session's subject (OWNER or `t<token id>`) when the cookie is valid and unexpired, else null.
 * Cookies from before subjects existed (`exp.sig`) no longer verify: one fresh sign-in.
 */
export async function sessionSubject(req: Request, secret: string): Promise<string | null> {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d{1,12})\\.(o|t[\\w-]{1,40})\\.([\\w-]{20,100})(?:;|$)`));
  if (!m) return null;
  if (Number(m[1]) < Date.now() / 1000) return null;
  return safeEqual(m[3], await hmac(secret, `${m[1]}.${m[2]}`)) ? m[2] : null;
}

// ───────── CSRF ─────────
// Cookies (our session, Cloudflare Access's CF_Authorization) ride along on same-site requests,
// and with no login on localhost there's no cookie at all to stop any page from POSTing
// text/plain JSON at us. So a state-changing request must come from our own pages: judged by
// Sec-Fetch-Site (every current browser) or, failing that, Origin. A request with neither isn't
// from a browser page (curl, the apps). Bearer-token requests carry no ambient credential.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** null when the request may proceed, else why not. `origins`: this app's own origins. */
export function csrfBlock(req: Request, origins: string[]): string | null {
  if (SAFE_METHODS.has(req.method)) return null;
  if (/^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? "")) return null;
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none" ? null : `cross-site request (${site})`;
  const origin = req.headers.get("origin");
  if (origin) return origins.includes(origin) ? null : "cross-origin request";
  return null;
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
