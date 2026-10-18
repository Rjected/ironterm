// Social end to end, in process: one directory and three servers (A, B, C), each the real worker on
// its own Node SQLite database, with fetch routed between them by origin.
//
// Regenerate docs/api/social/*.json with WRITE_FIXTURES=1 pnpm test (ids and dates change each run).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../index";
import directory from "../../directory/worker";
import { NodeD1 } from "../../server/d1";
import { demoData } from "../../shared/demo";
import type { HevyWorkout } from "../../shared/hevy";
import { ensureSchema, kvPut, upsertWorkouts } from "../store";
import { createToken } from "../tokens";
import { identity, putFriend } from "./db";
import { signedFetch } from "./net";
import { friendId, generateKeyPair, importPrivate, SIG_HEADER, signRequest } from "./sign";
import type { Compare, FeedItem, Friend, SocialMe, SocialProfile } from "./types";

const WRITE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WRITE_FIXTURES === "1";
async function fixture(name: string, data: unknown) {
  if (!WRITE) return;
  const fs = "node:fs";
  const { writeFileSync, mkdirSync } = (await import(/* @vite-ignore */ fs)) as { writeFileSync: (u: URL, s: string) => void; mkdirSync: (u: URL, o: object) => void };
  mkdirSync(new URL("../../../docs/api/social/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../../../docs/api/social/${name}.json`, import.meta.url), JSON.stringify(data, null, 2) + "\n");
}

const TZ = "America/New_York";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const DIR = "https://dir.test";
const ORIGINS = { A: "https://a.test", B: "https://b.test", C: "https://c.test" } as const;
type Who = keyof typeof ORIGINS;

const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {}, props: {} } as never;
const pending: Promise<unknown>[] = [];
const dirEnv = { DB: new NodeD1(":memory:") };
const envs = Object.fromEntries((Object.keys(ORIGINS) as Who[]).map((k) => [k, { DB: new NodeD1(":memory:"), TIMEZONE: TZ, SOCIAL_DIRECTORY: DIR, APP_PASSWORD: "pw", SESSION_SECRET: "s" }])) as unknown as Record<Who, { DB: NodeD1; [k: string]: unknown }>;
const tokens = {} as Record<Who, string>;
const offline = new Set<string>();
/** origin → public key its .well-known should claim instead (a server whose key changed) */
const keyOverride = new Map<string, string>();
/** origin → a body its /social/v1/* answers should be replaced with (a broken or hostile server) */
const tamper = new Map<string, string>();
const realFetch = globalThis.fetch;

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input as RequestInfo, init);
  const origin = new URL(req.url).origin;
  if (offline.has(origin)) throw new TypeError("fetch failed");
  if (origin === DIR) return directory.fetch(req as never, dirEnv as never);
  const who = (Object.keys(ORIGINS) as Who[]).find((k) => ORIGINS[k] === origin);
  if (!who) throw new TypeError(`no route to ${origin}`);
  const r = await worker.fetch!(req as never, envs[who] as never, ctx);
  if (keyOverride.has(origin) && new URL(req.url).pathname === "/.well-known/ironterm") return Response.json({ ...(await r.json() as object), publicKey: keyOverride.get(origin) });
  if (tamper.has(origin) && r.ok && new URL(req.url).pathname.startsWith("/social/v1/") && req.method === "GET") return new Response(tamper.get(origin), { headers: { "content-type": "application/json" } });
  return r;
}

