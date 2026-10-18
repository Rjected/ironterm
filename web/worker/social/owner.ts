// The owner's API (/api/social/*): what the web UI and the apps call, behind the normal login.
// Friends are fetched lazily: in parallel, 4 s timeout each, cached 5 minutes (?fresh=1 skips the
// cache), falling back to the last good copy marked stale.

import { derive } from "../../src/derive";
import { liftName } from "../../shared/lifts";
import { addDays, weekStart } from "../../shared/stats";
import { fromKg, toKg } from "../../shared/units";
import { buildProfile, latestBodyweight } from "./build";
import {
  clearCache, friendByServer, getCache, getConfig, getFriend, identity, listFriends, listNotifications, markRead, patchFriend,
  putCache, putConfig, putFriend, removeFriend, toAuthor, toFriend, unreadCount, type FriendRow, type SocialConfig,
} from "./db";
import { allowHttp, directoryOf, directoryUser, fetchWellKnown, MAX_SMALL, PeerError, peerJson, signedFetch, timedFetch } from "./net";
import { feedFrom, profileFrom } from "./sanitize";
import { ownFeed, selfAuthor, type SocialCtx } from "./peer";
import { fingerprint, friendId, normOrigin } from "./sign";
import {
  EMOJI, HANDLE_RE, isShare, type Author, type Compare, type FeedItem, type FeedPage, type Notification, type Share, type SocialMe, type SocialProfile,
} from "./types";

export const CACHE_MS = 5 * 60_000;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (status: number, error: string) => json({ error }, status);
const body = <T>(req: Request) => req.json<T>().catch(() => ({}) as T);

async function me(c: SocialCtx): Promise<SocialMe> {
  const [cfg, id, unread] = await Promise.all([getConfig(c.env.DB), identity(c.env.DB), unreadCount(c.env.DB)]);
  return {
    enabled: !!cfg?.handle, handle: cfg?.handle ?? null, name: cfg?.name ?? null, server: c.self,
    directory: cfg?.registered ? cfg.directory : null, listed: !!cfg?.listed, fingerprint: await fingerprint(id.publicKey),
    directoryConfigured: !!directoryOf(c.env), unread,
  };
}

/** Send one inbox message; returns the peer's status (0 = unreachable) and error text. */
async function deliver(c: SocialCtx, f: Pick<FriendRow, "server">, msg: Record<string, unknown>): Promise<{ status: number; error?: string }> {
  try {
    const r = await signedFetch(c.env.DB, c.self, `${f.server}/social/v1/inbox`, "POST", { id: crypto.randomUUID(), ...msg });
    if (r.status === 202) return { status: 202 };
    const e = await peerJson<{ error?: unknown }>(r, MAX_SMALL);
    return { status: r.status, error: typeof e?.error === "string" ? e.error.slice(0, 200) : `HTTP ${r.status}` };
  } catch (e) {
    return { status: 0, error: (e as Error).message };
  }
}

const peerFail = (d: { status: number; error?: string }, who: string) =>
  err([400, 401, 403, 409, 429].includes(d.status) ? d.status : 502, `${who}: ${d.error}`);

// ── lazy fetch with cache ────────────────────────────────────────────────

/**
 * A friend's profile or feed: fresh, cached, or stale-cached. `parse` rebuilds their JSON into our
 * wire type (social/sanitize.ts); a response it rejects counts as a failed fetch, never a 500.
 */
export async function fetchFriend<T>(c: SocialCtx, f: FriendRow, what: string, fresh: boolean, parse: (x: unknown) => T): Promise<{ data: T; stale: boolean }> {
  const db = c.env.DB;
  const safe = (x: unknown): T | null => { try { return parse(x); } catch { return null; } };
  const hit = await getCache<unknown>(db, f.id, what);
  // (a cache written before responses were checked may hold anything)
  const cached = hit ? (() => { const d = safe(hit.data); return d ? { at: hit.at, data: d } : null; })() : null;
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return { data: cached.data, stale: false };
  let r: Response | null = null;
  try { r = await signedFetch(db, c.self, `${f.server}/social/v1/${what}`); } catch { r = null; }
  const raw = r?.ok ? await peerJson<unknown>(r) : null;
  const data = raw != null ? safe(raw) : null;
  if (r?.ok && !data && !cached) throw new PeerError(`${f.server} sent a response this server can't read`);
  if (r?.ok && data) {

    await putCache(db, f.id, what, data);
    const share = (data as { share?: unknown }).share;
    await patchFriend(db, f.id, { last_seen: new Date().toISOString(), ...(isShare(share) ? { their_share: share } : {}) });
    return { data, stale: false };
  }
  // They revoked us: no stale copies of something we may no longer see.
  if (r?.status === 403) { await clearCache(db, f.id); throw new PeerError("they no longer share with you", 403); }
  if (cached) return { data: cached.data, stale: true };
  throw new PeerError(r ? `${f.server} answered ${r.status}` : `couldn't reach ${f.server}`);
}

