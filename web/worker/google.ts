// Google sign-in, done by the app itself (OpenID Connect, authorization-code flow with PKCE).
// For a custom domain Cloudflare Access can't cover (e.g. DNS hosted elsewhere, served through
// ../gym-proxy), or for self-hosting. Access on workers.dev keeps working alongside it.
//
// Flow: /auth/login → Google → /auth/callback?code&state → exchange code (with the PKCE verifier
// and client secret) → verify the ID token (Google's JWKS, issuer, audience, expiry, verified
// email on the allow-list) → set the signed session cookie.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const FLOW_COOKIE = "ht_oauth";
const FLOW_TTL = 600;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
}

function eq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  allowed: string[];
}

/** Only same-site paths: "/x" yes; "//host", "/\\host", "https://…" no. */
export const safePath = (p: string) => (/^\/(?![\/\\])/.test(p) ? p : "/");

/** Start sign-in: remember state + PKCE verifier in a short-lived signed cookie, then go to Google. */
export async function loginRedirect(cfg: GoogleConfig, origin: string, returnTo = "/"): Promise<Response> {
  const state = random(16), verifier = random(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
  const exp = Math.floor(Date.now() / 1000) + FLOW_TTL;
  const payload = `${state}.${verifier}.${exp}.${b64url(enc.encode(safePath(returnTo)))}`;
  const cookie = `${FLOW_COOKIE}=${payload}.${await hmac(cfg.sessionSecret, payload)}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${FLOW_TTL}`;
  const q = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: `${origin}/auth/callback`, response_type: "code", scope: "openid email",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
    ...(cfg.allowed.length === 1 ? { login_hint: cfg.allowed[0] } : {}),
  });
  return new Response(null, { status: 302, headers: { location: `${AUTH}?${q}`, "set-cookie": cookie } });
}

async function readFlow(req: Request, secret: string): Promise<{ state: string; verifier: string; returnTo: string } | null> {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`${FLOW_COOKIE}=([^;]+)`));
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 5) return null;
  const [state, verifier, exp, ret, sig] = parts;
  if (!eq(sig, await hmac(secret, `${state}.${verifier}.${exp}.${ret}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return { state, verifier, returnTo: safePath(new TextDecoder().decode(fromB64url(ret))) };
}

let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;

/** Verify a Google ID token; returns the email when it's valid and allowed. */
export async function verifyIdToken(token: string, clientId: string, allowed: string[], fetchJwks: () => Promise<{ keys: (JsonWebKey & { kid?: string })[] }> = () => fetch(JWKS).then((r) => r.json())): Promise<string> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");
  const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  if (header.alg !== "RS256") throw new Error("unexpected alg");
  if (!jwksCache || Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => (k as { kid?: string }).kid === header.kid)) {
    jwksCache = { at: Date.now(), keys: (await fetchJwks()).keys };
  }
  const jwk = jwksCache.keys.find((k) => (k as { kid?: string }).kid === header.kid);
  if (!jwk) throw new Error("unknown signing key");
  const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(s), enc.encode(`${h}.${p}`)))) throw new Error("bad signature");
  if (!ISSUERS.includes(claims.iss)) throw new Error("bad issuer");
  const auds: string[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(clientId)) throw new Error("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() - 60_000) throw new Error("expired");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("email not verified");
  const email = String(claims.email ?? "").toLowerCase();
  if (!allowed.includes(email)) throw new Error(`${email || "that account"} isn't allowed`);
  return email;
}

/** Finish sign-in. Returns the redirect plus the email to start a session for. */
export async function handleCallback(cfg: GoogleConfig, req: Request): Promise<{ email: string; returnTo: string }> {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) throw new Error(`Google: ${url.searchParams.get("error")}`);
  const flow = await readFlow(req, cfg.sessionSecret);
  if (!flow || !eq(flow.state, url.searchParams.get("state") ?? "")) throw new Error("Sign-in expired or was started elsewhere. Try again.");
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "", client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: `${url.origin}/auth/callback`, grant_type: "authorization_code", code_verifier: flow.verifier,
    }),
  });
  const j = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.id_token) throw new Error(`Google token exchange failed: ${j.error_description ?? j.error ?? res.status}`);
  return { email: await verifyIdToken(j.id_token, cfg.clientId, cfg.allowed), returnTo: flow.returnTo };
}

export const clearFlowCookie = `${FLOW_COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
