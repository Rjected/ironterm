// The public side: /.well-known/ironterm and the signed /social/v1/* endpoints other servers call.

import type { Bootstrap } from "../../src/api";
import { derive } from "../../src/derive";
import { attach, buildFeed, buildProfile, pageItems } from "./build";
import {
  addComment, firstSeen, friendByServer, getConfig, identity, interactionsFor, listFriends, notify, pendingIncoming, putFriend,
  removeFriend, setReaction, type FriendRow,
} from "./db";
import { allowHttp, directoryUser, fetchWellKnown, signedFetch, type SocialEnv } from "./net";
import { friendId, normOrigin, precheck, verifyRequest, type ParsedSig } from "./sign";
import { EMOJI, HANDLE_RE, type FeedPage, type InboxMessage, type WellKnown } from "./types";

export const MAX_PENDING = 50;
export const MAX_BODY = 8192;

export interface SocialCtx {
  env: SocialEnv;
  /** this server's canonical origin */
  self: string;
  boot: () => Promise<Bootstrap>;
  waitUntil: (p: Promise<unknown>) => void;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (status: number, error: string) => json({ error }, status);

export async function wellKnown(c: SocialCtx): Promise<WellKnown> {
  const [cfg, id] = await Promise.all([getConfig(c.env.DB), identity(c.env.DB)]);
  return {
    v: 1, server: c.self, handle: cfg?.handle ?? null, name: cfg?.name ?? null, publicKey: id.publicKey,
    directory: cfg?.registered ? cfg.directory : null, software: "ironterm",
  };
}

/** Who I am, as the `from` of a friend request. */
export async function selfAuthor(c: SocialCtx) {
  const cfg = await getConfig(c.env.DB);
  return { server: c.self, handle: cfg?.handle ?? null, name: cfg?.name ?? null, directory: cfg?.registered ? cfg.directory : null };
}

const str = (x: unknown, max: number) => typeof x === "string" && x.length <= max;
const ID_RE = /^[\w-]{8,64}$/;
const ITEM_RE = /^(w|pr|a):[^\s]{1,200}$/;

/** Shape check; null when malformed. */
export function parseMessage(x: unknown): InboxMessage | null {
  if (!x || typeof x !== "object") return null;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || !ID_RE.test(m.id)) return null;
  switch (m.type) {
    case "friend_request": {
      const f = m.from as Record<string, unknown> | undefined;
      if (!f || typeof f !== "object" || typeof f.server !== "string") return null;
      if (f.handle != null && !(typeof f.handle === "string" && HANDLE_RE.test(f.handle))) return null;
      if (f.name != null && !str(f.name, 60)) return null;
      if (f.directory != null && !str(f.directory, 300)) return null;
      if (m.note != null && !str(m.note, 140)) return null;
      return { type: "friend_request", id: m.id, from: { server: f.server, handle: (f.handle as string) ?? null, name: (f.name as string) ?? null, directory: (f.directory as string) ?? null }, note: (m.note as string) ?? null };
    }
    case "friend_accept":
    case "friend_reject":
      return typeof m.request === "string" && ID_RE.test(m.request) ? { type: m.type, id: m.id, request: m.request } : null;
    case "unfriend":
      return { type: "unfriend", id: m.id };
    case "reaction":
      return typeof m.item === "string" && ITEM_RE.test(m.item) && (EMOJI as readonly unknown[]).includes(m.emoji) ? { type: "reaction", id: m.id, item: m.item, emoji: m.emoji as string } : null;
    case "unreaction":
      return typeof m.item === "string" && ITEM_RE.test(m.item) ? { type: "unreaction", id: m.id, item: m.item } : null;
    case "comment": {
      const text = typeof m.text === "string" ? m.text.trim() : "";
      return typeof m.item === "string" && ITEM_RE.test(m.item) && text.length >= 1 && text.length <= 280 ? { type: "comment", id: m.id, item: m.item, text } : null;
    }
  }
  return null;
}

/** Verify a request from someone with a row here, with that row's (pinned) key. */
async function verifyKnown(req: Request, raw: string, c: SocialCtx, parsed: ParsedSig, f: FriendRow) {
  return verifyRequest(req, raw, c.self, f.public_key, parsed);
}

/** A stranger's key: their .well-known, and their directory entry when they claim one. Both must agree. */
async function strangerKey(server: string, from: { handle: string | null; directory: string | null }, http: boolean): Promise<{ key: string; wk: WellKnown } | null> {
  let wk: WellKnown;
  try { wk = await fetchWellKnown(server); } catch { return null; }
  if (from.handle && from.directory) {
    const dir = normOrigin(from.directory, http);
    if (!dir) return null;
    const u = await directoryUser(dir, from.handle).catch(() => null);
    if (!u || u.server !== server || u.publicKey !== wk.publicKey) return null;
  }
  return { key: wk.publicKey, wk };
}

async function myItemIds(c: SocialCtx, f: FriendRow): Promise<Set<string>> {
  const b = await c.boot();
  return new Set(buildFeed(b, f.share, derive(b, "volume")).map((x) => x.id));
}

