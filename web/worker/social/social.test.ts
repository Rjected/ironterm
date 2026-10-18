import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../../src/api";
import { demoData } from "../../shared/demo";
import { attach, buildFeed, buildProfile, pageItems } from "./build";
import { compare } from "./owner";
import { parseMessage } from "./peer";
import { fingerprint, friendId, generateKeyPair, importPrivate, normOrigin, parseSigHeader, precheck, SIG_HEADER, signRequest, verifyRequest } from "./sign";
import type { SocialProfile } from "./types";

const A = "https://a.example", B = "https://b.example";

async function signed(opts: { method?: string; url?: string; body?: string; now?: number; server?: string } = {}) {
  const kp = await generateKeyPair();
  const key = await importPrivate(kp.privateJwk);
  const url = opts.url ?? `${B}/social/v1/inbox?x=1`;
  const body = opts.body ?? (opts.method === "GET" ? undefined : '{"type":"unfriend","id":"12345678"}');
  const sig = await signRequest({ key, server: opts.server ?? A, method: opts.method ?? "POST", url, body, now: opts.now });
  return { kp, sig, url, body: body ?? "" };
}

async function check(req: Request, raw: string, publicKey: string, self = B, now = Date.now()) {
  const pre = precheck(req, self, false, now);
  if (!pre.ok) return pre.status;
  return (await verifyRequest(req, raw, self, publicKey, pre.parsed)) ? 200 : 401;
}

describe("signing (§2)", () => {
  it("round trip", async () => {
    const s = await signed();
    const req = new Request(s.url, { method: "POST", headers: { [SIG_HEADER]: s.sig }, body: s.body });
    expect(await check(req, s.body, s.kp.publicKey)).toBe(200);
    expect(parseSigHeader(s.sig)).toMatchObject({ server: A });
    expect(s.kp.publicKey).toMatch(/^[\w-]{43}$/);
  });

  it("rejects a tampered body, path, method, target origin or key", async () => {
    const s = await signed();
    const h = { [SIG_HEADER]: s.sig };
    expect(await check(new Request(s.url, { method: "POST", headers: h }), s.body + " ", s.kp.publicKey)).toBe(401);
    expect(await check(new Request(`${B}/social/v1/inbox?x=2`, { method: "POST", headers: h }), s.body, s.kp.publicKey)).toBe(401);
    expect(await check(new Request(`${B}/social/v1/feed?x=1`, { method: "POST", headers: h }), s.body, s.kp.publicKey)).toBe(401);
    expect(await check(new Request(s.url, { method: "PUT", headers: h }), s.body, s.kp.publicKey)).toBe(401);
    // signed for B, presented to C
    expect(await check(new Request(s.url.replace(B, "https://c.example"), { method: "POST", headers: h }), s.body, s.kp.publicKey, "https://c.example")).toBe(401);
    const other = await generateKeyPair();
    expect(await check(new Request(s.url, { method: "POST", headers: h }), s.body, other.publicKey)).toBe(401);
    // a tampered ts in the header
    const bumped = s.sig.replace(/ts="(\d+)"/, (_, t) => `ts="${Number(t) + 1}"`);
    expect(await check(new Request(s.url, { method: "POST", headers: { [SIG_HEADER]: bumped } }), s.body, s.kp.publicKey)).toBe(401);
  });

  it("enforces the 300 s clock skew", async () => {
    const now = Date.now();
    for (const [off, want] of [[-299_000, 200], [299_000, 200], [-301_000, 401], [301_000, 401]] as const) {
      const s = await signed({ now: now + off });
      expect(await check(new Request(s.url, { method: "POST", headers: { [SIG_HEADER]: s.sig } }), s.body, s.kp.publicKey, B, now)).toBe(want);
    }
  });

  it("refuses http senders unless allowed, and malformed headers", async () => {
    const s = await signed({ server: "http://a.example" });
    const req = new Request(s.url, { method: "POST", headers: { [SIG_HEADER]: s.sig } });
    expect(precheck(req, B, false).ok).toBe(false);
    expect(precheck(req, B, true).ok).toBe(true);
    expect(precheck(new Request(B, { headers: { [SIG_HEADER]: 'server="x"' } }), B, false).ok).toBe(false);
    expect(precheck(new Request(B), B, false).ok).toBe(false);
    expect(normOrigin("gym.example.com/path", false)).toBe("https://gym.example.com");
    expect(normOrigin("http://127.0.0.1:8781", false)).toBeNull();
    expect(normOrigin("http://127.0.0.1:8781/", true)).toBe("http://127.0.0.1:8781");
    expect(normOrigin("https://u:p@x.example", false)).toBeNull();
  });

  it("ids and fingerprints", async () => {
    expect(await friendId("https://gym.example.com")).toMatch(/^[0-9a-f]{12}$/);
    expect(await friendId(A)).toBe(await friendId(A));
    expect(await fingerprint((await generateKeyPair()).publicKey)).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
  });
});

