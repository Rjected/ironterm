// A friend's server is someone else's code. Its profile and feed are rebuilt here field by field
// into the wire types, so a wrong type, a missing field or a junk value shows up as an empty
// value for that friend, never as a crash in compare, the merged feed or the web UI.

import { PeerError } from "./net";
import { EMOJI, isShare, type Comment, type FeedItem, type FeedPage, type Reactions, type SocialProfile } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => { const n = num(v); return n != null && n > 0 ? Math.min(Math.round(n), 1e6) : 0; };
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const unitOf = (v: unknown) => (v === "kg" || v === "lb" ? v : null);
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const instant = (v: unknown): string | null => (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null);

const bad = (what: string) => new PeerError(`their server sent a malformed ${what}`, 502);

export function profileFrom(x: unknown): SocialProfile {
  if (!isObj(x)) throw bad("profile");
  const g = isObj(x.graph) ? x.graph : {};
  const streak = isObj(x.streak) ? x.streak : {};
  const week = isObj(x.week) ? x.week : {};
  const start = day(g.start);
  return {
    server: str(x.server) ?? "", handle: str(x.handle, 40), name: str(x.name, 100), share: isShare(x.share) ? x.share : "basic",
    unit: unitOf(x.unit),
    streak: { current: count(streak.current), best: count(streak.best) },
    week: { done: count(week.done), target: count(week.target) },
    sessions52: count(x.sessions52),
    // without a real start date the levels can't be placed on a calendar
    graph: start ? { start, levels: list(g.levels, 400).map((v) => Math.max(0, Math.min(4, Math.round(num(v) ?? 0)))) } : { start: "2000-01-03", levels: [] },
    lifts: list(x.lifts, 50).filter(isObj).flatMap((l) => {
      const key = str(l.key, 60);
      return key ? [{ key, name: str(l.name, 100) ?? key, e1rm: num(l.e1rm), best: num(l.best) }] : [];
    }),
    bodyweight: num(x.bodyweight),
    program: str(x.program, 100),
    updatedAt: instant(x.updatedAt) ?? new Date(0).toISOString(),
  };
}

const author = (v: unknown) => (isObj(v) && str(v.server) ? { server: str(v.server)!, name: str(v.name, 100) } : null);

function reactions(v: unknown): Reactions[] {
  return list(v, 20).filter(isObj).flatMap((r) => {
    const emoji = str(r.emoji, 8);
    if (!emoji || !(EMOJI as readonly string[]).includes(emoji)) return [];
    return [{ emoji, from: list(r.from, 200).map(author).filter((a) => a != null) }];
  });
}

function comments(v: unknown): Comment[] {
  return list(v, 200).filter(isObj).flatMap((c) => {
    const id = str(c.id, 100), from = author(c.from), text = str(c.text, 1000), at = instant(c.at);
    return id && from && text != null && at ? [{ id, from, text, at }] : [];
  });
}

function item(x: unknown): FeedItem | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 200), at = instant(x.at);
  if (!id || !at) return null;
  const base = { id, at, reactions: reactions(x.reactions), comments: comments(x.comments) };
  if (x.kind === "session") {
    const volume = num(x.volume), note = str(x.note, 2000);
    return {
      ...base, kind: "session", title: str(x.title) ?? "Workout", durationMin: count(x.durationMin), sets: count(x.sets),
      exercises: list(x.exercises, 50).filter(isObj).map((e) => {
        const top = isObj(e.top) && num(e.top.weight) != null && num(e.top.reps) != null ? { weight: num(e.top.weight)!, reps: num(e.top.reps)! } : null;
        const out: { name: string; lift: string | null; top?: { weight: number; reps: number } | null; sets?: { weight: number | null; reps: number | null }[] } = { name: str(e.name) ?? "Exercise", lift: str(e.lift, 60), top };
        if (Array.isArray(e.sets)) out.sets = list(e.sets, 100).filter(isObj).map((s) => ({ weight: num(s.weight), reps: num(s.reps) }));
        return out;
      }),
      ...(volume != null ? { volume } : {}), ...(note != null ? { note } : {}),
    };
  }
  if (x.kind === "pr") {
    const lift = str(x.lift, 60);
    if (!lift) return null;
    const weight = num(x.weight);
    return {
      ...base, kind: "pr", lift, liftName: str(x.liftName, 100) ?? lift, prKind: str(x.prKind, 40) ?? "e1rm", reps: count(x.reps),
      ...(weight != null ? { weight } : {}), ...("prev" in x ? { prev: num(x.prev) } : {}),
    };
  }
  if (x.kind === "achievement") {
    const title = str(x.title);
    return title ? { ...base, kind: "achievement", title, tier: str(x.tier, 40) ?? "", description: str(x.description, 500) ?? "" } : null;
  }
  return null; // a kind this version doesn't know
}

export function feedFrom(x: unknown): FeedPage {
  if (!isObj(x) || !Array.isArray(x.items)) throw bad("feed");
  return {
    items: list(x.items, 200).map(item).filter((i) => i != null),
    next: str(x.next, 200), share: isShare(x.share) ? x.share : "basic", unit: unitOf(x.unit),
  };
}
