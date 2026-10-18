// Security headers. The page and its assets get them from public/_headers on Workers (Workers
// Assets serves those files before the worker runs) and from server/main.ts on Node; worker
// responses (API, auth, social) get them in index.ts. headers.test.ts keeps _headers in step.
//
// The app is all same-origin: one module script, one stylesheet, self-hosted fonts, inline SVG.
// Preact sets `style` through the CSSOM, which style-src doesn't restrict, so no 'unsafe-inline'.

export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** For JSON and other non-page responses: nothing may load, nothing may frame it. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Everywhere. HSTS is ignored by browsers over plain http (localhost), so it's safe to always send. */
export const COMMON_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
};

export const PAGE_HEADERS: Record<string, string> = { ...COMMON_HEADERS, "content-security-policy": APP_CSP };

/** A copy of `r` with the security headers added (existing ones win, e.g. a page's own CSP). */
export function withSecurityHeaders(r: Response, base: Record<string, string> = { ...COMMON_HEADERS, "content-security-policy": API_CSP }): Response {
  const out = new Response(r.body, r); // Response.redirect() headers are immutable; a copy isn't
  for (const [k, v] of Object.entries(base)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