describe("inbox message shapes (§4)", () => {
  const id = "0b7c5a2e-1111-4a4a-9c9c-123456789abc";
  it("accepts every message type", () => {
    expect(parseMessage({ type: "friend_request", id, from: { server: A, handle: "sam", name: "Sam", directory: null }, note: "hi" })?.type).toBe("friend_request");
    expect(parseMessage({ type: "friend_accept", id, request: id })?.type).toBe("friend_accept");
    expect(parseMessage({ type: "friend_reject", id, request: id })?.type).toBe("friend_reject");
    expect(parseMessage({ type: "unfriend", id })?.type).toBe("unfriend");
    expect(parseMessage({ type: "reaction", id, item: "w:abc", emoji: "🏆" })?.type).toBe("reaction");
    expect(parseMessage({ type: "unreaction", id, item: "pr:w1:squat:rep:5" })?.type).toBe("unreaction");
    expect(parseMessage({ type: "comment", id, item: "a:plates-225", text: "  nice  " })).toMatchObject({ text: "nice" });
  });
  it("rejects malformed ones", () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage({ type: "unfriend", id: "short" })).toBeNull();
    expect(parseMessage({ type: "reaction", id, item: "w:abc", emoji: "🍕" })).toBeNull();
    expect(parseMessage({ type: "reaction", id, item: "zz:abc", emoji: "💪" })).toBeNull();
    expect(parseMessage({ type: "comment", id, item: "w:abc", text: "x".repeat(281) })).toBeNull();
    expect(parseMessage({ type: "comment", id, item: "w:abc", text: "   " })).toBeNull();
    expect(parseMessage({ type: "friend_request", id, from: { server: A, handle: "Bad Handle" } })).toBeNull();
    expect(parseMessage({ type: "friend_request", id, from: { server: A }, note: "x".repeat(141) })).toBeNull();
    expect(parseMessage({ type: "friend_accept", id })).toBeNull();
    expect(parseMessage({ type: "nope", id })).toBeNull();
  });
});

