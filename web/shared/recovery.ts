// Muscle load & recovery model.
//
// Each working set gives every muscle it involves a dose (shared/muscles.ts fractional sets),
// weighted by how close to failure the set was. Doses add up as fatigue that decays
// exponentially with a muscle-specific time constant — the single-component
// impulse-response idea from Banister's fitness-fatigue model (Banister et al. 1975; Calvert et
// al. 1976, IEEE Trans Syst Man Cybern 6:94), applied per muscle instead of to the whole body.
//
// Pure functions, no DOM: used by the BODY view and unit-tested in recovery.test.ts.
//
// Units
//   sets       fractional sets (involvement × working sets)
//   effSets    sets × effort(RIR): what counts toward growth
//   load       reps × relative intensity (%1RM) × involvement — unit-free "relative volume load",
//              so templates can be compared without anyone's maxes
//   fatigue    effSets × lift fatigue factor; decays with τ_muscle (× intensity/failure stretch)

import type { HevyExerciseTemplate, HevyWorkout } from "./hevy";
import { matchLift } from "./lifts";
import { exerciseProfile, liftProfile, MUSCLE, MUSCLE_IDS, type MuscleId } from "./muscles";
import { initialState, isScheduled, planDay, weekIndex, type PlannedSet, type ProgramConfig, type ProgramDef, type Tier } from "./program";

// ───────────────────────── constants ─────────────────────────

/**
 * Per-session dose at which a muscle reads 0 % ready. Pelland et al. 2024 (SportRxiv 476) found
 * hypertrophy per session plateaus around ~11 fractional sets; beyond that extra sets are mostly
 * fatigue. So 10 fresh hard sets on one muscle ≈ "fully taxed".
 */
export const SESSION_CAP = 10;
/** A session counts as a "hit" for a muscle at ≥ this many fatigue units (≈ one direct hard set). */
export const HIT_MIN = 1;
/** Hit again while residual fatigue is above this share of the previous hit → overlap. */
export const OVERLAP_SHARE = 0.25;
/** …and above this absolute residual (ignores tiny doses). */
export const OVERLAP_MIN = 1;
/** Session start hour for program schedules (local, any day). */
export const SESSION_HOUR = 18;

export const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

/** Default weekday spread per sessions/week (0 = Monday): spaces sessions as evenly as a week allows. */
export function defaultSchedule(perWeek: number): number[] {
  const S: Record<number, number[]> = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  return S[Math.max(1, Math.min(7, Math.round(perWeek)))];
}

// ───────────────────────── intensity & effort ─────────────────────────

/** Reps to failure at a fraction of 1RM (Epley inverted: 1RM = w(1 + r/30)). */
export const maxReps = (pct: number) => Math.max(1, 30 * (1 / Math.min(1, Math.max(0.3, pct)) - 1));
/** %1RM a set of `reps` with `rir` in reserve corresponds to. */
export const pctFor = (reps: number, rir: number) => (reps + rir <= 1 ? 1 : 1 / (1 + (reps + rir) / 30));

/**
 * Stimulus per set by reps in reserve. Growth rises as sets approach failure but with
 * diminishing returns (Refalo et al. 2023, Sports Med 53:649; Robinson et al. 2024, Sports Med
 * 54:2209): sets ≤1 RIR count fully, ~3 RIR ≈ 0.85, ~5 RIR ≈ 0.7, floor 0.15 for very easy sets
 * (technique work at 50–60 %).
 */
export const effort = (rir: number) => Math.max(0.15, Math.min(1, 1 - 0.08 * Math.max(0, rir - 1)));

/**
 * How much slower fatigue from this set clears. Training to failure roughly doubles the
 * recovery time of neuromuscular and damage markers (Morán-Navarro et al. 2017); very heavy
 * loads add neural/joint fatigue (Pareja-Blanco et al. 2017, Int J Sports Physiol Perform 12:512 —
 * high velocity-loss sets took 24–48 h longer to recover).
 */
export const tauStretch = (rir: number, pct: number) => (1 + (rir <= 0.5 ? 0.35 : rir <= 1.5 ? 0.15 : 0)) * (1 + 0.75 * Math.max(0, pct - 0.8));

/** Assumed reps-in-reserve when the program/log doesn't say (main lifts are left with a rep or two). */
export function defaultRir(tier: Tier): number {
  return tier === "T1" || tier === "MAIN" ? 2 : tier === "T2" || tier === "SUPP" ? 2 : 1.5;
}

export interface SetEstimate {
  reps: number;
  /** relative intensity, fraction of 1RM */
  pct: number;
  rir: number;
}

