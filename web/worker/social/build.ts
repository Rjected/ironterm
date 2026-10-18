// What a friend gets to see: profile and feed built from the owner's data, filtered by the share
// level the owner gave that friend. Pure (no storage), so it is unit-tested directly.
//
//   basic  streak, sessions/week, graph levels, PRs and achievements without weights; session items
//          carry title, duration and set count only
//   lifts  + weights on PRs, e1RM / best per lift, exercises with their top set, program name
//   full   + every set, session volume, workout notes, bodyweight

import type { Bootstrap } from "../../src/api";
import { derive, type Derived } from "../../src/derive";
import { evaluateAchievements } from "../../shared/achievements";
import { liftName, matchLift } from "../../shared/lifts";
import { recentPRs } from "../../shared/prwall";
import { snapshot } from "../../shared/snapshot";
import { addDays, durationMin, localDate, workingSets, workoutVolumeKg } from "../../shared/stats";
import { fromKg } from "../../shared/units";
import type { InteractionRow } from "./db";
import { atLeast, EMOJI, type FeedItem, type Share, type SocialProfile } from "./types";

const r1 = (x: number) => Math.round(x * 10) / 10;
/** The feed reaches back this far. */
export const FEED_DAYS = 365;

export function latestBodyweight(b: Bootstrap, unit: "kg" | "lb"): number | null {
  if (b.settings.bodyweight && b.settings.bodyweight > 0) return r1(b.settings.bodyweight);
  const all = [
    ...(b.weighins ?? []).map((w) => ({ date: w.date, kg: w.kg })),
    ...(b.body ?? []).map((w) => ({ date: w.date, kg: w.weightKg })),
  ].filter((x) => x.kg > 0).sort((a, z) => a.date.localeCompare(z.date));
  const last = all[all.length - 1];
  return last ? r1(fromKg(last.kg, unit)) : null;
}

export function buildProfile(b: Bootstrap, share: Share, who: { server: string; handle: string | null; name: string | null }, d: Derived = derive(b, b.settings.graphMetric ?? "volume"), now = new Date()): SocialProfile {
  const snap = snapshot(b, now);
  const lifts = atLeast(share, "lifts");
  return {
    server: who.server, handle: who.handle, name: who.name, share,
    unit: lifts ? d.unit : null,
    streak: snap.streak,
    week: { done: snap.week.done, target: snap.week.target },
    sessions52: snap.totals.sessions52,
    graph: { start: snap.graph.start, levels: snap.graph.days.map((x) => x.level) },
    lifts: snap.lifts.map((l) => {
      const pts = d.lifts[l.key] ?? [];
      // best e1RM ever; never below the current one
      const best = pts.length ? r1(Math.max(l.e1rm, ...pts.map((p) => p.e1rm))) : null;
      return { key: l.key, name: l.name, e1rm: lifts ? l.e1rm : null, best: lifts ? best : null };
    }),
    bodyweight: share === "full" ? latestBodyweight(b, d.unit) : null,
    program: lifts ? (d.def?.name ?? null) : null,
    updatedAt: now.toISOString(),
  };
}

