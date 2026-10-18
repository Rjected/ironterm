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
let certCache: { at: number; domain: string; keys: Jwk[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

type CertFetch = (teamDomain: string) => Promise<{ keys: Jwk[] }>;
const fetchCerts: CertFetch = (teamDomain) => fetch(`https://${teamDomain}/cdn-cgi/access/certs`).then((r) => r.json() as Promise<{ keys: Jwk[] }>);

/** Email (or "service") for a valid Access JWT whose audience, issuer and expiry check out; else null. */
export async function verifyAccess(req: Request, teamDomain: string, aud: string, allowed: string[], getCerts: CertFetch = fetchCerts): Promise<string | null> {
  const token = req.headers.get("cf-access-jwt-assertion") ?? (req.headers.get("cookie") ?? "").match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token || token.length > 8192) return null;
  const [h, p, s, extra] = token.split(".");
  if (!h || !p || !s || extra !== undefined) return null;
  let header: { alg?: unknown; kid?: unknown }, payload: { aud?: unknown; exp?: unknown; nbf?: unknown; iss?: unknown; email?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(h)));
    payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  } catch { return null; }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  // Refresh hourly, and at once for a key we haven't seen (Access rotated its keys).
  if (!certCache || certCache.domain !== teamDomain || Date.now() - certCache.at > 3600_000 || (!certCache.keys.some((k) => k.kid === header.kid) && Date.now() - certCache.at > 60_000)) {
    certCache = { at: Date.now(), domain: teamDomain, keys: (await getCerts(teamDomain)).keys ?? [] };
  }
  const jwk = certCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true } as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  let sig: ReturnType<typeof b64url>;
  try { sig = b64url(s); } catch { return null; }
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(`${h}.${p}`)))) return null;
  const now = Date.now() / 1000;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;
  if (payload.iss !== `https://${teamDomain}`) return null;
  const email = String(payload.email ?? "").toLowerCase();
  if (allowed.length && !allowed.includes(email)) return null;
  return email || "service";
}

/** tests */
export const resetAccessCerts = () => { certCache = null; };