/** Reps-in-reserve & %1RM for a planned set: from RPE, %TM, AMRAP or the tier default. */
/**
 * What a program's "max" is as a fraction of a true 1RM, from its label: training maxes are
 * ~90 % (Wendler), nRM maxes are the Epley equivalent, "1RM"/"Max" are 1.
 */
export function maxFraction(label?: string): number {
  if (!label) return 0.9;
  const pc = /(\d+)\s*%\s*of\s*1RM/i.exec(label);
  if (pc) return Number(pc[1]) / 100;
  const rm = /(\d+)\s*(?:[–-]\s*(\d+))?\s*RM/i.exec(label) ?? /(\d+)-rep/i.exec(label);
  if (rm && Number(rm[1]) > 1) return pctFor((Number(rm[1]) + Number(rm[2] ?? rm[1])) / 2, 0);
  if (/1RM|^max$/i.test(label)) return 1;
  return 0.9;
}

export function estimatePlanned(s: Pick<PlannedSet, "reps" | "repsMax" | "pct" | "rpe" | "amrap">, tier: Tier, maxPct = 0.9): SetEstimate {
  // Rep ranges: assume the middle.
  const reps = s.repsMax ? (s.reps + s.repsMax) / 2 : s.reps;
  if (s.amrap) {
    // AMRAPs end ~0–1 RIR (technical failure). Reps actually done exceed the minimum; at a known
    // % take the rep max there, else assume a couple over target.
    const r = s.pct ? Math.max(reps, maxReps(s.pct * maxPct) - 0.5) : reps + 2;
    return { reps: r, pct: s.pct ? s.pct * maxPct : pctFor(r, 0.5), rir: 0.5 };
  }
  if (s.rpe != null) {
    const rir = Math.max(0, 10 - s.rpe);
    return { reps, pct: pctFor(reps, rir), rir };
  }
  if (s.pct != null) {
    // Programs quote % of their own max (training max, 1RM, 5RM…): convert to % of 1RM.
    const p = s.pct * maxPct;
    return { reps, pct: p, rir: Math.max(0, maxReps(p) - reps) };
  }
  const rir = defaultRir(tier);
  return { reps, pct: pctFor(reps, rir), rir };
}

// ───────────────────────── doses ─────────────────────────

export interface MuscleDose {
  sets: number;
  effSets: number;
  load: number;
  fatigue: number;
  /** dose-weighted τ in hours */
  tau: number;
  /** fatigue by lift key / exercise title */
  by: Record<string, number>;
}

export type Doses = Partial<Record<MuscleId, MuscleDose>>;

/** Add one exercise's sets to a session's per-muscle doses. */
export function addExercise(out: Doses, key: string, involvement: Partial<Record<MuscleId, number>>, liftFatigue: number, sets: SetEstimate[]) {
  for (const s of sets) {
    const e = effort(s.rir);
    for (const [m, inv] of Object.entries(involvement) as [MuscleId, number][]) {
      if (!inv) continue;
      const d = (out[m] ??= { sets: 0, effSets: 0, load: 0, fatigue: 0, tau: 0, by: {} });
      const f = inv * e * liftFatigue;
      const tau = MUSCLE[m].tau * tauStretch(s.rir, s.pct);
      d.tau = (d.tau * d.fatigue + tau * f) / (d.fatigue + f || 1);
      d.sets += inv;
      d.effSets += inv * e;
      d.load += inv * s.reps * s.pct;
      d.fatigue += f;
      d.by[key] = (d.by[key] ?? 0) + f;
    }
  }
}

/** Contributors to a dose, biggest first. */
export const sources = (d: MuscleDose | undefined) => (d ? Object.entries(d.by).sort((a, b) => b[1] - a[1]).map(([k]) => k) : []);

// ───────────────────────── fatigue over time ─────────────────────────

export interface Exposure {
  /** hours on the model's clock */
  t: number;
  doses: Doses;
  label: string;
}

/** Residual fatigue of one muscle at time t from all earlier exposures. */
export function fatigueAt(exps: Exposure[], m: MuscleId, t: number): number {
  let f = 0;
  for (const x of exps) {
    if (x.t > t) break;
    const d = x.doses[m];
    if (d) f += d.fatigue * Math.exp(-(t - x.t) / d.tau);
  }
  return f;
}

/** 0–1: 1 = fresh, 0 = carrying a full session's worth (SESSION_CAP) of fatigue. */
export const readiness = (f: number) => Math.max(0, Math.min(1, 1 - f / SESSION_CAP));