async function call<T = any>(who: Who, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await route(`${ORIGINS[who]}${path}`, { method, headers: { authorization: `Bearer ${tokens[who]}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: (await r.json()) as T };
}

/** A's data: the demo year in lb. B: a lighter-attended, heavier year in kg, with notes. C: demo mode. */
function dataFor(who: Who): { workouts: HevyWorkout[]; settings: Record<string, unknown> } | null {
  const demo = demoData(today).workouts;
  if (who === "A") return { workouts: demo.map((w) => ({ ...w, id: `a-${w.id}` })), settings: { unit: "lb", bodyweight: 190 } };
  if (who === "B") {
    const ws = demo.filter((_, i) => i % 3 !== 1).map((w, i, all) => ({
      ...w, id: `b-${w.id}`, title: w.title.replace("GZCLP", "Strength"),
      description: i === all.length - 1 ? "Felt strong, belt on the top set." : w.description,
      exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, weight_kg: s.weight_kg != null ? Math.round(s.weight_kg * 1.12 * 100) / 100 : null })) })),
    }));
    return { workouts: ws, settings: { unit: "kg", bodyweight: 88 } };
  }
  return null;
}

const items = (d: { items: FeedItem[] }) => d.items;
let aId = "", bId = "", cId = "";

beforeAll(async () => {
  vi.stubGlobal("fetch", route);
  for (const who of Object.keys(ORIGINS) as Who[]) {
    const db = envs[who].DB as unknown as D1Database;
    await ensureSchema(db);
    const d = dataFor(who);
    if (d) {
      for (let i = 0; i < d.workouts.length; i += 200) await upsertWorkouts(db, d.workouts.slice(i, i + 200));
      await kvPut(db, "settings", { tz: TZ, ...d.settings });
    }
    tokens[who] = (await createToken(db, "test")).token;
  }
  [aId, bId, cId] = await Promise.all([friendId(ORIGINS.A), friendId(ORIGINS.B), friendId(ORIGINS.C)]);
});
afterAll(async () => { await Promise.allSettled(pending); vi.stubGlobal("fetch", realFetch); vi.unstubAllGlobals(); });

describe("social end to end", () => {
  it("serves .well-known before setup, with a key and no handle", async () => {
    const r = await route(`${ORIGINS.A}/.well-known/ironterm`);
    const wk = await r.json() as any;
    expect(r.status).toBe(200);
    expect(wk).toMatchObject({ v: 1, server: ORIGINS.A, handle: null, name: null, directory: null, software: "ironterm" });
    expect(wk.publicKey).toMatch(/^[\w-]{43}$/);
    // owner API stays behind the login
    expect((await route(`${ORIGINS.A}/api/social/me`)).status).toBe(401);
  });

  it("sets up and registers with the directory", async () => {
    expect((await call("A", "POST", "/api/social/setup", { handle: "alice", name: "Alice", listed: true })).data).toEqual({ ok: true, handle: "alice" });
    expect((await call("B", "POST", "/api/social/setup", { handle: "bob", name: "Bob", listed: true })).status).toBe(200);
    expect((await call("C", "POST", "/api/social/setup", { handle: "carol", name: "Carol", listed: false })).status).toBe(200);
    expect((await call("A", "POST", "/api/social/setup", { handle: "No Caps", name: "x" })).status).toBe(400);
    const me = (await call<SocialMe>("A", "GET", "/api/social/me")).data;
    expect(me).toMatchObject({ enabled: true, handle: "alice", name: "Alice", server: ORIGINS.A, directory: DIR, listed: true });
    expect(me.fingerprint).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    await fixture("me", me);
    const wk = await (await route(`${ORIGINS.A}/.well-known/ironterm`)).json() as any;
    expect(wk).toMatchObject({ handle: "alice", name: "Alice", directory: DIR });
  });

  it("the directory refuses a handle takeover by another key", async () => {
    const r = await call("C", "POST", "/api/social/setup", { handle: "bob", name: "Not Bob", listed: true });
    expect(r.status).toBe(409);
    // C's own registration survives the failed attempt
    expect((await call<SocialMe>("C", "GET", "/api/social/me")).data.handle).toBe("carol");
    const bob = await (await route(`${DIR}/v1/users/bob`)).json() as any;
    expect(bob.server).toBe(ORIGINS.B);
  });

  it("searches listed users only; unlisted still resolve by exact handle", async () => {
    const s = (await call("A", "GET", "/api/social/search?q=bo")).data;
    expect(s.users).toEqual([{ handle: "bob", name: "Bob", server: ORIGINS.B }]);
    await fixture("search", s);
    expect((await call("A", "GET", "/api/social/search?q=car")).data.users).toEqual([]);
    expect((await route(`${DIR}/v1/users/carol`)).status).toBe(200);
  });

  it("A requests B; B accepts at lifts", async () => {
    const r = await call<{ friend: Friend }>("A", "POST", "/api/social/friends", { handle: "bob", note: "Gym buddy from Tuesdays", share: "full" });
    expect(r.status).toBe(200);
    expect(r.data.friend).toMatchObject({ id: bId, server: ORIGINS.B, handle: "bob", name: "Bob", status: "outgoing", share: "full", theirShare: null });
    // twice: already sent
    expect((await call("A", "POST", "/api/social/friends", { handle: "bob" })).status).toBe(409);

    const bf = (await call<{ friends: Friend[] }>("B", "GET", "/api/social/friends")).data.friends;
    expect(bf).toHaveLength(1);
    expect(bf[0]).toMatchObject({ id: aId, handle: "alice", status: "incoming", note: "Gym buddy from Tuesdays" });
    // not friends yet: nothing to read
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/feed`)).status).toBe(403);

    const acc = await call<{ friend: Friend }>("B", "POST", `/api/social/friends/${aId}/accept`, { share: "lifts" });
    expect(acc.status).toBe(200);
    expect(acc.data.friend).toMatchObject({ status: "friends", share: "lifts" });
    const af = (await call<{ friends: Friend[] }>("A", "GET", "/api/social/friends")).data.friends;
    expect(af[0]).toMatchObject({ id: bId, status: "friends", share: "full" });
    const an = (await call("A", "GET", "/api/social/notifications")).data;
    expect(an.items[0]).toMatchObject({ kind: "accepted", from: { id: bId, handle: "bob" }, read: false });
  });

  it("A sees B's profile and feed with weights, in B's unit", async () => {
    const p = (await call<{ profile: SocialProfile; stale: boolean }>("A", "GET", `/api/social/friends/${bId}/profile?fresh=1`)).data;
    expect(p.stale).toBe(false);
    expect(p.profile).toMatchObject({ server: ORIGINS.B, handle: "bob", share: "lifts", unit: "kg", bodyweight: null });
    expect(p.profile.graph.levels.length).toBeGreaterThan(360);
    expect(p.profile.lifts.find((l) => l.key === "squat")!.e1rm).toBeGreaterThan(50);
    expect(p.profile.program).toBeNull(); // B has no program configured

    const f = (await call("A", "GET", `/api/social/friends/${bId}/feed?fresh=1`)).data;
    const sess = items(f).find((x) => x.kind === "session") as any;
    expect(sess.exercises.length).toBeGreaterThan(0);
    expect(sess.exercises.some((e: any) => e.top?.weight > 0)).toBe(true);
    expect(sess.exercises[0].sets).toBeUndefined(); // full only
    expect(sess.author).toMatchObject({ id: bId, handle: "bob", unit: "kg" });
    expect(sess.unit).toBe("kg");
    expect(p.profile.lifts.every((l) => l.best! >= l.e1rm!)).toBe(true);
    const pr = items(f).find((x) => x.kind === "pr") as any;
    expect(pr.weight).toBeGreaterThan(0);
    // theirShare learned from the response
    expect((await call<{ friends: Friend[] }>("A", "GET", "/api/social/friends")).data.friends[0].theirShare).toBe("lifts");
  });

  it("A reacts and comments; B sees them in mine and notifications", async () => {
    const f = (await call("A", "GET", `/api/social/friends/${bId}/feed`)).data;
    const target = items(f).find((x) => x.kind === "session")!;
    const pr = items(f).find((x) => x.kind === "pr")!;
    expect((await call("A", "POST", "/api/social/react", { friend: bId, item: target.id, emoji: "💪" })).status).toBe(200);
    expect((await call("A", "POST", "/api/social/react", { friend: bId, item: pr.id, emoji: "🔥" })).status).toBe(200);
    expect((await call("A", "POST", "/api/social/comment", { friend: bId, item: target.id, text: "Big week, nice work." })).status).toBe(200);
    expect((await call("A", "POST", "/api/social/react", { friend: bId, item: target.id, emoji: "🍕" })).status).toBe(400);
    expect((await call("A", "POST", "/api/social/react", { friend: bId, item: "w:nope", emoji: "💪" })).status).toBe(400);

    const mine = (await call("B", "GET", "/api/social/mine")).data;
    const it = items(mine).find((x) => x.id === target.id)!;
    expect(it.reactions).toEqual([{ emoji: "💪", from: [{ server: ORIGINS.A, name: "Alice" }] }]);
    expect(it.comments).toMatchObject([{ from: { server: ORIGINS.A, name: "Alice" }, text: "Big week, nice work." }]);
    await fixture("mine", mine);
    const n = (await call("B", "GET", "/api/social/notifications")).data;
    expect(n.items.map((x: any) => x.kind)).toEqual(["comment", "reaction", "reaction", "request"]);
    expect(n.unread).toBe(4);
    await fixture("notifications", n);
    expect((await call("B", "POST", "/api/social/notifications/read")).status).toBe(200);
    expect((await call("B", "GET", "/api/social/notifications")).data.unread).toBe(0);

    // A's next read of B's feed includes the reaction (the cache was dropped on react)
    const again = (await call("A", "GET", `/api/social/friends/${bId}/feed`)).data;
    expect(items(again).find((x) => x.id === target.id)!.reactions[0].emoji).toBe("💪");
    // unreact
    expect((await call("A", "POST", "/api/social/react", { friend: bId, item: pr.id, emoji: null })).status).toBe(200);
    expect(items((await call("B", "GET", "/api/social/mine")).data).find((x) => x.id === pr.id)?.reactions ?? []).toEqual([]);
  });

  it("merged feed, compare and friend list (fixtures)", async () => {
    const feed = (await call("A", "GET", "/api/social/feed?fresh=1&limit=20")).data;
    expect(feed.items).toHaveLength(20);
    expect(feed.stale).toEqual([]);
    expect(feed.next).toBeTruthy();
    const page2 = (await call("A", "GET", `/api/social/feed?limit=20&before=${encodeURIComponent(feed.next)}`)).data;
    expect(page2.items[0].id).not.toBe(feed.items[0].id);
    expect(page2.items[0].at <= feed.items[19].at).toBe(true);
    await fixture("feed", feed);

    const cmp = (await call<Compare>("A", "GET", `/api/social/compare/${bId}`)).data;
    expect(cmp.unit).toBe("lb");
    const sq = cmp.lifts.find((l) => l.key === "squat")!;
    expect(sq.me).toBeGreaterThan(0);
    // B's kg converted to lb: about 1.12 × A's numbers (B's data is A's × 1.12, fewer sessions)
    expect(sq.them! / sq.me!).toBeGreaterThan(0.95);
    expect(sq.them! / sq.me!).toBeLessThan(1.4);
    expect(sq.meBw).toBeUndefined(); // B shares lifts, not full: no bodyweight
    expect(cmp.weeks).toHaveLength(12);
    const p = (await call("A", "GET", `/api/social/friends/${bId}/profile`)).data;
    await fixture("profile", p);
    await fixture("friends", (await call("A", "GET", "/api/social/friends")).data);
  });

  it("at full: every set, notes, bodyweight multiples in compare", async () => {
    expect((await call("B", "PUT", `/api/social/friends/${aId}`, { share: "full" })).status).toBe(200);
    const f = (await call("A", "GET", `/api/social/friends/${bId}/feed?fresh=1`)).data;
    const sess = items(f).find((x) => x.kind === "session") as any;
    expect(sess.exercises[0].sets.length).toBeGreaterThan(0);
    expect(sess.volume).toBeGreaterThan(0);
    expect(items(f).some((x: any) => x.note === "Felt strong, belt on the top set.")).toBe(true);
    const cmp = (await call<Compare>("A", "GET", `/api/social/compare/${bId}?fresh=1`)).data;
    const sq = cmp.lifts.find((l) => l.key === "squat")!;
    expect(sq.meBw).toBeCloseTo(sq.me! / 190, 1);
    expect(sq.themBw).toBeGreaterThan(0);
    await fixture("compare", cmp);
    await fixture("feed-full", (await call("A", "GET", `/api/social/friends/${bId}/feed?limit=5`)).data);
  });

  it("B lowers A to basic: the next fresh fetch has no weights", async () => {
    expect((await call("B", "PUT", `/api/social/friends/${aId}`, { share: "basic" })).status).toBe(200);
    // the 5-minute cache still has the old copy…
    expect(JSON.stringify((await call("A", "GET", `/api/social/friends/${bId}/feed`)).data)).toContain('"weight"');
    // …fresh=1 doesn't
    const f = (await call("A", "GET", `/api/social/friends/${bId}/feed?fresh=1`)).data;
    expect(f.items.length).toBeGreaterThan(0);
    const text = JSON.stringify(f);
    expect(text).not.toContain('"weight"');
    expect(text).not.toContain('"top"');
    expect(items(f).filter((x) => x.kind === "session").every((x: any) => x.exercises.length === 0)).toBe(true);
    expect(items(f).every((x: any) => x.unit === null && x.author.unit === null)).toBe(true);
    const p = (await call<{ profile: SocialProfile }>("A", "GET", `/api/social/friends/${bId}/profile?fresh=1`)).data.profile;
    expect(p).toMatchObject({ share: "basic", unit: null, bodyweight: null, program: null });
    expect(p.lifts.every((l) => l.e1rm === null && l.best === null)).toBe(true);
    expect(p.streak.best).toBeGreaterThan(0);
    const cmp = (await call<Compare>("A", "GET", `/api/social/compare/${bId}`)).data;
    expect(cmp.lifts.every((l) => l.them === null)).toBe(true);
  });

  it("a stranger gets 403; forged and replayed signatures get 401; duplicates 409", async () => {
    // C isn't B's friend
    expect((await signedFetch(envs.C.DB as never, ORIGINS.C, `${ORIGINS.B}/social/v1/feed`)).status).toBe(403);
    expect((await signedFetch(envs.C.DB as never, ORIGINS.C, `${ORIGINS.B}/social/v1/profile`)).status).toBe(403);
    expect((await signedFetch(envs.C.DB as never, ORIGINS.C, `${ORIGINS.B}/social/v1/inbox`, "POST", { type: "reaction", id: crypto.randomUUID(), item: "w:x", emoji: "💪" })).status).toBe(403);
    // C signs but claims to be A
    const { key: cKey } = await identity(envs.C.DB as never);
    const forged = await signRequest({ key: cKey, server: ORIGINS.A, method: "GET", url: `${ORIGINS.B}/social/v1/feed` });
    expect((await route(`${ORIGINS.B}/social/v1/feed`, { headers: { [SIG_HEADER]: forged } })).status).toBe(401);
    // no signature at all
    expect((await route(`${ORIGINS.B}/social/v1/feed`)).status).toBe(401);
    // A's real key, but a timestamp from 10 minutes ago
    const { key: aKey } = await identity(envs.A.DB as never);
    const old = await signRequest({ key: aKey, server: ORIGINS.A, method: "GET", url: `${ORIGINS.B}/social/v1/feed`, now: Date.now() - 600_000 });
    expect((await route(`${ORIGINS.B}/social/v1/feed`, { headers: { [SIG_HEADER]: old } })).status).toBe(401);
    // signed for another target
    const wrongTarget = await signRequest({ key: aKey, server: ORIGINS.A, method: "GET", url: `${ORIGINS.C}/social/v1/feed` });
    expect((await route(`${ORIGINS.B}/social/v1/feed`, { headers: { [SIG_HEADER]: wrongTarget } })).status).toBe(401);
    // the same inbox message twice (inside the window)
    const items0 = items((await call("B", "GET", "/api/social/mine")).data);
    const msg = { type: "comment", id: crypto.randomUUID(), item: items0[0].id, text: "again?" };
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/inbox`, "POST", msg)).status).toBe(202);
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/inbox`, "POST", msg)).status).toBe(409);
    // malformed
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/inbox`, "POST", { type: "comment", id: crypto.randomUUID(), item: items0[0].id, text: "x".repeat(281) })).status).toBe(400);
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/inbox`, "POST", { type: "bogus", id: crypto.randomUUID() })).status).toBe(400);
  });

  it("B offline: A gets the stale copy", async () => {
    offline.add(ORIGINS.B);
    try {
      const f = (await call("A", "GET", "/api/social/feed?fresh=1")).data;
      expect(f.stale).toEqual([bId]);
      expect(f.items.length).toBeGreaterThan(0);
      const p = (await call("A", "GET", `/api/social/friends/${bId}/profile?fresh=1`)).data;
      expect(p.stale).toBe(true);
      expect(p.profile.handle).toBe("bob");
    } finally {
      offline.delete(ORIGINS.B);
    }
  });

  it("a friend's server sending junk is an error or a stale copy, never a 500", async () => {
    const junk = [
      "not json", "null", "[]", '{"items":"x"}',
      '{"graph":{"start":"soon","levels":7},"lifts":"many","streak":null,"unit":"stone","share":"admin"}',
      '{"items":[null,{"id":1},{"id":"x","at":"never","kind":"session"},{"id":"y","at":"2026-01-01T00:00:00Z","kind":"pr","lift":{"$gt":1}}],"next":{}}',
    ];
    try {
      for (const body of junk) {
        tamper.set(ORIGINS.B, body);
        for (const p of ["/api/social/feed?fresh=1", `/api/social/friends/${bId}/feed?fresh=1`, `/api/social/friends/${bId}/profile?fresh=1`, `/api/social/compare/${bId}?fresh=1`]) {
          const r = await call("A", "GET", p);
          expect(r.status, `${p} with ${body}`).not.toBe(500);
          if (r.status !== 200) expect(r.status, `${p} with ${body}`).toBe(502);
        }
      }
      // with nothing cached, a profile that isn't one is a clear 502 rather than garbage
      tamper.set(ORIGINS.B, "[]");
      await envs.A.DB.prepare("DELETE FROM kv WHERE key LIKE ?").bind("social:cache:%").run();
      const r = await call("A", "GET", `/api/social/friends/${bId}/profile?fresh=1`);
      expect(r.status).toBe(502);
      expect(r.data.error).toMatch(/can.t read/);
    } finally {
      tamper.delete(ORIGINS.B);
    }
  });

  it("C requests A; A rejects; C's request disappears on both sides", async () => {

    // add by server URL, no directory
    const r = await call<{ friend: Friend }>("C", "POST", "/api/social/friends", { server: "a.test" });
    expect(r.status).toBe(200);
    expect((await call<{ friends: Friend[] }>("A", "GET", "/api/social/friends")).data.friends.find((f) => f.id === cId)?.status).toBe("incoming");
    expect((await call("A", "POST", `/api/social/friends/${cId}/reject`)).status).toBe(200);
    expect((await call<{ friends: Friend[] }>("C", "GET", "/api/social/friends")).data.friends).toEqual([]);
    expect((await call<{ friends: Friend[] }>("A", "GET", "/api/social/friends")).data.friends.map((f) => f.id)).toEqual([bId]);
  });

  it("pins keys: a friend's changed key is rejected", async () => {
    const kp = await generateKeyPair();
    const key = await importPrivate(kp.privateJwk);
    keyOverride.set(ORIGINS.A, kp.publicKey);
    try {
      const sig = await signRequest({ key, server: ORIGINS.A, method: "GET", url: `${ORIGINS.B}/social/v1/feed` });
      expect((await route(`${ORIGINS.B}/social/v1/feed`, { headers: { [SIG_HEADER]: sig } })).status).toBe(401);
      // a new friend request with the new key is still checked against the pin
      const body = JSON.stringify({ type: "friend_request", id: crypto.randomUUID(), from: { server: ORIGINS.A, handle: "alice", name: "Alice", directory: null } });
      const sig2 = await signRequest({ key, server: ORIGINS.A, method: "POST", url: `${ORIGINS.B}/social/v1/inbox`, body });
      expect((await route(`${ORIGINS.B}/social/v1/inbox`, { method: "POST", headers: { [SIG_HEADER]: sig2, "content-type": "application/json" }, body })).status).toBe(401);
    } finally {
      keyOverride.delete(ORIGINS.A);
    }
    // the old key still works
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/profile`)).status).toBe(200);
  });

  it("a stranger can't borrow someone else's directory handle", async () => {
    const msg = { type: "friend_request", id: crypto.randomUUID(), from: { server: ORIGINS.C, handle: "alice", name: "Alice", directory: DIR } };
    expect((await signedFetch(envs.C.DB as never, ORIGINS.C, `${ORIGINS.B}/social/v1/inbox`, "POST", msg)).status).toBe(401);
    // from.server must be the signer
    const msg2 = { type: "friend_request", id: crypto.randomUUID(), from: { server: ORIGINS.A, handle: null, name: "Alice", directory: null } };
    expect((await signedFetch(envs.C.DB as never, ORIGINS.C, `${ORIGINS.B}/social/v1/inbox`, "POST", msg2)).status).toBe(400);
  });

  it("unfriend: 403 afterwards and their reactions are gone", async () => {
    expect((await call("A", "DELETE", `/api/social/friends/${bId}`)).data).toEqual({ ok: true, notified: true });
    expect((await call<{ friends: Friend[] }>("B", "GET", "/api/social/friends")).data.friends).toEqual([]);
    const mine = items((await call("B", "GET", "/api/social/mine?limit=100")).data);
    expect(mine.every((x) => x.reactions.length === 0 && x.comments.length === 0)).toBe(true);
    expect((await call("B", "GET", "/api/social/notifications")).data.items.filter((n: any) => n.from.id === aId)).toEqual([]);
    expect((await signedFetch(envs.A.DB as never, ORIGINS.A, `${ORIGINS.B}/social/v1/feed`)).status).toBe(403);
    expect((await call("A", "GET", `/api/social/friends/${bId}/feed`)).status).toBe(404);
  });

  it("caps incoming requests at 50 (429)", async () => {
    const db = envs.A.DB as never;
    for (let i = 0; i < 50; i++) {
      const server = `https://pending${i}.test`;
      await putFriend(db, { id: await friendId(server), server, handle: null, name: null, directory: null, public_key: "x", status: "incoming", share: "basic", their_share: null, request_id: crypto.randomUUID(), note: null, since: new Date().toISOString(), last_seen: null });
    }
    const r = await call("C", "POST", "/api/social/friends", { server: ORIGINS.A });
    expect(r.status).toBe(429);
    expect((await call<{ friends: Friend[] }>("C", "GET", "/api/social/friends")).data.friends).toEqual([]);
    for (let i = 0; i < 50; i++) await call("A", "DELETE", `/api/social/friends/${await friendId(`https://pending${i}.test`)}`);
    expect((await call<{ friends: Friend[] }>("A", "GET", "/api/social/friends")).data.friends).toEqual([]);
  });

  it("unregisters from the directory; friends by URL keep working", async () => {
    expect((await call("C", "DELETE", "/api/social/setup")).status).toBe(200);
    expect((await route(`${DIR}/v1/users/carol`)).status).toBe(404);
    expect((await call<SocialMe>("C", "GET", "/api/social/me")).data).toMatchObject({ enabled: true, handle: "carol", directory: null });
  });
});
