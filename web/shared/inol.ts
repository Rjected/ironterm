// INOL (intensity × number of lifts) and Prilepin's chart.
//
// INOL, from Hristo Hristov, "Intensity, Number of Lifts" (2005, first published on his site
// hristov.com and widely reprinted in powerlifting coaching material):
//
//     INOL = Σ reps / (100 − %1RM)          per exercise, per session
//
// It folds volume and intensity into one number: 5×5 at 80 % = 25/20 = 1.25; 3×3 at 90 % = 0.9.
// Hristov's own guideline bands (per exercise):
//   per session   < 0.4 too few reps to do much · 0.4–1 optimal · 1–2 tough, fine for loading
//                 phases · > 2 brutal, use sparingly
//   per week      ~2 is a sustainable target, ~3 is a hard loading week, > 4 only for short
//                 overreaching blocks. (Most lifters live around 2–3.)
// INOL is undefined at 100 % (division by zero) — Hristov notes it breaks down at maximal
// singles — so %1RM is capped at 99 % here (a true max single scores 1.0).
//
// Prilepin's chart: A. S. Prilepin's analysis of training logs of Soviet weightlifters (1970s;
// reproduced in Laputin & Oleshko 1982, "Managing the Training of Weightlifters", and
// popularised in the West by Louie Simmons / Westside). Per exercise per session:
//
//     %1RM      reps/set   total reps   optimal
//     55–65 %   3–6        18–30        24
//     70–80 %   3–6        12–24        18
//     80–90 %   2–4        10–20        15
//     90 %+     1–2         4–10         7
//
// The original chart skips 65–70 %; here 65–70 % folds into the lowest zone (zones are
// [55, 70) [70, 80) [80, 90) [90, ∞)). Sets under 55 % are outside the chart and ignored by
// Prilepin checks (they still add to INOL). Hristov derived INOL by noting that Prilepin's optimal
// numbers all land at INOL ≈ 0.6–1.0 (24 @ 60 % = 0.6, 18 @ 75 % = 0.72, 15 @ 85 % = 1.0,
// 7 @ 92.5 % ≈ 0.93).
//
// Warm-ups: INOL counts working sets. Many people log ramp-up sets as normal sets, so for history
// sets under `minPct` (default 50 % of 1RM) are treated as warm-ups and left out. Programs only
// list work sets, so plannedInol keeps everything unless told otherwise.
//
// Both tools were built for the competition lifts of weightlifters/powerlifters; for accessories
// the numbers are a rough guide only.

import type { HevyWorkout } from "./hevy";
import { isScheduled, planDay, weekIndex, type PlannedSet, type ProgramConfig, type ProgramDef, type ProgramState, type Tier } from "./program";
import { estimatePlanned, maxFraction, type SetEstimate } from "./recovery";
import { addDays, epley, liftHistory, weekStart } from "./stats";
import type { Unit } from "./units";

// ───────────────────────── INOL ─────────────────────────

/** %1RM is capped here so a maximal single doesn't divide by zero (INOL 1.0 per rep at the cap). */
export const INOL_MAX_PCT = 0.99;

/** INOL of one set: reps / (100 − %1RM), with `pct` as a fraction of 1RM (0.8 = 80 %). */
export function setInol(reps: number, pct: number): number {
  if (reps <= 0 || pct <= 0) return 0;
  return reps / (100 - 100 * Math.min(INOL_MAX_PCT, pct));
}

export type InolBand = "low" | "optimal" | "hard" | "veryHard";

export interface InolBandDef {
  band: InolBand;
  /** inclusive lower bound */
  min: number;
  /** exclusive upper bound */
  max: number;
  label: string;
  note: string;
}

/** Hristov's per-exercise, per-session bands. */
export const SESSION_BANDS: InolBandDef[] = [
  { band: "low", min: 0, max: 0.4, label: "Too easy", note: "Too few reps for the intensity to drive much adaptation; fine for a technique or recovery day." },
  { band: "optimal", min: 0.4, max: 1, label: "Optimal", note: "The productive range for most sessions." },
  { band: "hard", min: 1, max: 2, label: "Hard", note: "Tough but workable, typical of loading/accumulation phases; don't do it every session." },
  { band: "veryHard", min: 2, max: Infinity, label: "Very hard", note: "Brutal; only for short overreaching blocks, expect to need extra recovery." },
];