describe("share levels (§4, §5)", () => {
  const today = "2026-10-15";
  const demo = demoData(today);
  const w0 = demo.workouts[demo.workouts.length - 1];
  const workouts = [...demo.workouts.slice(0, -1), { ...w0, description: "felt good" }];
  const b: Bootstrap = {
    mode: "local", auth: "none", settings: { unit: "lb", tz: "America/New_York", autoPush: false, graphMetric: "volume", bodyweight: 185 } as Bootstrap["settings"],
    program: demo.config, workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
  };
  const who = { server: A, handle: "sam", name: "Sam" };

  it("basic carries no weights anywhere", () => {
    const feed = buildFeed(b, "basic");
    const text = JSON.stringify(feed);
    expect(feed.length).toBeGreaterThan(100);
    expect(text).not.toMatch(/"weight"|"top"|"volume"|"prev"|"sets":\[|"note"/);
    expect(feed.filter((x) => x.kind === "session").every((x) => x.kind === "session" && x.exercises.length === 0 && x.sets > 0)).toBe(true);
    expect(feed.some((x) => x.kind === "pr")).toBe(true);
    expect(feed.some((x) => x.kind === "achievement")).toBe(true);
    const p = buildProfile(b, "basic", who);
    expect(p).toMatchObject({ share: "basic", unit: null, bodyweight: null, program: null });
    expect(p.lifts.length).toBeGreaterThan(0);
    expect(p.lifts.every((l) => l.e1rm === null && l.best === null)).toBe(true);
    expect(p.graph.levels.every((l) => l >= 0 && l <= 4 && Number.isInteger(l))).toBe(true);
    expect(p.graph.levels.length).toBeLessThanOrEqual(371);
    expect(p.graph.levels.length).toBeGreaterThan(364);
  });

  it("lifts adds top sets, PR weights, e1RM; full adds every set, volume, notes, bodyweight", () => {
    const lifts = buildFeed(b, "lifts");
    const s = lifts.find((x) => x.kind === "session" && x.exercises.length)!;
    if (s.kind !== "session") throw 0;
    expect(s.exercises.some((e) => e.top && e.top.weight > 0)).toBe(true);
    expect(s.exercises[0].sets).toBeUndefined();
    expect(s.volume).toBeUndefined();
    const pr = lifts.find((x) => x.kind === "pr")!;
    expect(pr.kind === "pr" && pr.weight! > 0).toBe(true);
    const pl = buildProfile(b, "lifts", who);
    expect(pl).toMatchObject({ unit: "lb", bodyweight: null, program: "GZCLP 4-Day" });
    expect(pl.lifts.every((l) => l.e1rm! > 0 && l.best! >= l.e1rm!)).toBe(true);

    const full = buildFeed(b, "full");
    const fs = full.find((x) => x.kind === "session")!;
    if (fs.kind !== "session") throw 0;
    expect(fs.exercises[0].sets!.length).toBeGreaterThan(0);
    expect(fs.volume).toBeGreaterThan(0);
    expect(full.find((x) => x.id === `w:${w0.id}`)).toMatchObject({ note: "felt good" });
    expect(buildProfile(b, "full", who).bodyweight).toBe(185);
  });

  it("profile numbers are in the profile's unit, and best (all-time e1RM) is never below e1rm", () => {
    const kgBoot: Bootstrap = { ...b, program: null, settings: { ...b.settings, unit: "kg", bodyweight: 84 } };
    const lbBoot: Bootstrap = { ...b, program: null };
    const kg = buildProfile(kgBoot, "full", who), lb = buildProfile(lbBoot, "full", who);
    expect(kg.unit).toBe("kg");
    expect(lb.unit).toBe("lb");
    const sqKg = kg.lifts.find((l) => l.key === "squat")!, sqLb = lb.lifts.find((l) => l.key === "squat")!;
    expect(sqLb.e1rm! / sqKg.e1rm!).toBeCloseTo(2.2046, 2);
    expect(sqLb.best! / sqKg.best!).toBeCloseTo(2.2046, 2);
    for (const p of [kg, lb]) expect(p.lifts.every((l) => l.best! >= l.e1rm!)).toBe(true);
    // `best` is the best e1RM ever, so a heavier squat day months ago shows in best but not in
    // the current (28-day) e1rm. Built here, not taken from the demo lifter, whose history may
    // happen to peak this month.
    const sqId = demo.config.liftMap?.squat;
    const recent = b.workouts.filter((w) => w.exercises.some((e) => e.exercise_template_id === sqId)).at(-1)!;
    const longAgo = new Date(Date.parse(recent.start_time) - 200 * 864e5).toISOString();
    const heavier = {
      ...recent, id: "old-heavy-squat", start_time: longAgo, end_time: longAgo,
      exercises: recent.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, weight_kg: x.weight_kg == null ? x.weight_kg : x.weight_kg * 1.3 })) })),
    };
    const withPeak = buildProfile({ ...lbBoot, workouts: [heavier, ...b.workouts] }, "full", who).lifts.find((l) => l.key === "squat")!;
    expect(withPeak.best!).toBeGreaterThan(withPeak.e1rm!);
    expect(withPeak.e1rm).toBe(sqLb.e1rm); // the old session doesn't move the current number
  });

  it("item ids are stable across builds and levels", () => {
    const ids = (s: "basic" | "lifts" | "full") => buildFeed(b, s).map((x) => x.id);
    expect(ids("basic")).toEqual(ids("basic"));
    expect(ids("basic")).toEqual(ids("full"));
    expect(new Set(ids("full")).size).toBe(ids("full").length);
    expect(ids("full").every((id) => /^(w|pr|a):/.test(id))).toBe(true);
    // newest first
    const at = buildFeed(b, "full").map((x) => x.at);
    expect([...at].sort().reverse()).toEqual(at);
  });

  it("pages by item id", () => {
    const all = buildFeed(b, "basic");
    const p1 = pageItems(all, null, 10);
    expect(p1.items).toHaveLength(10);
    const p2 = pageItems(all, p1.next, 10);
    expect(p2.items[0].id).toBe(all[10].id);
    expect(pageItems(all, "w:nope", 10)).toEqual({ items: [], next: null });
    expect(pageItems(all, all[all.length - 2].id, 10)).toEqual({ items: [all[all.length - 1]], next: null });
    expect(pageItems(all, null, 1000).items).toHaveLength(100);
  });

  it("attaches reactions and comments from current friends only", () => {
    const items = buildFeed(b, "basic").slice(0, 3);
    const who = new Map([["f1", { server: B, name: "Bo" }]]);
    const out = attach(items, [
      { id: "m1", friend_id: "f1", item: items[0].id, kind: "reaction", emoji: "🔥", text: null, at: "2026-10-15T00:00:00Z" },
      { id: "m2", friend_id: "f1", item: items[0].id, kind: "comment", emoji: null, text: "yes", at: "2026-10-15T00:00:01Z" },
      { id: "m3", friend_id: "gone", item: items[1].id, kind: "reaction", emoji: "💪", text: null, at: "2026-10-15T00:00:00Z" },
    ], who);
    expect(out[0].reactions).toEqual([{ emoji: "🔥", from: [{ server: B, name: "Bo" }] }]);
    expect(out[0].comments).toEqual([{ id: "m2", from: { server: B, name: "Bo" }, text: "yes", at: "2026-10-15T00:00:01Z" }]);
    expect(out[1].reactions).toEqual([]);
  });
});