async function friendOr404(c: SocialCtx, id: string, status?: FriendRow["status"]) {
  const f = await getFriend(c.env.DB, id);
  return f && (!status || f.status === status) ? f : null;
}

// ── compare ──────────────────────────────────────────────────────────────

function weeksFromGraph(g: SocialProfile["graph"]): Map<string, number> {
  const m = new Map<string, number>();
  g.levels.forEach((lv, i) => {
    if (lv <= 0) return;
    const wk = weekStart(addDays(g.start, i));
    m.set(wk, (m.get(wk) ?? 0) + 1);
  });
  return m;
}

export function compare(mine: SocialProfile, theirs: SocialProfile, friend: Author, opts: { meE1rm?: (k: string) => number | null; myBw: number | null; iShareFull: boolean }): Compare {
  const unit = mine.unit ?? "lb";
  const conv = (v: number | null, from: "kg" | "lb" | null) => (v == null || !from ? null : Math.round(fromKg(toKg(v, from), unit) * 10) / 10);
  const keys = [...new Set([...mine.lifts.map((l) => l.key), ...theirs.lifts.map((l) => l.key)])];
  const theirBw = theirs.bodyweight;
  const bw = opts.iShareFull && opts.myBw && theirBw && theirs.unit ? { me: opts.myBw, them: theirBw } : null;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const lifts = keys.map((k) => {
    const m = mine.lifts.find((l) => l.key === k)?.e1rm ?? opts.meE1rm?.(k) ?? null;
    const tRaw = theirs.lifts.find((l) => l.key === k)?.e1rm ?? null;
    const me = m != null ? Math.round(m * 10) / 10 : null;
    const out: Compare["lifts"][number] = { key: k, name: mine.lifts.find((l) => l.key === k)?.name ?? theirs.lifts.find((l) => l.key === k)?.name ?? liftName(k), me, them: conv(tRaw, theirs.unit) };
    if (bw) { out.meBw = me != null ? r2(me / bw.me) : null; out.themBw = tRaw != null ? r2(tRaw / bw.them) : null; }
    return out;
  });
  const mw = weeksFromGraph(mine.graph), tw = weeksFromGraph(theirs.graph);
  const lastWeek = weekStart(addDays(mine.graph.start, Math.max(0, mine.graph.levels.length - 1)));
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(lastWeek, -7 * (11 - i))).map((w) => ({ week: w, me: mw.get(w) ?? 0, them: tw.get(w) ?? 0 }));
  return { friend, unit, lifts, weeks, streak: { me: mine.streak.current, them: theirs.streak.current } };
}

// ── routes ───────────────────────────────────────────────────────────────

