// PR wall: every rep-max record per lift, with its full progression.
//
// Rep max semantics: the N-rep max is the heaviest weight lifted for at least N reps (a set of 5
// at 200 also sets the 1–4RM if nothing heavier exists), the same rule as repPRs in stats.ts. Each
// record keeps the set that made it (`setReps`). One event per rep count per session; a record
// only moves on a strict improvement (> previous + 0.01, which absorbs kg↔lb float noise).
//
// e1RM record: best Epley e1RM from sets of ≤10 reps.
// Bodyweight lifts (kind "bodyweight"): set weight is added load (0 = bodyweight), so rep maxes are
// "heaviest added load for N reps", plus a max-reps record (most reps in one set at any load).
// Loaded lifts skip sets logged with no weight, and get no max-reps record (a 40-rep warm-up with
// the bar isn't a PR worth showing).

import type { HevyWorkout } from "./hevy";
import { LIFTS } from "./lifts";
import { epley, liftHistory, type LiftPoint } from "./stats";
import type { Unit } from "./units";

const EPS = 0.01;
const dayNum = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 86400000);

export type PrKind = "rep" | "e1rm" | "maxReps";

export interface PrEvent {
  lift: string;
  kind: PrKind;
  /** rep count of the record (rep kind); reps of the set otherwise */
  reps: number;
  /** weight of the record (added load for bodyweight lifts); e1RM value for kind "e1rm"; for "maxReps", the load the reps were done at */
  weight: number;
  /** the set behind it */
  setWeight: number;
  setReps: number;
  date: string;
  workoutId: string;
  /** previous record value (weight, e1RM or reps); null = first time */
  prev: number | null;
  first: boolean;
}

export interface PrRecord {
  kind: PrKind;
  reps: number;
  /** current record value: weight (rep), e1RM (e1rm), reps (maxReps) */
  value: number;
  setWeight: number;
  setReps: number;
  date: string;
  workoutId: string;
  /** days the current record has stood, as of `today` */
  stoodDays: number;
  /** times it was beaten after first being set */
  improvements: number;
  /** every event, oldest first (history[last] is the current record) */
  history: PrEvent[];
}

export interface PrWall {
  lift: string;
  name: string;
  bodyweight: boolean;
  /** rep maxes 1…maxReps (only rep counts ever done), ascending reps */
  repMaxes: PrRecord[];
  e1rm: PrRecord | null;
  /** most reps in one set (any added load); bodyweight lifts only, null otherwise */
  maxReps: PrRecord | null;
  /** current records, longest-standing first */
  oldest: PrRecord[];
}

export interface PrWallOptions {
  tz?: string;
  map?: Record<string, string>;
  /** "now" for stoodDays; defaults to the last session date */
  today?: string;
  /** rep maxes up to this count. Default 20. */
  maxReps?: number;
}

function build(lift: string, kind: PrKind, reps: number, today: string, events: PrEvent[]): PrRecord {
  const cur = events[events.length - 1];
  return {
    kind, reps, value: kind === "maxReps" ? cur.setReps : cur.weight, setWeight: cur.setWeight, setReps: cur.setReps, date: cur.date, workoutId: cur.workoutId,
    stoodDays: Math.max(0, dayNum(today) - dayNum(cur.date)), improvements: events.length - 1, history: events,
  };
}