/** Every feed item for the last FEED_DAYS, newest first, with no reactions attached yet. */
export function buildFeed(b: Bootstrap, share: Share, d: Derived = derive(b, "volume")): FeedItem[] {
  const { unit, tz, today } = d;
  const since = addDays(today, -FEED_DAYS);
  const asc = [...d.workouts].reverse();
  const lifts = atLeast(share, "lifts");
  const full = share === "full";
  const out: FeedItem[] = [];
  const base = (id: string, at: string) => ({ id, at, reactions: [], comments: [] });

  for (const w of asc) {
    if (localDate(w.start_time, tz) < since) continue;
    out.push({
      ...base(`w:${w.id}`, w.start_time), kind: "session", title: w.title || "Workout",
      durationMin: Math.round(durationMin(w)), sets: workingSets(w),
      exercises: !lifts ? [] : w.exercises.map((e) => {
        const work = e.sets.filter((s) => s.type !== "warmup" && (s.reps ?? 0) > 0 && (s.weight_kg ?? 0) > 0);
        const top = work.length ? work.reduce((a, s) => ((s.weight_kg ?? 0) > (a.weight_kg ?? 0) ? s : a)) : null;
        return {
          name: e.title, lift: matchLift(e.title, e.exercise_template_id, d.liftMap),
          top: top ? { weight: r1(fromKg(top.weight_kg ?? 0, unit)), reps: top.reps ?? 0 } : null,
          ...(full ? { sets: e.sets.map((s) => ({ weight: s.weight_kg != null ? r1(fromKg(s.weight_kg, unit)) : null, reps: s.reps ?? null })) } : {}),
        };
      }),
      ...(full ? { volume: Math.round(fromKg(workoutVolumeKg(w), unit)), ...(w.description?.trim() ? { note: w.description.trim() } : {}) } : {}),
    });
  }

  // One rep-max item per weight per lift per session (a top single and double at the same load
  // read as one PR: keep the higher rep count).
  const prs = recentPRs(asc, since, { unit, tz, map: d.liftMap });
  const bestRep = new Map<string, number>();
  for (const p of prs) if (p.kind === "rep") { const k = `${p.workoutId}|${p.lift}|${p.weight.toFixed(2)}`; bestRep.set(k, Math.max(bestRep.get(k) ?? 0, p.reps)); }
  const seen = new Set<string>();
  for (const p of prs) {
    if (p.kind === "rep" && bestRep.get(`${p.workoutId}|${p.lift}|${p.weight.toFixed(2)}`) !== p.reps) continue;
    const id = `pr:${p.workoutId}:${p.lift}:${p.kind}:${p.reps}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const w = d.byId.get(p.workoutId);
    out.push({
      ...base(id, w?.end_time ?? w?.start_time ?? `${p.date}T12:00:00.000Z`), kind: "pr", lift: p.lift, liftName: liftName(p.lift), prKind: p.kind, reps: p.reps,
      ...(lifts ? { weight: r1(p.weight), prev: p.prev != null ? r1(p.prev) : null } : {}),
    });
  }

  const lastOn = new Map<string, string>();
  for (const w of asc) lastOn.set(localDate(w.start_time, tz), w.end_time ?? w.start_time);
  const achievements = evaluateAchievements({ workouts: asc, tz, unit, today, map: d.liftMap, programStates: d.state && d.def ? [{ name: d.def.name, state: d.state }] : [] });
  for (const a of achievements) {
    if (!a.unlockedAt || a.unlockedAt < since) continue;
    out.push({ ...base(`a:${a.id}`, lastOn.get(a.unlockedAt) ?? `${a.unlockedAt}T12:00:00.000Z`), kind: "achievement", title: a.title, tier: a.tier, description: a.description });
  }

  // Newest first; a session sorts below the PRs and achievements it produced.
  const rank = { achievement: 0, pr: 1, session: 2 } as const;
  return out.sort((a, z) => z.at.localeCompare(a.at) || rank[a.kind] - rank[z.kind] || a.id.localeCompare(z.id));
}

/** Items after `before` (an item id), up to `limit`. An unknown cursor yields an empty page. */
export function pageItems<T extends { id: string }>(items: T[], before: string | null | undefined, limit: number): { items: T[]; next: string | null } {
  const n = Math.max(1, Math.min(100, Math.floor(limit) || 30));
  let start = 0;
  if (before) {
    const i = items.findIndex((x) => x.id === before);
    if (i < 0) return { items: [], next: null };
    start = i + 1;
  }
  const page = items.slice(start, start + n);
  return { items: page, next: start + n < items.length && page.length ? page[page.length - 1].id : null };
}

/** Attach reactions and comments (rows from social_interactions) to the owner's items. */
export function attach<T extends FeedItem>(items: T[], rows: InteractionRow[], who: Map<string, { server: string; name: string | null }>): T[] {
  const by = new Map<string, InteractionRow[]>();
  for (const r of rows) {
    if (!who.has(r.friend_id)) continue;
    const l = by.get(r.item) ?? [];
    l.push(r);
    by.set(r.item, l);
  }
  return items.map((it) => {
    const rs = by.get(it.id);
    if (!rs) return it;
    const reactions = EMOJI.map((e) => ({ emoji: e as string, from: rs.filter((r) => r.kind === "reaction" && r.emoji === e).map((r) => who.get(r.friend_id)!) })).filter((x) => x.from.length);
    const comments = rs.filter((r) => r.kind === "comment").map((r) => ({ id: r.id, from: who.get(r.friend_id)!, text: r.text ?? "", at: r.at }));
    return { ...it, reactions, comments };
  });
}
