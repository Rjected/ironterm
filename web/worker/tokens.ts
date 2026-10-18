// Long-lived app tokens for the native apps and widgets (they can't do the browser's Google
// sign-in). Created from SETUP → APPS in the web app, shown once, stored only as a SHA-256 hash.
// A token works as `Authorization: Bearer ht_…` on the API, and POST /auth/app turns one into a
// normal session cookie for the app's embedded web view.

import { kvGet, kvPut } from "./store";

export interface AppToken { id: string; name: string; hash: string; created: string; lastUsed: string | null }
const KEY = "apptokens";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const listTokens = async (db: D1Database) => ((await kvGet<AppToken[]>(db, KEY)) ?? []).map(({ hash: _h, ...t }) => t);

export async function createToken(db: D1Database, name: string): Promise<{ id: string; name: string; token: string }> {
  const token = `ht_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  const id = b64url(crypto.getRandomValues(new Uint8Array(6)));
  const all = (await kvGet<AppToken[]>(db, KEY)) ?? [];
  const clean = (name || "App").slice(0, 40);
  all.push({ id, name: clean, hash: await sha(token), created: new Date().toISOString(), lastUsed: null });
  await kvPut(db, KEY, all);
  return { id, name: clean, token };
}

export async function revokeToken(db: D1Database, id: string): Promise<boolean> {
  const all = (await kvGet<AppToken[]>(db, KEY)) ?? [];
  const next = all.filter((t) => t.id !== id);
  await kvPut(db, KEY, next);
  return next.length !== all.length;
}

/** Valid token → its record (lastUsed refreshed at most hourly). */
export async function checkToken(db: D1Database, token: string | null | undefined): Promise<AppToken | null> {
  if (!token || !token.startsWith("ht_") || token.length > 100) return null;
  const all = (await kvGet<AppToken[]>(db, KEY)) ?? [];
  if (!all.length) return null;
  const h = await sha(token);
  const t = all.find((x) => x.hash === h);
  if (!t) return null;
  if (!t.lastUsed || Date.now() - Date.parse(t.lastUsed) > 3600_000) { t.lastUsed = new Date().toISOString(); await kvPut(db, KEY, all); }
  return t;
}

export const bearer = (req: Request) => req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
