// Social storage: identity and settings in kv, friends / interactions / notifications in their own
// tables (migrations/0003_social.sql; created here too so a fresh database needs no migrate step).

import { kvGet, kvPut } from "../store";
import { generateKeyPair, importPrivate, type KeyPair } from "./sign";
import type { Author, Friend, Share } from "./types";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS social_friends (id TEXT PRIMARY KEY, server TEXT NOT NULL UNIQUE, handle TEXT, name TEXT, directory TEXT, public_key TEXT NOT NULL, status TEXT NOT NULL, share TEXT NOT NULL DEFAULT 'basic', their_share TEXT, request_id TEXT, note TEXT, since TEXT NOT NULL, last_seen TEXT)`,
  `CREATE TABLE IF NOT EXISTS social_interactions (id TEXT PRIMARY KEY, friend_id TEXT NOT NULL, item TEXT NOT NULL, kind TEXT NOT NULL, emoji TEXT, text TEXT, at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS social_interactions_item ON social_interactions(item)`,
  `CREATE INDEX IF NOT EXISTS social_interactions_friend ON social_interactions(friend_id)`,
  `CREATE TABLE IF NOT EXISTS social_notifications (id TEXT PRIMARY KEY, kind TEXT NOT NULL, friend_id TEXT NOT NULL, server TEXT NOT NULL, handle TEXT, name TEXT, item TEXT, emoji TEXT, text TEXT, at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS social_notifications_at ON social_notifications(at)`,
  `CREATE TABLE IF NOT EXISTS social_seen (id TEXT PRIMARY KEY, at TEXT NOT NULL)`,
];

const ready = new WeakMap<object, Promise<unknown>>();
export function ensureSocialSchema(db: D1Database) {
  let p = ready.get(db);
  if (!p) ready.set(db, (p = db.batch(SCHEMA.map((s) => db.prepare(s)))));
  return p;
}

// ── identity ─────────────────────────────────────────────────────────────

const keyCache = new WeakMap<object, Promise<{ publicKey: string; key: CryptoKey }>>();

/** The server's key pair, generated on first use; the private key never leaves kv. */
export function identity(db: D1Database): Promise<{ publicKey: string; key: CryptoKey }> {
  let p = keyCache.get(db);
  if (!p) {
    p = (async () => {
      let kp = await kvGet<KeyPair>(db, "social:key");
      if (!kp) {
        kp = await generateKeyPair();
        // Two first requests racing: keep whichever landed first.
        await db.prepare("INSERT OR IGNORE INTO kv (key, value) VALUES ('social:key', ?)").bind(JSON.stringify(kp)).run();
        kp = (await kvGet<KeyPair>(db, "social:key"))!;
      }
      return { publicKey: kp.publicKey, key: await importPrivate(kp.privateJwk) };
    })();
    p.catch(() => keyCache.delete(db));
    keyCache.set(db, p);
  }
  return p;
}

export interface SocialConfig { handle: string | null; name: string | null; listed: boolean; directory: string | null; registered: boolean; at: string }
export const getConfig = (db: D1Database) => kvGet<SocialConfig>(db, "social:config");
export const putConfig = (db: D1Database, c: SocialConfig | null) => kvPut(db, "social:config", c);

// ── friends ──────────────────────────────────────────────────────────────

export interface FriendRow {
  id: string; server: string; handle: string | null; name: string | null; directory: string | null; public_key: string;
  status: "friends" | "outgoing" | "incoming"; share: Share; their_share: Share | null; request_id: string | null;
  note: string | null; since: string; last_seen: string | null;
}

export const getFriend = (db: D1Database, id: string) => db.prepare("SELECT * FROM social_friends WHERE id = ?").bind(id).first<FriendRow>();
export const friendByServer = (db: D1Database, server: string) => db.prepare("SELECT * FROM social_friends WHERE server = ?").bind(server).first<FriendRow>();
export async function listFriends(db: D1Database): Promise<FriendRow[]> {
  return (await db.prepare("SELECT * FROM social_friends ORDER BY since DESC").all<FriendRow>()).results;
}
export async function pendingIncoming(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM social_friends WHERE status = 'incoming'").first<{ n: number }>())?.n ?? 0;
}

export async function putFriend(db: D1Database, f: FriendRow) {
  await db.prepare(
    `INSERT INTO social_friends (id, server, handle, name, directory, public_key, status, share, their_share, request_id, note, since, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET server = excluded.server, handle = excluded.handle, name = excluded.name, directory = excluded.directory,
       public_key = excluded.public_key, status = excluded.status, share = excluded.share, their_share = excluded.their_share,
       request_id = excluded.request_id, note = excluded.note, since = excluded.since, last_seen = excluded.last_seen`,
  ).bind(f.id, f.server, f.handle, f.name, f.directory, f.public_key, f.status, f.share, f.their_share, f.request_id, f.note, f.since, f.last_seen).run();
}

export async function patchFriend(db: D1Database, id: string, patch: Partial<Pick<FriendRow, "their_share" | "last_seen" | "share" | "name" | "handle">>) {
  const f = await getFriend(db, id);
  if (f) await putFriend(db, { ...f, ...patch });
}

/** Forget a friend and everything they left here (reactions, comments, their notifications). */
export async function removeFriend(db: D1Database, id: string) {
  await db.batch([
    db.prepare("DELETE FROM social_friends WHERE id = ?").bind(id),
    db.prepare("DELETE FROM social_interactions WHERE friend_id = ?").bind(id),
    db.prepare("DELETE FROM social_notifications WHERE friend_id = ?").bind(id),
  ]);
  await clearCache(db, id);
}

export const toAuthor = (f: Pick<FriendRow, "id" | "server" | "handle" | "name">): Author => ({ id: f.id, server: f.server, handle: f.handle, name: f.name });

export async function toFriend(f: FriendRow, fp: (k: string) => Promise<string>): Promise<Friend> {
  return {
    ...toAuthor(f), status: f.status, share: f.share, theirShare: f.their_share, since: f.since, lastSeen: f.last_seen,
    fingerprint: await fp(f.public_key), note: f.note,
  };
}

// ── seen message ids ─────────────────────────────────────────────────────

/** true the first time a message id is seen (from this sender). Ids older than a day are pruned. */
export async function firstSeen(db: D1Database, sender: string, id: string): Promise<boolean> {
  const r = await db.prepare("INSERT OR IGNORE INTO social_seen (id, at) VALUES (?, ?)").bind(`${sender} ${id}`, new Date().toISOString()).run();
  if (Math.random() < 0.05) await db.prepare("DELETE FROM social_seen WHERE at < ?").bind(new Date(Date.now() - 864e5).toISOString()).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ── interactions on my items ─────────────────────────────────────────────

export interface InteractionRow { id: string; friend_id: string; item: string; kind: "reaction" | "comment"; emoji: string | null; text: string | null; at: string }

export async function interactionsFor(db: D1Database, items: string[]): Promise<InteractionRow[]> {
  const out: InteractionRow[] = [];
  for (let i = 0; i < items.length; i += 90) {
    const part = items.slice(i, i + 90);
    if (!part.length) continue;
    out.push(...(await db.prepare(`SELECT * FROM social_interactions WHERE item IN (${part.map(() => "?").join(",")}) ORDER BY at`).bind(...part).all<InteractionRow>()).results);
  }
  return out;
}

export async function setReaction(db: D1Database, friend: string, msgId: string, item: string, emoji: string | null) {
  await db.prepare("DELETE FROM social_interactions WHERE friend_id = ? AND item = ? AND kind = 'reaction'").bind(friend, item).run();
  if (emoji) await db.prepare("INSERT INTO social_interactions (id, friend_id, item, kind, emoji, at) VALUES (?, ?, ?, 'reaction', ?, ?)").bind(msgId, friend, item, emoji, new Date().toISOString()).run();
}

export async function addComment(db: D1Database, friend: string, msgId: string, item: string, text: string) {
  await db.prepare("INSERT INTO social_interactions (id, friend_id, item, kind, text, at) VALUES (?, ?, ?, 'comment', ?, ?)").bind(msgId, friend, item, text, new Date().toISOString()).run();
}

// ── notifications ────────────────────────────────────────────────────────

export interface NotificationRow { id: string; kind: string; friend_id: string; server: string; handle: string | null; name: string | null; item: string | null; emoji: string | null; text: string | null; at: string; read: number }

export async function notify(db: D1Database, n: { kind: "request" | "accepted" | "reaction" | "comment"; from: FriendRow; item?: string; emoji?: string; text?: string }) {
  await db.prepare("INSERT INTO social_notifications (id, kind, friend_id, server, handle, name, item, emoji, text, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), n.kind, n.from.id, n.from.server, n.from.handle, n.from.name, n.item ?? null, n.emoji ?? null, n.text ?? null, new Date().toISOString()).run();
  // keep the newest 300
  await db.prepare("DELETE FROM social_notifications WHERE id NOT IN (SELECT id FROM social_notifications ORDER BY at DESC LIMIT 300)").run();
}

export async function listNotifications(db: D1Database, limit = 100): Promise<NotificationRow[]> {
  return (await db.prepare("SELECT * FROM social_notifications ORDER BY at DESC LIMIT ?").bind(limit).all<NotificationRow>()).results;
}
export const markRead = (db: D1Database) => db.prepare("UPDATE social_notifications SET read = 1 WHERE read = 0").run();
export async function unreadCount(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM social_notifications WHERE read = 0").first<{ n: number }>())?.n ?? 0;
}

// ── fetch cache (friends' feed / profile) ────────────────────────────────

export interface Cached<T> { at: number; data: T }
const cacheKey = (friend: string, what: string) => `social:cache:${friend}:${what}`;
export const getCache = <T>(db: D1Database, friend: string, what: string) => kvGet<Cached<T>>(db, cacheKey(friend, what));
export const putCache = (db: D1Database, friend: string, what: string, data: unknown) => kvPut(db, cacheKey(friend, what), { at: Date.now(), data });
export async function clearCache(db: D1Database, friend: string) {
  await db.prepare("DELETE FROM kv WHERE key LIKE ?").bind(`social:cache:${friend}:%`).run();
}