/** Hours from a dose until it decays to the recovered threshold (OVERLAP_SHARE of itself). */
export const hoursToRecover = (d: Pick<MuscleDose, "fatigue" | "tau">, residualBefore = 0) => {
  const f = d.fatigue + residualBefore;
  const target = Math.max(OVERLAP_MIN, OVERLAP_SHARE * d.fatigue);
  return f <= target ? 0 : d.tau * Math.log(f / target);
};

export interface Overlap {
  muscle: MuscleId;
  t: number;
  label: string;
  prevT: number;
  prevLabel: string;
  gapH: number;
  /** residual fatigue carried into the new hit */
  residual: number;
  /** residual as a share of the previous hit's dose */
  share: number;
  /** what's hitting it now and what hit it last time */
  now: string[];
  prev: string[];
}

export interface MuscleSummary {
  id: MuscleId;
  sets: number;
  effSets: number;
  load: number;
  /** share of all muscles' load, 0–1 */
  loadShare: number;
  hits: number;
  minGapH: number | null;
  avgGapH: number | null;
  /** hours each hit needs to get back under the recovered threshold (mean) */
  recoverH: number | null;
  peakFatigue: number;
  avgReadiness: number;
  minReadiness: number;
  overlaps: number;
  /** hard (effort-weighted) sets per week vs MUSCLE[id].range */
  status: "none" | "low" | "ok" | "high" | "n/a";
}

/** Hits, gaps and overlaps for one muscle across a sorted exposure list, within [from, to). */
function scanMuscle(exps: Exposure[], m: MuscleId, from: number, to: number) {
  const hits: { t: number; label: string; dose: MuscleDose; residual: number }[] = [];
  const overlaps: Overlap[] = [];
  let prev: { t: number; label: string; dose: MuscleDose } | null = null;
  for (const x of exps) {
    const d = x.doses[m];
    if (!d || d.fatigue < HIT_MIN) continue;
    const residual = fatigueAt(exps, m, x.t - 1e-6);
    if (x.t >= from && x.t < to) {
      hits.push({ t: x.t, label: x.label, dose: d, residual });
      if (prev && residual > Math.max(OVERLAP_MIN, OVERLAP_SHARE * prev.dose.fatigue)) {
        overlaps.push({ muscle: m, t: x.t, label: x.label, prevT: prev.t, prevLabel: prev.label, gapH: x.t - prev.t, residual, share: residual / prev.dose.fatigue, now: sources(d), prev: sources(prev.dose) });
      }
    }
    prev = { t: x.t, label: x.label, dose: d };
  }
  // gaps include the hit just before the window so a window's first hit still has one
  const before = exps.filter((x) => x.t < from && (x.doses[m]?.fatigue ?? 0) >= HIT_MIN).pop();
  const times = [...(before ? [before.t] : []), ...hits.map((h) => h.t)];
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  return { hits, overlaps, gaps };
}

function summarize(exps: Exposure[], from: number, to: number, weeks: number, step = 3): { muscles: Record<MuscleId, MuscleSummary>; overlaps: Overlap[] } {
  const muscles = {} as Record<MuscleId, MuscleSummary>;
  const overlaps: Overlap[] = [];
  let totalLoad = 0;
  for (const m of MUSCLE_IDS) {
    let sets = 0, effSets = 0, load = 0;
    for (const x of exps) if (x.t >= from && x.t < to && x.doses[m]) { sets += x.doses[m]!.sets; effSets += x.doses[m]!.effSets; load += x.doses[m]!.load; }
    const { hits, overlaps: ov, gaps } = scanMuscle(exps, m, from, to);
    overlaps.push(...ov);
    let peak = 0, sum = 0, n = 0, minR = 1;
    for (let t = from; t < to; t += step) {
      const f = fatigueAt(exps, m, t);
      peak = Math.max(peak, f);
      const r = readiness(f);
      sum += r; n++;
      minR = Math.min(minR, r);
    }
    // the instant after each hit is the true low point
    for (const h of hits) { const f = fatigueAt(exps, m, h.t); peak = Math.max(peak, f); minR = Math.min(minR, readiness(f)); }
    const wk = sets / weeks;
    // ranges in the literature are for hard sets, so compare effort-weighted sets
    const hard = effSets / weeks;
    const range = MUSCLE[m].range;
    totalLoad += load;
    muscles[m] = {
      id: m,
      sets: wk,
      effSets: effSets / weeks,
      load: load / weeks,
      loadShare: 0,
      hits: hits.length / weeks,
      minGapH: gaps.length ? Math.min(...gaps) : null,
      avgGapH: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      recoverH: hits.length ? hits.reduce((a, h) => a + hoursToRecover(h.dose, h.residual), 0) / hits.length : null,
      peakFatigue: peak,
      avgReadiness: n ? sum / n : 1,
      minReadiness: minR,
      overlaps: ov.length / weeks,
      status: wk < 0.5 ? "none" : !range ? "n/a" : hard < range[0] ? "low" : hard > range[1] ? "high" : "ok",
    };
  }
  for (const m of MUSCLE_IDS) muscles[m].loadShare = totalLoad ? (muscles[m].load * weeks) / totalLoad : 0;
  overlaps.sort((a, b) => a.t - b.t);
  return { muscles, overlaps };
}