/** Weekly per-exercise bands (sum of session INOLs in a calendar week). */
export const WEEKLY_BANDS: InolBandDef[] = [
  { band: "low", min: 0, max: 2, label: "Light week", note: "Below the ~2–3 most lifters progress on; fine for a deload or a lift you're maintaining." },
  { band: "optimal", min: 2, max: 3, label: "Optimal", note: "Around 2–3 per week is sustainable and productive for most." },
  { band: "hard", min: 3, max: 4, label: "Hard", note: "A loading week; sustainable for a few weeks before a lighter one." },
  { band: "veryHard", min: 4, max: Infinity, label: "Very hard", note: "Overreaching territory; plan a deload soon." },
];

export function inolBand(inol: number, scope: "session" | "week" = "session"): InolBandDef {
  const bands = scope === "session" ? SESSION_BANDS : WEEKLY_BANDS;
  return bands.find((b) => inol >= b.min && inol < b.max) ?? bands[0];
}

// ───────────────────────── Prilepin ─────────────────────────

export type PrilepinZoneId = "55-65" | "70-80" | "80-90" | "90+";

export interface PrilepinZone {
  id: PrilepinZoneId;
  label: string;
  /** inclusive, fraction of 1RM */
  minPct: number;
  /** exclusive */
  maxPct: number;
  repsPerSet: [number, number];
  totalReps: [number, number];
  optimal: number;
}

export const PRILEPIN: PrilepinZone[] = [
  { id: "55-65", label: "55–65%", minPct: 0.55, maxPct: 0.7, repsPerSet: [3, 6], totalReps: [18, 30], optimal: 24 },
  { id: "70-80", label: "70–80%", minPct: 0.7, maxPct: 0.8, repsPerSet: [3, 6], totalReps: [12, 24], optimal: 18 },
  { id: "80-90", label: "80–90%", minPct: 0.8, maxPct: 0.9, repsPerSet: [2, 4], totalReps: [10, 20], optimal: 15 },
  { id: "90+", label: "90%+", minPct: 0.9, maxPct: Infinity, repsPerSet: [1, 2], totalReps: [4, 10], optimal: 7 },
];

/** Prilepin zone for a %1RM (fraction), or null under 55 %. */
export function prilepinZone(pct: number): PrilepinZone | null {
  return PRILEPIN.find((z) => pct >= z.minPct && pct < z.maxPct) ?? null;
}

export type PrilepinVerdict = "below" | "optimal" | "above";

export interface PrilepinResult {
  zone: PrilepinZoneId;
  sets: number;
  reps: number;
  /** below / inside / above the zone's total-reps range */
  verdict: PrilepinVerdict;
  range: [number, number];
  optimal: number;
  /** sets whose reps fall outside the zone's reps-per-set range */
  setsOutsideRepRange: number;
  note: string;
}

/** Prilepin compliance per zone for one lift's sets in one session (zones with no sets omitted). */
export function prilepin(sets: { reps: number; pct: number }[]): PrilepinResult[] {
  const out: PrilepinResult[] = [];
  for (const z of PRILEPIN) {
    const xs = sets.filter((s) => s.reps > 0 && prilepinZone(s.pct)?.id === z.id);
    if (!xs.length) continue;
    const reps = xs.reduce((a, s) => a + s.reps, 0);
    const [lo, hi] = z.totalReps;
    const verdict: PrilepinVerdict = reps < lo ? "below" : reps > hi ? "above" : "optimal";
    const outside = xs.filter((s) => s.reps < z.repsPerSet[0] || s.reps > z.repsPerSet[1]).length;
    const note =
      verdict === "below" ? `${reps} reps at ${z.label}: under Prilepin's ${lo}–${hi} (optimal ${z.optimal}).`
      : verdict === "above" ? `${reps} reps at ${z.label}: over Prilepin's ${lo}–${hi} (optimal ${z.optimal}); a lot of volume for this intensity.`
      : `${reps} reps at ${z.label}: inside Prilepin's ${lo}–${hi} (optimal ${z.optimal}).`;
    out.push({ zone: z.id, sets: xs.length, reps, verdict, range: z.totalReps, optimal: z.optimal, setsOutsideRepRange: outside, note });
  }
  return out;
}

/** The zone a session "lives in": most reps, ties → heavier zone. */
export function primaryZone(results: PrilepinResult[]): PrilepinResult | null {
  let best: PrilepinResult | null = null;
  for (const r of results) if (!best || r.reps >= best.reps) best = r; // PRILEPIN is light → heavy
  return best;
}

// ───────────────────────── shared summary ─────────────────────────

export interface InolSet {
  reps: number;
  /** fraction of 1RM */
  pct: number;
  inol: number;
}