describe("compare", () => {
  const prof = (p: Partial<SocialProfile>): SocialProfile => ({
    server: A, handle: null, name: null, share: "full", unit: "lb", streak: { current: 3, best: 5 }, week: { done: 1, target: 3 }, sessions52: 100,
    graph: { start: "2026-07-27", levels: Array.from({ length: 84 }, (_, i) => (i % 7 < 3 ? 2 : 0)) }, lifts: [], bodyweight: null, program: null, updatedAt: "", ...p,
  });
  const friend = { id: "abc", server: B, handle: "bo", name: "Bo" };

  it("converts their kg into my lb and counts weeks", () => {
    const c = compare(prof({ lifts: [{ key: "squat", name: "Back Squat", e1rm: 300, best: 275 }] }), prof({ unit: "kg", lifts: [{ key: "squat", name: "Back Squat", e1rm: 150, best: 140 }, { key: "bench", name: "Bench", e1rm: 100, best: 95 }] }), friend, { myBw: 180, iShareFull: false });
    expect(c.unit).toBe("lb");
    expect(c.lifts[0]).toEqual({ key: "squat", name: "Back Squat", me: 300, them: 330.7 });
    expect(c.lifts[1]).toMatchObject({ key: "bench", me: null, them: 220.5 });
    expect(c.weeks).toHaveLength(12);
    expect(c.weeks.every((w) => w.me === 3 && w.them === 3)).toBe(true);
    expect(c.streak).toEqual({ me: 3, them: 3 });
  });

  it("bodyweight multiples only when both share bodyweight", () => {
    const mine = prof({ lifts: [{ key: "squat", name: "Back Squat", e1rm: 360, best: 315 }] });
    const theirs = prof({ unit: "kg", bodyweight: 80, lifts: [{ key: "squat", name: "Back Squat", e1rm: 160, best: 150 }] });
    expect(compare(mine, theirs, friend, { myBw: 180, iShareFull: true }).lifts[0]).toMatchObject({ meBw: 2, themBw: 2 });
    expect(compare(mine, theirs, friend, { myBw: 180, iShareFull: false }).lifts[0].meBw).toBeUndefined();
    expect(compare(mine, { ...theirs, bodyweight: null }, friend, { myBw: 180, iShareFull: true }).lifts[0].meBw).toBeUndefined();
    // basic: no numbers from them at all
    expect(compare(mine, prof({ unit: null, share: "basic", lifts: [{ key: "squat", name: "Back Squat", e1rm: null, best: null }] }), friend, { myBw: 180, iShareFull: true }).lifts[0].them).toBeNull();
  });
});