// ───────────────────────── program analysis ─────────────────────────

export interface ProgramSession {
  /** session index within the measured window (0-based) */
  index: number;
  week: number;
  dow: number;
  t: number;
  dayId: string;
  dayName: string;
  programWeek: number;
  label: string;
  exercises: { lift: string; tier: Tier; sets: number; scheme: string }[];
  doses: Doses;
}

export interface ProgramAnalysis {
  schedule: number[];
  /** calendar weeks in the measured window */
  weeks: number;
  sessions: ProgramSession[];
  muscles: Record<MuscleId, MuscleSummary>;
  overlaps: Overlap[];
  exposures: Exposure[];
  /** window on the model clock, hours */
  from: number;
  to: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Lay a program's sessions on a weekly schedule and model each muscle's load and recovery.
 * One full program cycle is measured (up to 12 calendar weeks, at least until the day rotation
 * and the weekly schedule line up again), after one warm-up week so the first sessions start
 * with realistic carried-over fatigue.
 */
export function analyzeProgram(def: ProgramDef, cfg: ProgramConfig, opts: { schedule?: number[]; maxWeeks?: number } = {}): ProgramAnalysis {
  const schedule = [...(opts.schedule?.length ? opts.schedule : defaultSchedule(def.sessionsPerWeek))].sort((a, b) => a - b);
  const spw = schedule.length;
  const base = initialState(def, cfg);
  const maxPct = maxFraction(def.maxLabel);

  // one full cycle of program sessions, in order
  const passes = def.cycle ? def.cycle.weeks : 1;
  const seq: { dayIndex: number; rotations: number }[] = [];
  for (let r = 0; r < passes; r++) {
    for (let i = 0; i < def.days.length; i++) if (isScheduled(def.days[i], weekIndex(def, r))) seq.push({ dayIndex: i, rotations: r });
  }
  if (!seq.length) seq.push({ dayIndex: 0, rotations: 0 });
  const L = seq.length;
  const lcm = (L * spw) / gcd(L, spw);
  const weeks = Math.max(1, Math.min(opts.maxWeeks ?? 12, Math.ceil(Math.max(lcm, L) / spw)));

  const exposures: Exposure[] = [];
  const sessions: ProgramSession[] = [];
  for (let k = -spw; k < weeks * spw; k++) {
    const pos = seq[((k % L) + L) % L];
    const plan = planDay(def, cfg, { ...base, rotations: pos.rotations, dayIndex: pos.dayIndex }, pos.dayIndex);
    const w = Math.floor(k / spw);
    const dow = schedule[((k % spw) + spw) % spw];
    const t = (w * 7 + dow) * 24 + SESSION_HOUR;
    const doses: Doses = {};
    for (const ex of plan.exercises) {
      const p = liftProfile(ex.lift);
      if (!p) continue;
      addExercise(doses, ex.lift, p.muscles, p.fatigue, ex.sets.map((s) => estimatePlanned(s, ex.tier, maxPct)));
    }
    const label = `${k >= 0 ? `W${w + 1} ` : "prev "}${DOW[dow]} ${plan.dayId}`;
    exposures.push({ t, doses, label });
    if (k >= 0) {
      sessions.push({
        index: k, week: w, dow, t, dayId: plan.dayId, dayName: plan.dayName, programWeek: plan.week, label,
        exercises: plan.exercises.map((e) => ({ lift: e.lift, tier: e.tier, sets: e.sets.length, scheme: e.scheme })),
        doses,
      });
    }
  }
  const from = 0, to = weeks * 168;
  const { muscles, overlaps } = summarize(exposures, from, to, weeks);
  return { schedule, weeks, sessions, muscles, overlaps, exposures, from, to };
}

// ───────────────────────── history analysis ─────────────────────────

export interface HistoryAnalysis {
  /** hours on the model clock (epoch hours) for "now" */
  now: number;
  exposures: Exposure[];
  /** per muscle, right now */
  current: Record<MuscleId, { fatigue: number; readiness: number; lastHit: number | null; hoursSince: number | null; readyIn: number }>;
  /** last 7 days, per week */
  last7: Record<MuscleId, MuscleSummary>;
  /** last 28 days, averaged per week */
  last28: Record<MuscleId, MuscleSummary>;
  overlaps28: Overlap[];
  /** exercises we couldn't attribute to any muscle (title → sets) */
  unknown: Record<string, number>;
}

const H = 3600_000;
const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

/**
 * Model the user's real training. Intensity of each set comes from its weight relative to the
 * best e1RM seen so far on that exercise (so 5 × 5 at 80 % ≈ 2–3 RIR); logged RPE wins, and
 * "failure" sets are 0 RIR. Bodyweight / unloaded sets assume 2 RIR.
 */
export function analyzeHistory(
  workouts: HevyWorkout[],
  opts: { now: string | number | Date; liftMap?: Record<string, string>; templates?: Map<string, HevyExerciseTemplate> } = { now: Date.now() },
): HistoryAnalysis {
  const now = new Date(opts.now).getTime() / H;
  const asc = [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const best = new Map<string, number>();
  const exposures: Exposure[] = [];
  const unknown: Record<string, number> = {};

  for (const w of asc) {
    const t = Date.parse(w.start_time) / H;
    if (t > now) continue;
    const doses: Doses = {};
    for (const e of w.exercises) {
      const key = matchLift(e.title, e.exercise_template_id, opts.liftMap);
      const p = exerciseProfile(key, e.title, opts.templates?.get(e.exercise_template_id));
      const work = e.sets.filter((s) => s.type !== "warmup" && ((s.reps ?? 0) > 0 || (s.duration_seconds ?? 0) > 0));
      if (!work.length) continue;
      if (!p) { unknown[e.title] = (unknown[e.title] ?? 0) + work.length; continue; }
      const id = key ?? e.exercise_template_id;
      let b = best.get(id) ?? 0;
      for (const s of work) if ((s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0) b = Math.max(b, e1rm(s.weight_kg!, s.reps!));
      best.set(id, b);
      const est = work.map((s): SetEstimate => {
        const reps = s.reps ?? Math.max(1, Math.round((s.duration_seconds ?? 30) / 4)); // timed sets: ~4 s per "rep"
        if (s.rpe != null) { const rir = Math.max(0, 10 - s.rpe); return { reps, pct: pctFor(reps, rir), rir }; }
        if (s.type === "failure") return { reps, pct: pctFor(reps, 0), rir: 0 };
        if ((s.weight_kg ?? 0) > 0 && b > 0) {
          const pct = Math.min(1, s.weight_kg! / b);
          return { reps, pct, rir: Math.max(0, Math.min(6, maxReps(pct) - reps)) };
        }
        return { reps, pct: pctFor(reps, 2), rir: 2 };
      });
      addExercise(doses, key ?? e.title, p.muscles, p.fatigue, est);
    }
    if (Object.keys(doses).length) exposures.push({ t, doses, label: `${w.start_time.slice(0, 10)} ${w.title}` });
  }

  // Anything older than ~8 weeks has decayed to nothing (e^(−1344/34) ≈ 0); trimming keeps the
  // O(hits × exposures) scans fast on multi-year histories.
  const recent = exposures.filter((x) => x.t >= now - 56 * 24);
  exposures.length = 0;
  exposures.push(...recent);

  const current = {} as HistoryAnalysis["current"];
  for (const m of MUSCLE_IDS) {
    const f = fatigueAt(exposures, m, now);
    const last = [...exposures].reverse().find((x) => (x.doses[m]?.fatigue ?? 0) >= HIT_MIN);
    // hours until readiness is back above the recovered threshold (fatigue ≤ OVERLAP_MIN × 1.5)
    const target = 1.5 * OVERLAP_MIN;
    const tau = last?.doses[m]?.tau ?? MUSCLE[m].tau;
    current[m] = {
      fatigue: f,
      readiness: readiness(f),
      lastHit: last?.t ?? null,
      hoursSince: last ? now - last.t : null,
      readyIn: f > target ? tau * Math.log(f / target) : 0,
    };
  }
  const s7 = summarize(exposures, now - 7 * 24, now, 1, 6);
  const s28 = summarize(exposures, now - 28 * 24, now, 4, 6);
  return { now, exposures, current, last7: s7.muscles, last28: s28.muscles, overlaps28: s28.overlaps, unknown };
}

/** Fatigue curve for one muscle, sampled every `step` hours over [from, to]. */
export function curve(exps: Exposure[], m: MuscleId, from: number, to: number, step = 2): { t: number; f: number }[] {
  const out: { t: number; f: number }[] = [];
  for (let t = from; t <= to; t += step) out.push({ t, f: fatigueAt(exps, m, t) });
  return out;
}