/** PR wall from one lift's session history (liftHistory output, any unit). */
export function prWallFromPoints(points: LiftPoint[], lift: string, opts: { today?: string; maxReps?: number } = {}): PrWall {
  const maxR = opts.maxReps ?? 20;
  const pts = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const today = opts.today ?? pts[pts.length - 1]?.date ?? "1970-01-01";
  const bodyweight = LIFTS[lift]?.kind === "bodyweight";
  const rep = new Map<number, PrEvent[]>();
  const e1: PrEvent[] = [];
  const mr: PrEvent[] = [];
  const top = (xs: PrEvent[]) => xs[xs.length - 1];

  for (const p of pts) {
    // best set per rep count this session
    const sess = new Map<number, { w: number; r: number }>();
    let bestE: { e: number; w: number; r: number } | null = null;
    let bestR: { w: number; r: number } | null = null;
    for (const s of p.sets) {
      const w = Math.max(0, s.weight);
      if (s.reps <= 0 || (!bodyweight && w <= 0)) continue; // unloaded sets of a loaded lift are logging gaps
      for (let r = 1; r <= Math.min(s.reps, maxR); r++) {
        const c = sess.get(r);
        if (!c || w > c.w + EPS || (Math.abs(w - c.w) <= EPS && s.reps < c.r)) sess.set(r, { w, r: s.reps });
      }
      if (w > 0 && s.reps <= 10) {
        const e = epley(w, s.reps);
        if (!bestE || e > bestE.e) bestE = { e, w, r: s.reps };
      }
      if (!bestR || s.reps > bestR.r || (s.reps === bestR.r && w > bestR.w)) bestR = { w, r: s.reps };
    }
    const ev = (kind: PrKind, reps: number, weight: number, sw: number, sr: number, prev: number | null): PrEvent =>
      ({ lift, kind, reps, weight, setWeight: sw, setReps: sr, date: p.date, workoutId: p.workoutId, prev, first: prev == null });
    for (const [r, c] of sess) {
      const h = rep.get(r) ?? [];
      const prev = h.length ? top(h).weight : null;
      if (prev == null || c.w > prev + EPS) { h.push(ev("rep", r, c.w, c.w, c.r, prev)); rep.set(r, h); }
    }
    if (bestE) {
      const prev = e1.length ? top(e1).weight : null;
      if (prev == null || bestE.e > prev + EPS) e1.push(ev("e1rm", bestE.r, bestE.e, bestE.w, bestE.r, prev));
    }
    if (bestR && bodyweight) {
      const prev = mr.length ? top(mr).setReps : null;
      if (prev == null || bestR.r > prev) mr.push(ev("maxReps", bestR.r, bestR.w, bestR.w, bestR.r, prev));
    }
  }

  const repMaxes = [...rep.entries()].sort((a, b) => a[0] - b[0]).map(([r, h]) => build(lift, "rep", r, today, h));
  const e1rm = e1.length ? build(lift, "e1rm", top(e1).setReps, today, e1) : null;
  const maxReps = mr.length ? build(lift, "maxReps", top(mr).setReps, today, mr) : null;
  const oldest = [...repMaxes, ...(e1rm ? [e1rm] : []), ...(maxReps ? [maxReps] : [])].sort((a, b) => b.stoodDays - a.stoodDays || a.reps - b.reps);
  return { lift, name: LIFTS[lift]?.name ?? lift, bodyweight, repMaxes, e1rm, maxReps, oldest };
}

/** PR wall for one lift. Weights in `unit`. */
export function prWall(workouts: HevyWorkout[], lift: string, unit: Unit, opts: PrWallOptions = {}): PrWall {
  return prWallFromPoints(liftHistory(workouts, lift, unit, opts.tz ?? "UTC", opts.map), lift, opts);
}

export interface RecentPrOptions {
  unit?: Unit;
  tz?: string;
  map?: Record<string, string>;
  /** limit to these lift keys (default: every lift in LIFTS that appears) */
  lifts?: string[];
  /** include first-ever records (a rep count never done before). Default false. */
  includeFirsts?: boolean;
  maxReps?: number;
}

/**
 * PRs set on or after `since` across all lifts, newest first. A single set that beats several rep
 * maxes at once (5 @ 200 beating the 3, 4 and 5RM) is reported once, at its own highest record rep count.
 */
export function recentPRs(workouts: HevyWorkout[], since: string, opts: RecentPrOptions = {}): PrEvent[] {
  const unit = opts.unit ?? "lb";
  const lifts = opts.lifts ?? Object.keys(LIFTS);
  const out: PrEvent[] = [];
  for (const lift of lifts) {
    const pts = liftHistory(workouts, lift, unit, opts.tz ?? "UTC", opts.map);
    if (!pts.length || pts[pts.length - 1].date < since) continue;
    const wall = prWallFromPoints(pts, lift, { maxReps: opts.maxReps });
    const evs = [...wall.repMaxes.flatMap((r) => r.history), ...(wall.e1rm?.history ?? []), ...(wall.maxReps?.history ?? [])]
      .filter((e) => e.date >= since && (opts.includeFirsts || !e.first));
    const keep = new Map<string, PrEvent>();
    for (const e of evs) {
      const k = e.kind === "rep" ? `${e.workoutId}|rep|${e.setWeight.toFixed(2)}|${e.setReps}` : `${e.workoutId}|${e.kind}`;
      const c = keep.get(k);
      if (!c || e.reps > c.reps) keep.set(k, e);
    }
    out.push(...keep.values());
  }
  const order: Record<PrKind, number> = { e1rm: 0, rep: 1, maxReps: 2 };
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.lift.localeCompare(b.lift) || order[a.kind] - order[b.kind] || a.reps - b.reps);
}