export interface InolSummary {
  sets: InolSet[];
  reps: number;
  inol: number;
  /** rep-weighted mean %1RM */
  avgPct: number;
  band: InolBand;
  prilepin: PrilepinResult[];
  /** primary Prilepin zone (most reps), null when every set is under 55 % */
  zone: PrilepinZoneId | null;
  zoneReps: number;
  verdict: PrilepinVerdict | null;
}

function summarize(sets: { reps: number; pct: number }[]): InolSummary {
  const xs = sets.filter((s) => s.reps > 0 && s.pct > 0).map((s) => ({ reps: s.reps, pct: s.pct, inol: setInol(s.reps, s.pct) }));
  const reps = xs.reduce((a, s) => a + s.reps, 0);
  const inol = xs.reduce((a, s) => a + s.inol, 0);
  const pr = prilepin(xs);
  const p = primaryZone(pr);
  return {
    sets: xs, reps, inol, avgPct: reps ? xs.reduce((a, s) => a + s.reps * s.pct, 0) / reps : 0,
    band: inolBand(inol).band, prilepin: pr, zone: p?.zone ?? null, zoneReps: p?.reps ?? 0, verdict: p?.verdict ?? null,
  };
}

// ───────────────────────── rolling e1RM ─────────────────────────

/**
 * Best Epley e1RM seen over a trailing window, as of a date. The reference max for a session
 * includes that session's own sets, so %1RM never exceeds 100 %. The window (default 365 days)
 * keeps a years-old PR from making today's sets look light after a layoff.
 */
export function rollingBest(windowDays = 365) {
  const seen: { date: string; e1rm: number }[] = [];
  return {
    add(date: string, e1rm: number) { if (e1rm > 0) seen.push({ date, e1rm }); },
    best(date: string): number {
      const from = Number.isFinite(windowDays) ? addDays(date, -windowDays) : "";
      let b = 0;
      for (const s of seen) if (s.date >= from && s.date <= date) b = Math.max(b, s.e1rm);
      return b;
    },
  };
}

// ───────────────────────── history ─────────────────────────

export interface InolSession extends InolSummary {
  date: string;
  workoutId: string;
  /** Monday of the session's week */
  week: string;
  /** reference 1RM (rolling best e1RM, in `unit`) */
  e1rm: number;
  sets: (InolSet & { weight: number })[];
}

/**
 * Per-session INOL for one lift from Hevy history. Warmups excluded, plus sets under `minPct`
 * (default 0.5) of 1RM — ramp-up sets logged as normal sets; sets without load (bodyweight,
 * weight 0) are skipped since they have no %1RM. %1RM = weight / rolling best e1RM (Epley,
 * trailing `windowDays`, default 365, including the session itself). Sessions with no qualifying
 * sets are omitted.
 */
export function sessionInol(workouts: HevyWorkout[], lift: string, unit: Unit, tz: string, opts: { liftMap?: Record<string, string>; windowDays?: number; minPct?: number } = {}): InolSession[] {
  const minPct = opts.minPct ?? 0.5;
  const tracker = rollingBest(opts.windowDays ?? 365);
  const out: InolSession[] = [];
  for (const p of liftHistory(workouts, lift, unit, tz, opts.liftMap)) {
    const loaded = p.sets.filter((s) => s.weight > 0 && s.reps > 0);
    if (!loaded.length) continue;
    tracker.add(p.date, Math.max(...loaded.map((s) => epley(s.weight, s.reps))));
    const ref = tracker.best(p.date);
    const withPct = loaded.map((s) => ({ weight: s.weight, reps: s.reps, pct: Math.min(1, s.weight / ref) })).filter((s) => s.pct >= minPct);
    if (!withPct.length) continue;
    const sum = summarize(withPct);
    out.push({ ...sum, sets: withPct.map((s) => ({ ...s, inol: setInol(s.reps, s.pct) })), date: p.date, workoutId: p.workoutId, week: weekStart(p.date), e1rm: ref });
  }
  return out;
}

export interface WeeklyInol {
  /** Monday */
  week: string;
  sessions: number;
  reps: number;
  inol: number;
  band: InolBand;
}

/** Sum session INOLs per calendar week (Monday start). Weeks without sessions are omitted. */
export function weeklyInol(sessions: Pick<InolSession, "date" | "inol" | "reps">[]): WeeklyInol[] {
  const m = new Map<string, WeeklyInol>();
  for (const s of sessions) {
    const k = weekStart(s.date);
    const c = m.get(k) ?? { week: k, sessions: 0, reps: 0, inol: 0, band: "low" as InolBand };
    c.sessions++; c.reps += s.reps; c.inol += s.inol;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, band: inolBand(w.inol, "week").band }));
}

