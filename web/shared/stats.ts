// Stats derived from raw Hevy workouts. Pure functions, shared by the worker and the UI.

import type { HevyWorkout } from "./hevy";
import { matchLift } from "./lifts";
import { fromKg, type Unit } from "./units";

/** YYYY-MM-DD of an ISO timestamp in a given IANA time zone. */
export function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

/** Years with workouts, newest first, by the lifter's local date (not the UTC timestamp). */
export function workoutYears(workouts: HevyWorkout[], tz: string): { year: string; n: number }[] {
  const m = new Map<string, number>();
  for (const w of workouts) { const y = localDate(w.start_time, tz).slice(0, 4); m.set(y, (m.get(y) ?? 0) + 1); }
  return [...m.entries()].sort((a, z) => z[0].localeCompare(a[0])).map(([year, n]) => ({ year, n }));
}

export function workoutVolumeKg(w: HevyWorkout): number {
  let v = 0;
  for (const e of w.exercises) for (const s of e.sets) if (s.type !== "warmup") v += (s.weight_kg ?? 0) * (s.reps ?? 0);
  return v;
}

export function workingSets(w: HevyWorkout): number {
  return w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.type !== "warmup").length, 0);
}

export function durationMin(w: HevyWorkout): number {
  return Math.max(0, (Date.parse(w.end_time) - Date.parse(w.start_time)) / 60000);
}

export type GraphMetric = "volume" | "sets" | "duration";

export interface DayCell {
  date: string;
  value: number;
  level: number;
  workouts: string[];
}

/** Daily values → GitHub-style levels 0–4 using quartiles of non-zero days (the original CLI's normalize.rs; the CLI in web/cli now uses this). */
export function dailyCells(workouts: HevyWorkout[], tz: string, metric: GraphMetric = "volume"): Map<string, DayCell> {
  const m = new Map<string, DayCell>();
  for (const w of workouts) {
    const d = localDate(w.start_time, tz);
    const c = m.get(d) ?? { date: d, value: 0, level: 0, workouts: [] };
    const v = metric === "volume" ? workoutVolumeKg(w) : metric === "sets" ? workingSets(w) : durationMin(w);
    // Bodyweight-only workouts still count, same as the widgets.
    c.value += Math.max(v, 1);
    c.workouts.push(w.id);
    m.set(d, c);
  }
  const sorted = [...m.values()].map((c) => c.value).sort((a, b) => a - b);
  const q = (p: number) => {
    if (!sorted.length) return 0;
    const r = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(r), hi = Math.ceil(r);
    return sorted[lo] * (1 - (r - lo)) + sorted[hi] * (r - lo);
  };
  const [q1, q2, q3] = [q(25), q(50), q(75)];
  for (const c of m.values()) c.level = c.value <= q1 ? 1 : c.value <= q2 ? 2 : c.value <= q3 ? 3 : 4;
  return m;
}

export const epley = (w: number, r: number) => (r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30));

export interface LiftPoint {
  date: string;
  workoutId: string;
  e1rm: number;
  topWeight: number;
  topReps: number;
  volume: number;
  sets: { weight: number; reps: number; rpe?: number | null }[];
}

/** Per-session history for one lift (in `unit`). */
export function liftHistory(workouts: HevyWorkout[], lift: string, unit: Unit, tz: string, map?: Record<string, string>): LiftPoint[] {
  const out: LiftPoint[] = [];
  for (const w of [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const sets = w.exercises
      .filter((e) => matchLift(e.title, e.exercise_template_id, map) === lift)
      .flatMap((e) => e.sets.filter((s) => s.type !== "warmup" && (s.reps ?? 0) > 0))
      .map((s) => ({ weight: fromKg(s.weight_kg ?? 0, unit), reps: s.reps ?? 0, rpe: s.rpe }));
    if (!sets.length) continue;
    let best = sets[0];
    for (const s of sets) if (epley(s.weight, s.reps) > epley(best.weight, best.reps)) best = s;
    out.push({
      date: localDate(w.start_time, tz),
      workoutId: w.id,
      e1rm: epley(best.weight, best.reps),
      topWeight: Math.max(...sets.map((s) => s.weight)),
      topReps: best.reps,
      volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
      sets,
    });
  }
  return out;
}

/** Heaviest weight lifted for each rep count 1–12. */
export function repPRs(points: LiftPoint[]): { reps: number; weight: number; date: string }[] {
  const best = new Map<number, { weight: number; date: string }>();
  for (const p of points)
    for (const s of p.sets) {
      for (let r = 1; r <= Math.min(s.reps, 12); r++) {
        const b = best.get(r);
        if (!b || s.weight > b.weight) best.set(r, { weight: s.weight, date: p.date });
      }
    }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([reps, v]) => ({ reps, ...v }));
}