export async function handleOwner(req: Request, c: SocialCtx, path: string): Promise<Response> {
  const db = c.env.DB;
  const method = req.method;
  const url = new URL(req.url);
  const q = url.searchParams;
  const fresh = q.get("fresh") === "1";
  const http = allowHttp(c.env);
  const sub = path.slice("/api/social".length);

  if (sub === "/me" && method === "GET") return json(await me(c));

  if (sub === "/setup" && method === "POST") {
    const b = await body<{ handle?: string; name?: string; listed?: boolean }>(req);
    const handle = String(b.handle ?? "").trim().toLowerCase();
    const name = String(b.name ?? "").trim().slice(0, 60);
    if (!HANDLE_RE.test(handle)) return err(400, "Handle: 2–30 characters, a–z 0–9 _ -, starting with a letter or digit.");
    if (!name) return err(400, "Pick a display name.");
    const prev = await getConfig(db);
    const directory = directoryOf(c.env);
    const next: SocialConfig = { handle, name, listed: !!b.listed, directory, registered: false, at: new Date().toISOString() };
    await putConfig(db, next);
    if (directory) {
      const id = await identity(db);
      let r: Response | null = null;
      try { r = await signedFetch(db, c.self, `${directory}/v1/register`, "POST", { handle, name, server: c.self, publicKey: id.publicKey, listed: !!b.listed }); } catch { r = null; }
      if (!r || !r.ok) {
        await putConfig(db, prev);
        const e = r ? (await peerJson<{ error?: string }>(r, MAX_SMALL))?.error : null;
        return err(r ? (r.status === 409 ? 409 : r.status === 429 ? 429 : 502) : 502, `Directory: ${e ?? "unreachable"}`);
      }
      await putConfig(db, { ...next, registered: true });
    }
    return json({ ok: true, handle });
  }

  if (sub === "/setup" && method === "DELETE") {
    const cfg = await getConfig(db);
    if (cfg?.registered && cfg.directory && cfg.handle) {
      const r = await signedFetch(db, c.self, `${cfg.directory}/v1/users/${encodeURIComponent(cfg.handle)}`, "DELETE").catch(() => null);
      if (r && !r.ok && r.status !== 404) return err(502, `Directory: ${(await peerJson<{ error?: string }>(r, MAX_SMALL))?.error ?? r.status}`);
      if (!r) return err(502, "Directory: unreachable");
    }
    if (cfg) await putConfig(db, { ...cfg, registered: false, listed: false, directory: null });
    return json({ ok: true });
  }

  if (sub === "/search" && method === "GET") {
    const dir = directoryOf(c.env);
    if (!dir) return err(400, "No directory configured on this server (SOCIAL_DIRECTORY).");
    const term = (q.get("q") ?? "").trim().toLowerCase();
    if (term.length < 2) return json({ users: [] });
    let r: Response;
    try { r = await timedFetch(`${dir}/v1/search?q=${encodeURIComponent(term)}`); } catch { return err(502, "Directory unreachable"); }
    if (!r.ok) return err(502, `Directory error (${r.status})`);
    const d = await peerJson<{ users?: { handle: string; name: string | null; server: string }[] }>(r);
    return json({ users: (Array.isArray(d?.users) ? d.users : []).filter((u) => u.server !== c.self).map((u) => ({ handle: u.handle, name: u.name, server: u.server })) });
  }

  if (sub === "/friends" && method === "GET") {
    const rows = await listFriends(db);
    return json({ friends: await Promise.all(rows.map((f) => toFriend(f, fingerprint))) });
  }

  if (sub === "/friends" && method === "POST") {
    const b = await body<{ handle?: string; server?: string; note?: string; share?: string }>(req);
    const cfg = await getConfig(db);
    if (!cfg?.handle) return err(400, "Set up social first (pick a handle and a name).");
    const share: Share = isShare(b.share) ? b.share : "basic";
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 140) : "";
    let server: string | null;
    let key: string;
    let wk;
    try {
      if (b.handle) {
        const dir = directoryOf(c.env);
        if (!dir) return err(400, "No directory configured on this server: add them by server URL instead.");
        const h = String(b.handle).trim().toLowerCase().replace(/^@/, "");
        if (!HANDLE_RE.test(h)) return err(400, "That isn't a valid handle.");
        const u = await directoryUser(dir, h);
        if (!u) return err(404, `No one called @${h} in the directory.`);
        server = normOrigin(u.server, http);
        if (!server) return err(400, `@${h}'s server address isn't usable from here (${u.server}).`);
        wk = await fetchWellKnown(server);
        if (wk.publicKey !== u.publicKey) return err(502, `@${h}'s server key doesn't match the directory: not sending.`);
      } else {
        server = normOrigin(String(b.server ?? "").trim(), http);
        if (!server) return err(400, http ? "Enter a server URL like https://gym.example.com" : "Enter an https:// server URL.");
        wk = await fetchWellKnown(server);
      }
      key = wk.publicKey;
    } catch (e) {
      return err(e instanceof PeerError ? 502 : 500, (e as Error).message);
    }
    if (server === c.self) return err(400, "That's this server.");
    const existing = await friendByServer(db, server);
    if (existing?.status === "friends") return err(409, "Already friends.");
    if (existing?.status === "outgoing") return err(409, "Request already sent.");
    if (existing?.status === "incoming") return accept(c, existing, share);
    const f: FriendRow = {
      id: await friendId(server), server, handle: wk.handle, name: wk.name, directory: wk.directory, public_key: key, status: "outgoing",
      share, their_share: null, request_id: crypto.randomUUID(), note: note || null, since: new Date().toISOString(), last_seen: null,
    };
    await putFriend(db, f);
    const d = await deliver(c, f, { type: "friend_request", id: f.request_id, from: await selfAuthor(c), note: note || null });
    if (d.status !== 202 && d.status !== 409) { await removeFriend(db, f.id); return peerFail(d, server); }
    const now = await getFriend(db, f.id);
    return json({ friend: await toFriend(now ?? f, fingerprint) });
  }

  const fm = sub.match(/^\/friends\/([0-9a-f]{12})(\/accept|\/reject|\/profile|\/feed)?$/);
  if (fm) {
    const id = fm[1], act = fm[2] ?? "";
    const f = await friendOr404(c, id);
    if (!f) return err(404, "No such friend.");
    if (act === "/accept" && method === "POST") {
      if (f.status !== "incoming") return err(409, "No pending request from them.");
      const b = await body<{ share?: string }>(req);
      return accept(c, f, isShare(b.share) ? b.share : "basic");
    }
    if (act === "/reject" && method === "POST") {
      if (f.status !== "incoming") return err(409, "No pending request from them.");
      await deliver(c, f, { type: "friend_reject", request: f.request_id });
      await removeFriend(db, f.id);
      return json({ ok: true });
    }
    if (act === "" && method === "PUT") {
      const b = await body<{ share?: string }>(req);
      if (!isShare(b.share)) return err(400, "share must be basic, lifts or full");
      await putFriend(db, { ...f, share: b.share });
      return json({ friend: await toFriend({ ...f, share: b.share }, fingerprint) });
    }
    if (act === "" && method === "DELETE") {
      // Tell them (best effort), then forget them either way.
      const d = await deliver(c, f, { type: "unfriend" });
      await removeFriend(db, f.id);
      return json({ ok: true, notified: d.status === 202 });
    }
    if (act === "/profile" && method === "GET") {
      if (f.status !== "friends") return err(409, "Not friends yet.");
      try {
        const r = await fetchFriend(c, f, "profile", fresh, profileFrom);
        return json({ profile: r.data, stale: r.stale });
      } catch (e) { return err((e as PeerError).status ?? 502, (e as Error).message); }
    }
    if (act === "/feed" && method === "GET") {
      if (f.status !== "friends") return err(409, "Not friends yet.");
      const before = q.get("before");
      const limit = Math.max(1, Math.min(100, Number(q.get("limit") ?? 30) || 30));
      try {
        const r = await fetchFriend(c, f, `feed?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`, fresh, feedFrom);
        return json({ items: r.data.items.map((it) => ({ ...it, author: { ...toAuthor(f), unit: r.data.unit ?? null }, unit: r.data.unit ?? null })), next: r.data.next, stale: r.stale ? [f.id] : [] });
      } catch (e) { return err((e as PeerError).status ?? 502, (e as Error).message); }
    }
    return err(404, "not found");
  }

  if (sub === "/feed" && method === "GET") {
    const friends = (await listFriends(db)).filter((f) => f.status === "friends");
    const stale: string[] = [], unreachable: string[] = [];
    const pages = await Promise.all(friends.map(async (f) => {
      try {
        const r = await fetchFriend(c, f, "feed?limit=100", fresh, feedFrom);
        if (r.stale) stale.push(f.id);
        return r.data.items.map((it) => ({ ...it, author: { ...toAuthor(f), unit: r.data.unit ?? null }, unit: r.data.unit ?? null }));
      } catch { unreachable.push(f.id); return []; }
    }));
    const all = pages.flat().sort((a, z) => z.at.localeCompare(a.at) || a.author.id.localeCompare(z.author.id) || a.id.localeCompare(z.id));
    const limit = Math.max(1, Math.min(100, Number(q.get("limit") ?? 30) || 30));
    const before = q.get("before");
    let start = 0;
    if (before) {
      const i = all.findIndex((x) => `${x.author.id}|${x.id}` === before);
      start = i < 0 ? all.length : i + 1;
    }
    const items = all.slice(start, start + limit);
    const last = items[items.length - 1];
    return json({ items, next: start + limit < all.length && last ? `${last.author.id}|${last.id}` : null, stale, unreachable });
  }

  const cm = sub.match(/^\/compare\/([0-9a-f]{12})$/);
  if (cm && method === "GET") {
    const f = await friendOr404(c, cm[1], "friends");
    if (!f) return err(404, "No such friend.");
    let theirs: { data: SocialProfile; stale: boolean };
    try { theirs = await fetchFriend(c, f, "profile", fresh, profileFrom); }
    catch (e) { return err((e as PeerError).status ?? 502, (e as Error).message); }
    const b = await c.boot();
    const d = derive(b, b.settings.graphMetric ?? "volume");
    const cfg = await getConfig(db);
    const mine = buildProfile(b, "full", { server: c.self, handle: cfg?.handle ?? null, name: cfg?.name ?? null }, d);
    const out = compare(mine, theirs.data, toAuthor(f), { meE1rm: (k) => d.e1rmNow(k), myBw: latestBodyweight(b, d.unit), iShareFull: f.share === "full" });
    return json({ ...out, stale: theirs.stale });
  }

  if (sub === "/mine" && method === "GET") {
    const page = await ownFeed(c, "full", q.get("before"), Number(q.get("limit") ?? 30));
    return json({ items: page.items, next: page.next, unit: page.unit });
  }

  if ((sub === "/react" || sub === "/comment") && method === "POST") {
    const b = await body<{ friend?: string; item?: string; emoji?: string | null; text?: string }>(req);
    const f = await friendOr404(c, String(b.friend ?? ""), "friends");
    if (!f) return err(404, "No such friend.");
    if (typeof b.item !== "string" || !b.item) return err(400, "item required");
    let msg: Record<string, unknown>;
    if (sub === "/react") {
      if (b.emoji != null && !(EMOJI as readonly string[]).includes(b.emoji)) return err(400, `emoji must be one of ${EMOJI.join(" ")}`);
      msg = b.emoji ? { type: "reaction", item: b.item, emoji: b.emoji } : { type: "unreaction", item: b.item };
    } else {
      const text = String(b.text ?? "").trim();
      if (!text || text.length > 280) return err(400, "Comments are 1–280 characters.");
      msg = { type: "comment", item: b.item, text };
    }
    const d = await deliver(c, f, msg);
    if (d.status !== 202) return peerFail(d, f.name ?? f.server);
    await clearCache(db, f.id); // their copy changed; the next read refetches
    return json({ ok: true });
  }

  if (sub === "/notifications" && method === "GET") {
    const rows = await listNotifications(db);
    const items: Notification[] = rows.map((n) => ({
      id: n.id, kind: n.kind as Notification["kind"], from: { id: n.friend_id, server: n.server, handle: n.handle, name: n.name },
      ...(n.item ? { item: n.item } : {}), ...(n.emoji ? { emoji: n.emoji } : {}), ...(n.text ? { text: n.text } : {}), at: n.at, read: !!n.read,
    }));
    return json({ items, unread: items.filter((x) => !x.read).length });
  }
  if (sub === "/notifications/read" && method === "POST") { await markRead(db); return json({ ok: true }); }

  return err(404, "not found");
}

async function accept(c: SocialCtx, f: FriendRow, share: Share): Promise<Response> {
  const db = c.env.DB;
  const next: FriendRow = { ...f, status: "friends", share, since: new Date().toISOString() };
  await putFriend(db, next);
  const d = await deliver(c, f, { type: "friend_accept", request: f.request_id });
  if (d.status !== 202 && d.status !== 409) { await putFriend(db, f); return peerFail(d, f.name ?? f.server); }
  return json({ friend: await toFriend(next, fingerprint) });
}

export type OwnerFeedItem = FeedItem & { author: Author & { unit: "kg" | "lb" | null }; unit: "kg" | "lb" | null };