// ───────────────────────── program ─────────────────────────

/**
 * Reps and %1RM for a planned set. In order: % of the program max (converted with
 * recovery.maxFraction, e.g. a 90 % training max), RPE target, planned weight ÷ the lift's 1RM,
 * else the tier's default reps-in-reserve. AMRAPs assume reps to ~0.5 RIR (recovery.estimatePlanned).
 */
export function plannedSetIntensity(s: PlannedSet, tier: Tier, maxPct: number, oneRm?: number): SetEstimate {
  // ofTop: % of today's top-set e1RM, which is roughly a 1RM
  if (s.pct != null) return estimatePlanned(s, tier, s.ofTop ? 1 : maxPct);
  if (s.rpe != null) return estimatePlanned(s, tier, maxPct);
  if (s.weight > 0 && oneRm && oneRm > 0) return estimatePlanned({ ...s, pct: Math.min(1, s.weight / oneRm) }, tier, 1);
  return estimatePlanned(s, tier, maxPct);
}

export interface PlannedInolLift extends InolSummary {
  lift: string;
  tiers: Tier[];
}

export interface PlannedInolDay {
  dayIndex: number;
  dayId: string;
  dayName: string;
  /** program week (0-based) */
  week: number;
  weekName?: string;
  lifts: PlannedInolLift[];
}

export interface PlannedInolWeek {
  week: number;
  weekName?: string;
  /** scheduled sessions in this pass through the days */
  sessions: number;
  /** INOL per lift per calendar week (pass total × sessionsPerWeek / sessions) */
  lifts: Record<string, number>;
  bands: Record<string, InolBand>;
}

export interface PlannedInol {
  days: PlannedInolDay[];
  weeks: PlannedInolWeek[];
}

/**
 * INOL for every scheduled day of every program week (one full cycle, using the current TMs and
 * slot weights in `state`). %1RM comes from the program's percentages (of its max, converted to
 * 1RM with maxFraction), or planned weight ÷ 1RM where the 1RM is `opts.maxes[lift]` (in cfg.unit,
 * e.g. from history e1RMs) or the lift's TM ÷ maxFraction. Sets with no usable load fall back to
 * RPE / tier-default RIR estimates.
 */
export function plannedInol(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, opts: { maxes?: Record<string, number>; lifts?: string[]; minPct?: number } = {}): PlannedInol {
  const minPct = opts.minPct ?? 0;
  const maxPct = maxFraction(def.maxLabel);
  const oneRm = (lift: string) => opts.maxes?.[lift] ?? (state.tms[lift] ? state.tms[lift] / maxPct : undefined);
  const passes = def.cycle?.weeks ?? 1;
  const days: PlannedInolDay[] = [];
  const weeks: PlannedInolWeek[] = [];
  for (let r = 0; r < passes; r++) {
    const wk = weekIndex(def, r);
    const total: Record<string, number> = {};
    let sessions = 0, weekName: string | undefined;
    for (let i = 0; i < def.days.length; i++) {
      if (!isScheduled(def.days[i], wk)) continue;
      const plan = planDay(def, cfg, { ...state, rotations: r, dayIndex: i }, i);
      weekName = plan.weekName;
      sessions++;
      const by = new Map<string, { tiers: Tier[]; sets: { reps: number; pct: number }[] }>();
      for (const ex of plan.exercises) {
        if (opts.lifts && !opts.lifts.includes(ex.lift)) continue;
        const g = by.get(ex.lift) ?? { tiers: [], sets: [] };
        if (!g.tiers.includes(ex.tier)) g.tiers.push(ex.tier);
        for (const s of ex.sets) { const e = plannedSetIntensity(s, ex.tier, maxPct, oneRm(ex.lift)); if (e.pct >= minPct) g.sets.push({ reps: e.reps, pct: e.pct }); }
        by.set(ex.lift, g);
      }
      const lifts = [...by.entries()].map(([lift, g]): PlannedInolLift => ({ lift, tiers: g.tiers, ...summarize(g.sets) }));
      for (const l of lifts) total[l.lift] = (total[l.lift] ?? 0) + l.inol;
      days.push({ dayIndex: i, dayId: plan.dayId, dayName: plan.dayName, week: plan.week, weekName: plan.weekName, lifts });
    }
    const scale = sessions ? def.sessionsPerWeek / sessions : 0;
    const lifts = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v * scale]));
    weeks.push({ week: wk, weekName, sessions, lifts, bands: Object.fromEntries(Object.entries(lifts).map(([k, v]) => [k, inolBand(v, "week").band])) });
  }
  return { days, weeks };
}