/** Consecutive weeks (ending this week or last) with at least `min` sessions. */
export function weekStreak(cells: Map<string, DayCell>, today: string, min = 3): { current: number; best: number } {
  const perWeek = new Map<string, number>();
  for (const c of cells.values()) {
    const k = weekStart(c.date);
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  const weeks = [...perWeek.keys()].sort();
  if (!weeks.length) return { current: 0, best: 0 };
  let best = 0, run = 0, prev: string | null = null;
  for (const wk of weeks) {
    const ok = (perWeek.get(wk) ?? 0) >= min;
    run = ok ? (prev && addDays(prev, 7) === wk ? run + 1 : 1) : 0;
    if (!ok) prev = null; else prev = wk;
    best = Math.max(best, run);
  }
  let cur = 0;
  let wk = weekStart(today);
  if ((perWeek.get(wk) ?? 0) < min) wk = addDays(wk, -7); // this week isn't over yet
  while ((perWeek.get(wk) ?? 0) >= min) { cur++; wk = addDays(wk, -7); }
  return { current: cur, best };
}

export function weeklyTotals(workouts: HevyWorkout[], tz: string, unit: Unit): { week: string; volume: number; sessions: number; sets: number }[] {
  const m = new Map<string, { volume: number; sessions: number; sets: number }>();
  for (const w of workouts) {
    const k = weekStart(localDate(w.start_time, tz));
    const c = m.get(k) ?? { volume: 0, sessions: 0, sets: 0 };
    c.volume += fromKg(workoutVolumeKg(w), unit);
    c.sessions += 1;
    c.sets += workingSets(w);
    m.set(k, c);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v }));
}

// ───────── calisthenics ─────────

export interface CalisthenicsStats {
  /** most reps in one set, any load */
  maxReps: { reps: number; date: string } | null;
  /** most reps in one set at bodyweight */
  maxRepsBw: { reps: number; date: string } | null;
  /** heaviest added load used for at least one rep */
  heaviestAdded: { weight: number; reps: number; date: string } | null;
  /** best reps at each added-load bucket ("BW", "+10", "+25"…) */
  byLoad: { load: number; reps: number; date: string }[];
  /** per-session: best set reps and total reps */
  sessions: { date: string; workoutId: string; best: number; total: number; added: number }[];
  totalReps365: number;
  avgRepsPerSet: number;
}

/** Bodyweight-lift stats. Set weight is the added load (0 = bodyweight). */
export function calisthenics(points: LiftPoint[], today: string): CalisthenicsStats {
  let maxReps: CalisthenicsStats["maxReps"] = null, maxRepsBw: CalisthenicsStats["maxRepsBw"] = null, heaviestAdded: CalisthenicsStats["heaviestAdded"] = null;
  const loads = new Map<number, { reps: number; date: string }>();
  let total365 = 0, setCount = 0, repCount = 0;
  const yearAgo = addDays(today, -365);
  const sessions = points.map((p) => {
    let best = 0, total = 0, added = 0;
    for (const s of p.sets) {
      const w = Math.round(s.weight / 2.5) * 2.5; // bucket kg↔lb noise
      best = Math.max(best, s.reps);
      total += s.reps;
      added = Math.max(added, w);
      setCount++; repCount += s.reps;
      if (p.date >= yearAgo) total365 += s.reps;
      if (!maxReps || s.reps > maxReps.reps) maxReps = { reps: s.reps, date: p.date };
      if (w <= 0 && (!maxRepsBw || s.reps > maxRepsBw.reps)) maxRepsBw = { reps: s.reps, date: p.date };
      if (w > 0 && (!heaviestAdded || w > heaviestAdded.weight || (w === heaviestAdded.weight && s.reps > heaviestAdded.reps))) heaviestAdded = { weight: w, reps: s.reps, date: p.date };
      const k = Math.max(0, w);
      const cur = loads.get(k);
      if (!cur || s.reps > cur.reps) loads.set(k, { reps: s.reps, date: p.date });
    }
    return { date: p.date, workoutId: p.workoutId, best, total, added };
  });
  const byLoad = [...loads.entries()].sort((a, b) => a[0] - b[0]).map(([load, v]) => ({ load, ...v }))
    // drop buckets dominated by a heavier load with at least as many reps
    .filter((x, i, arr) => !arr.slice(i + 1).some((y) => y.reps >= x.reps));
  return { maxReps, maxRepsBw, heaviestAdded, byLoad, sessions, totalReps365: total365, avgRepsPerSet: setCount ? repCount / setCount : 0 };
}