export async function inbox(req: Request, c: SocialCtx): Promise<Response> {
  const db = c.env.DB;
  const http = allowHttp(c.env);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return err(400, "message too large");
  const raw = await req.text();
  if (raw.length > MAX_BODY) return err(400, "message too large");
  const pre = precheck(req, c.self, http);
  if (!pre.ok) return err(pre.status, pre.error);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return err(400, "malformed message"); }
  const msg = parseMessage(body);
  if (!msg) return err(400, "malformed message");
  const sender = pre.server;
  if (sender === c.self) return err(400, "that's me");
  const row = await friendByServer(db, sender);

  if (msg.type === "friend_request") {
    if (normOrigin(msg.from.server, http) !== sender) return err(400, "from.server doesn't match the signature");
    if (row?.status === "friends") {
      if (!(await verifyKnown(req, raw, c, pre.parsed, row))) return err(401, "bad signature");
      return err(409, "already friends");
    }
    const sk = await strangerKey(sender, msg.from, http);
    if (!sk || !(await verifyRequest(req, raw, c.self, sk.key, pre.parsed))) return err(401, "bad signature");
    if (!(await firstSeen(db, sender, msg.id))) return err(409, "duplicate");
    const now = new Date().toISOString();
    const who = { handle: msg.from.handle ?? sk.wk.handle, name: msg.from.name ?? sk.wk.name, directory: msg.from.directory };
    if (row?.status === "incoming") return err(409, "request already pending");
    if (row?.status === "outgoing") {
      // We asked them too: their request is the answer. The key must be the one we fetched then.
      if (row.public_key !== sk.key) return err(401, "key changed since our request");
      const f: FriendRow = { ...row, ...who, status: "friends", since: now };
      await putFriend(db, f);
      await notify(db, { kind: "accepted", from: f });
      c.waitUntil(signedFetch(db, c.self, `${sender}/social/v1/inbox`, "POST", { type: "friend_accept", id: crypto.randomUUID(), request: msg.id }).catch(() => null));
      return json({ ok: true }, 202);
    }
    if ((await pendingIncoming(db)) >= MAX_PENDING) return err(429, "too many pending requests");
    const f: FriendRow = {
      id: await friendId(sender), server: sender, ...who, public_key: sk.key, status: "incoming", share: "basic", their_share: null,
      request_id: msg.id, note: msg.note?.trim() || null, since: now, last_seen: null,
    };
    await putFriend(db, f);
    await notify(db, { kind: "request", from: f, text: f.note ?? undefined });
    return json({ ok: true }, 202);
  }

  // Everything else comes from someone we already know.
  if (!row) return err(403, "not a friend");
  if (!(await verifyKnown(req, raw, c, pre.parsed, row))) return err(401, "bad signature");
  if (!(await firstSeen(db, sender, msg.id))) return err(409, "duplicate");

  switch (msg.type) {
    case "friend_accept": {
      if (row.status === "friends") return err(409, "already friends");
      if (row.status !== "outgoing" || row.request_id !== msg.request) return err(403, "no such request");
      const f: FriendRow = { ...row, status: "friends", since: new Date().toISOString() };
      await putFriend(db, f);
      await notify(db, { kind: "accepted", from: f });
      return json({ ok: true }, 202);
    }
    case "friend_reject": {
      if (row.status !== "outgoing" || row.request_id !== msg.request) return err(403, "no such request");
      await removeFriend(db, row.id);
      return json({ ok: true }, 202);
    }
    case "unfriend":
      await removeFriend(db, row.id);
      return json({ ok: true }, 202);
  }

  if (row.status !== "friends") return err(403, "not a friend");
  if (!(await myItemIds(c, row)).has(msg.item)) return err(400, "unknown item");
  if (msg.type === "reaction") {
    await setReaction(db, row.id, msg.id, msg.item, msg.emoji);
    await notify(db, { kind: "reaction", from: row, item: msg.item, emoji: msg.emoji });
  } else if (msg.type === "unreaction") {
    await setReaction(db, row.id, msg.id, msg.item, null);
  } else {
    await addComment(db, row.id, msg.id, msg.item, msg.text);
    await notify(db, { kind: "comment", from: row, item: msg.item, text: msg.text });
  }
  return json({ ok: true }, 202);
}

/** Friends' reactions/comments, keyed for `attach`. */
export async function whoMap(db: D1Database) {
  return new Map((await listFriends(db)).filter((f) => f.status === "friends").map((f) => [f.id, { server: f.server, name: f.name }] as const));
}

/** My items (at `share`) with what friends left on them, paged. */
export async function ownFeed(c: SocialCtx, share: FeedPage["share"], before: string | null, limit: number): Promise<FeedPage> {
  const b = await c.boot();
  const d = derive(b, "volume");
  const all = buildFeed(b, share, d);
  const page = pageItems(all, before, limit);
  const items = attach(page.items, await interactionsFor(c.env.DB, page.items.map((x) => x.id)), await whoMap(c.env.DB));
  return { items, next: page.next, share, unit: share === "basic" ? null : d.unit };
}

export async function handlePeer(req: Request, c: SocialCtx, path: string): Promise<Response> {
  if (path === "/.well-known/ironterm") {
    if (req.method !== "GET" && req.method !== "HEAD") return err(405, "method not allowed");
    const r = json(await wellKnown(c));
    r.headers.set("access-control-allow-origin", "*");
    return r;
  }
  if (path === "/social/v1/inbox") return req.method === "POST" ? inbox(req, c) : err(405, "method not allowed");
  if ((path === "/social/v1/profile" || path === "/social/v1/feed") && req.method === "GET") {
    const pre = precheck(req, c.self, allowHttp(c.env));
    if (!pre.ok) return err(pre.status, pre.error);
    const f = await friendByServer(c.env.DB, pre.server);
    if (!f) return err(403, "not a friend");
    if (!(await verifyKnown(req, "", c, pre.parsed, f))) return err(401, "bad signature");
    if (f.status !== "friends") return err(403, "not a friend");
    if (path === "/social/v1/profile") {
      const cfg = await getConfig(c.env.DB);
      return json(buildProfile(await c.boot(), f.share, { server: c.self, handle: cfg?.handle ?? null, name: cfg?.name ?? null }));
    }
    const q = new URL(req.url).searchParams;
    return json(await ownFeed(c, f.share, q.get("before"), Number(q.get("limit") ?? 30)));
  }
  return err(404, "not found");
}
