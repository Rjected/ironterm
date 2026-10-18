// Ironterm social directory (docs/social/PROTOCOL.md §3): the only central piece. It maps a handle
// to a server origin and public key, and stores nothing else: no workouts, no friend lists.
// Runs as a Cloudflare Worker with D1 (wrangler.directory.example.jsonc) or on Node with SQLite
// (server/directory.ts).

import { fetchWellKnown, readLimited } from "../worker/social/net";
import { normOrigin, precheck, unb64url, verifyRequest } from "../worker/social/sign";
import { HANDLE_RE } from "../worker/social/types";

export interface DirEnv {
  DB: D1Database;
  /** public origin when requests arrive under another URL */
  DIRECTORY_ORIGIN?: string;
  /** "1": accept http:// servers (local testing only) */
  SOCIAL_ALLOW_HTTP?: string;
}

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (handle TEXT PRIMARY KEY, name TEXT, server TEXT NOT NULL, public_key TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS users_key ON users(public_key)",
  "CREATE INDEX IF NOT EXISTS users_name ON users(lower(name))",
  "CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL)",
];
const ready = new WeakMap<object, Promise<unknown>>();
const ensure = (db: D1Database) => { let p = ready.get(db); if (!p) ready.set(db, (p = db.batch(SCHEMA.map((s) => db.prepare(s))))); return p; };

/** per client IP: [requests, window seconds] */
export const LIMITS = { write: [20, 3600], search: [60, 60], lookup: [240, 60] } as const;
const MAX_BODY = 4096;

interface UserRow { handle: string; name: string | null; server: string; public_key: string; listed: number; created_at: string; updated_at: string }

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra } });
const err = (status: number, error: string) => json({ error }, status);

async function limited(db: D1Database, ip: string, kind: keyof typeof LIMITS): Promise<boolean> {
  const [max, win] = LIMITS[kind];
  const now = Math.floor(Date.now() / 1000);
  const key = `${kind}:${ip}`;
  const row = await db.prepare("SELECT count, reset FROM rate WHERE key = ?").bind(key).first<{ count: number; reset: number }>();
  if (!row || row.reset <= now) {
    await db.prepare("INSERT INTO rate (key, count, reset) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset = excluded.reset").bind(key, now + win).run();
    if (Math.random() < 0.01) await db.prepare("DELETE FROM rate WHERE reset <= ?").bind(now).run();
    return false;
  }
  if (row.count >= max) return true;
  await db.prepare("UPDATE rate SET count = count + 1 WHERE key = ?").bind(key).run();
  return false;
}

const isKey = (k: unknown): k is string => {
  if (typeof k !== "string" || k.length > 60) return false;
  try { return unb64url(k).length === 32; } catch { return false; }
};

const out = (u: UserRow) => ({ handle: u.handle, name: u.name, server: u.server, publicKey: u.public_key, updatedAt: u.updated_at });

export async function handleDirectory(req: Request, env: DirEnv): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const db = env.DB;
  const http = env.SOCIAL_ALLOW_HTTP === "1" || env.SOCIAL_ALLOW_HTTP === "true";
  const self = (env.DIRECTORY_ORIGIN && normOrigin(env.DIRECTORY_ORIGIN, true)) || url.origin;
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  await ensure(db);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "access-control-max-age": "86400" } });
  if (path === "/" && req.method === "GET") return json({ software: "ironterm-directory", v: 1, stores: ["handle", "name", "server", "publicKey", "listed", "timestamps"] });

  if (path === "/v1/register" && req.method === "POST") {
    if (await limited(db, ip, "write")) return err(429, "too many requests");
    let raw: string;
    try { raw = await readLimited(req, MAX_BODY); } catch { return err(400, "body too large"); }
    const pre = precheck(req, self, http);
    if (!pre.ok) return err(pre.status, pre.error);
    let b: { handle?: unknown; name?: unknown; server?: unknown; publicKey?: unknown; listed?: unknown };
    try { b = JSON.parse(raw); } catch { return err(400, "malformed body"); }
    const handle = typeof b.handle === "string" ? b.handle : "";
    if (!HANDLE_RE.test(handle)) return err(400, "handle must match ^[a-z0-9][a-z0-9_-]{1,29}$");
    if (b.name != null && (typeof b.name !== "string" || b.name.length > 60)) return err(400, "name: up to 60 characters");
    if (!isKey(b.publicKey)) return err(400, "publicKey: base64url raw 32-byte Ed25519 key");
    const server = normOrigin(typeof b.server === "string" ? b.server : "", http);
    if (!server || server !== b.server) return err(400, http ? "server must be an origin" : "server must be an https origin");
    if (server !== pre.server) return err(401, "signature is from another server");
    if (!(await verifyRequest(req, raw, self, b.publicKey, pre.parsed))) return err(401, "bad signature");
    const existing = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first<UserRow>();
    if (existing && existing.public_key !== b.publicKey) return err(409, "handle taken");
    // Prove the server controls its origin: it must serve the same key.
    let wk;
    try { wk = await fetchWellKnown(server); } catch (e) { return err(400, `couldn't verify ${server}: ${(e as Error).message}`); }
    if (wk.publicKey !== b.publicKey) return err(403, "the server's .well-known/ironterm serves a different key");
    const now = new Date().toISOString();
    const name = typeof b.name === "string" ? b.name.trim() || null : null;
    await db.batch([
      // one handle per key: registering a new handle releases the old one
      db.prepare("DELETE FROM users WHERE public_key = ? AND handle != ?").bind(b.publicKey, handle),
      db.prepare("INSERT INTO users (handle, name, server, public_key, listed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(handle) DO UPDATE SET name = excluded.name, server = excluded.server, listed = excluded.listed, updated_at = excluded.updated_at")
        .bind(handle, name, server, b.publicKey, b.listed ? 1 : 0, now, now),
    ]);
    return json({ ok: true, handle });
  }

  const um = path.match(/^\/v1\/users\/([^/]+)$/);
  if (um) {
    const handle = decodeURIComponent(um[1]).toLowerCase();
    if (req.method === "GET") {
      if (await limited(db, ip, "lookup")) return err(429, "too many requests");
      if (!HANDLE_RE.test(handle)) return err(404, "not found");
      const u = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first<UserRow>();
      return u ? json(out(u)) : err(404, "not found");
    }
    if (req.method === "DELETE") {
      if (await limited(db, ip, "write")) return err(429, "too many requests");
      const pre = precheck(req, self, http);
      if (!pre.ok) return err(pre.status, pre.error);
      const u = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first<UserRow>();
      if (!u) return err(404, "not found");
      if (!(await verifyRequest(req, "", self, u.public_key, pre.parsed))) return err(401, "bad signature");
      await db.prepare("DELETE FROM users WHERE handle = ?").bind(handle).run();
      return json({ ok: true });
    }
  }

  if (path === "/v1/search" && req.method === "GET") {
    if (await limited(db, ip, "search")) return err(429, "too many requests");
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().replace(/^@/, "");
    if (q.length < 2) return err(400, "q: at least 2 characters");
    if (q.length > 60) return json({ users: [] });
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
    const { results } = await db.prepare("SELECT * FROM users WHERE listed = 1 AND (handle LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\') ORDER BY handle LIMIT 20").bind(like, like).all<UserRow>();
    return json({ users: results.map((u) => ({ handle: u.handle, name: u.name, server: u.server })) });
  }

  return err(404, "not found");
}

export default {
  async fetch(req, env) {
    try { return await handleDirectory(req, env); }
    catch (e) { console.error(e); return err(500, "internal error"); }
  },
} satisfies ExportedHandler<DirEnv>;
