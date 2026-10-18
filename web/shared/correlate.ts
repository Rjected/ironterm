// Does recovery predict performance? Score each lifting session against the lifter's own recent best,
// join it to that morning's WHOOP recovery (and sleep / previous-day strain), and report correlations with
// honest uncertainty. Pure functions.
//
// Performance score per lift session:
//   e1rmPct    = (session best Epley e1RM ÷ best e1RM of that lift in the previous `windowDays`) − 1, in %.
//                0 = matched your recent best, −5 = 5 % under it. Needs a prior session in the window.
//   amrapDelta = reps on an AMRAP-ish last set minus the reps the prior best e1RM predicts at that weight
//                (inverse Epley: 30·(e1RM/w − 1)). A set counts as AMRAP-ish if Hevy marks it "failure", the
//                program log recorded AMRAP reps for it, or it beat the earlier sets at ≥ 97 % of their load by
//                2+ reps. Only scored below the prior best (heavier is a PR attempt, covered by e1rmPct).
// A workout's score is the mean over its scored lifts.
//
// Stats: Pearson r and Spearman ρ (Pearson on average ranks). 95 % CIs via the Fisher z-transform, with
// SE = 1/√(n−3) for r and √(1.06/(n−3)) for ρ (Fieller, Hartley & Pearson 1957). p-values from the t
// statistic t = r·√((n−2)/(1−r²)) with n−2 df. Recovery buckets follow WHOOP's colours: red 0–33,
// yellow 34–66, green 67–100.

import type { HevyWorkout } from "./hevy";
import { LIFTS, matchLift } from "./lifts";
import type { LogEntry } from "./program";
import { addDays, epley, localDate } from "./stats";
import type { WhoopRecovery, WhoopWorkout } from "./whoop";

export interface SleepEntry { date: string; hours: number }
export interface StrainEntry { date: string; strain: number }

export type Predictor = "recovery" | "hrv" | "rhr" | "sleep" | "prevStrain";
export type PerfMetric = "e1rmPct" | "amrapDelta";

export interface LiftPerformance {
  lift: string;
  /** session best e1RM, kg */
  e1rm: number;
  /** best e1RM in the window before this session, kg; null if none */
  priorBest: number | null;
  e1rmPct: number | null;
  amrap: { weight: number; reps: number; expected: number } | null;
  amrapDelta: number | null;
}

export interface SessionPerformance {
  workoutId: string;
  date: string;
  lifts: LiftPerformance[];
  e1rmPct: number | null;
  amrapDelta: number | null;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleep: number | null;
  /** strain `lagDays` before the session */
  prevStrain: number | null;
}

export interface Correlation {
  predictor: Predictor;
  metric: PerfMetric;
  n: number;
  pearson: number | null;
  spearman: number | null;
  /** 95 % CI for Spearman ρ */
  ci95: [number, number] | null;
  /** two-sided p for Spearman ρ (t approximation) */
  p: number | null;
  /** plain-English line, only when n ≥ minN */
  summary: string | null;
}

export type RecoveryZone = "red" | "yellow" | "green";

export interface RecoveryBucket {
  zone: RecoveryZone;
  /** inclusive score range */
  range: [number, number];
  n: number;
  meanE1rmPct: number | null;
  nAmrap: number;
  meanAmrapDelta: number | null;
}

export interface RecoveryPerformance {
  sessions: SessionPerformance[];
  correlations: Correlation[];
  buckets: RecoveryBucket[];
  /** headline for recovery → performance, null until n ≥ minN */
  finding: string | null;
  minN: number;
}

export interface CorrelateOpts {
  /** user lift → template id overrides */
  map?: Record<string, string>;
  /** lift keys to score (default: barbell lifts; dumbbell / machine e1RMs from high-rep sets are too noisy) */
  lifts?: string[];
  /** rolling-best lookback (default 28 days) */
  windowDays?: number;
  sleep?: SleepEntry[];
  /** day strain by local date; falls back to the max WHOOP workout strain per day */
  strain?: StrainEntry[];
  whoopWorkouts?: WhoopWorkout[];
  /** days back for the strain predictor (default 1 = yesterday's strain); 0 drops it */
  lagDays?: number;
  /** minimum pairs before a plain-English finding is given (default 15) */
  minN?: number;
  /** program logs, to mark AMRAP sets the program prescribed */
  programLog?: LogEntry[];
  /** sets above this many reps are ignored for e1RM (Epley gets unreliable; default 12) */
  maxRepsForE1rm?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Per-session performance scores joined to recovery, sleep and strain. */
export function sessionPerformance(workouts: HevyWorkout[], tz: string, recoveries: WhoopRecovery[], opts: CorrelateOpts = {}): SessionPerformance[] {
  const windowDays = opts.windowDays ?? 28, maxR = opts.maxRepsForE1rm ?? 12, lag = opts.lagDays ?? 1;
  const allowed = new Set(opts.lifts ?? Object.entries(LIFTS).filter(([, d]) => d.kind === "barbell").map(([k]) => k));
  const rec = new Map<string, WhoopRecovery>();
  for (const r of recoveries) rec.set(r.date.slice(0, 10), r);
  const sleep = new Map((opts.sleep ?? []).map((s) => [s.date.slice(0, 10), s.hours]));
  const strain = new Map<string, number>();
  if (opts.strain) for (const s of opts.strain) strain.set(s.date.slice(0, 10), s.strain);
  else
    for (const w of opts.whoopWorkouts ?? []) {
      if (w.strain == null) continue;
      const d = localDate(w.start, tz);
      strain.set(d, Math.max(strain.get(d) ?? 0, w.strain));
    }
  const amrapLog = new Map<string, number>();
  for (const e of opts.programLog ?? []) for (const r of e.results) if (r.amrapReps != null) amrapLog.set(`${e.workoutId}\0${r.lift}`, r.amrapReps);

  const history = new Map<string, { date: string; e1rm: number }[]>();
  const out: SessionPerformance[] = [];
  for (const w of [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const date = localDate(w.start_time, tz);
    const byLift = new Map<string, { kg: number; reps: number; failure: boolean }[]>();
    for (const e of w.exercises) {
      const lift = matchLift(e.title, e.exercise_template_id, opts.map);
      if (!lift || !allowed.has(lift)) continue;
      const sets = e.sets.filter((s) => s.type !== "warmup" && (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0)
        .map((s) => ({ kg: s.weight_kg!, reps: s.reps!, failure: s.type === "failure" }));
      if (sets.length) byLift.set(lift, [...(byLift.get(lift) ?? []), ...sets]);
    }
    const lifts: LiftPerformance[] = [];
    for (const [lift, sets] of byLift) {
      const usable = sets.filter((s) => s.reps <= maxR);
      if (!usable.length) continue;
      const e1rm = Math.max(...usable.map((s) => epley(s.kg, s.reps)));
      const from = addDays(date, -windowDays);
      const hist = history.get(lift) ?? [];
      const prior = hist.filter((h) => h.date >= from && h.date < date);
      const priorBest = prior.length ? Math.max(...prior.map((h) => h.e1rm)) : null;
      let amrap: LiftPerformance["amrap"] = null;
      const last = sets[sets.length - 1], earlier = sets.slice(0, -1);
      const logged = amrapLog.get(`${w.id}\0${lift}`);
      const beat = earlier.length > 0 && earlier.every((s) => last.kg >= s.kg * 0.97 ? last.reps >= s.reps + 2 : true) && earlier.some((s) => last.kg >= s.kg * 0.97);
      // a set at or above the prior best e1RM is a PR attempt, not a reps-vs-expected test
      if (priorBest != null && last.kg < priorBest && (last.failure || logged != null || beat)) {
        const expected = Math.max(1, 30 * (priorBest / last.kg - 1));
        amrap = { weight: last.kg, reps: last.reps, expected };
      }
      lifts.push({
        lift, e1rm, priorBest,
        e1rmPct: priorBest ? (e1rm / priorBest - 1) * 100 : null,
        amrap,
        amrapDelta: amrap ? amrap.reps - amrap.expected : null,
      });
      hist.push({ date, e1rm });
      history.set(lift, hist);
    }
    if (!lifts.length) continue;
    const r = rec.get(date);
    out.push({
      workoutId: w.id, date, lifts,
      e1rmPct: mean(lifts.flatMap((l) => (l.e1rmPct == null ? [] : [l.e1rmPct]))),
      amrapDelta: mean(lifts.flatMap((l) => (l.amrapDelta == null ? [] : [l.amrapDelta]))),
      recovery: r?.score ?? null,
      hrv: r?.hrv ?? null,
      rhr: r?.rhr ?? null,
      sleep: sleep.get(date) ?? null,
      prevStrain: lag > 0 ? strain.get(addDays(date, -lag)) ?? null : null,
    });
  }
  return out;
}

// ───────── statistics ─────────

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = mean(x)!, my = mean(y)!;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Average ranks (ties share the mean rank), 1-based. */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

export function spearman(x: number[], y: number[]): number | null {
  return pearson(ranks(x), ranks(y));
}

/** Fisher-z 95 % CI. `seScale` 1 for Pearson, 1.06 for Spearman. */
export function fisherCI(r: number, n: number, seScale = 1): [number, number] | null {
  if (n < 4) return null;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), se = Math.sqrt(seScale / (n - 3));
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
}

/** Two-sided p for a correlation via t with n−2 df. */
export function corrP(r: number, n: number): number | null {
  if (n < 4) return null;
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2, t = Math.abs(r) * Math.sqrt(df / (1 - r * r));
  return betaInc(df / 2, 0.5, df / (df + t * t));
}

// Regularized incomplete beta I_x(a,b) (Numerical Recipes betacf).
function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lnBeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-30;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z: number): number {
  // Lanczos (g = 7, n = 9)
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = g[0];
  for (let i = 1; i < 9; i++) x += g[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ───────── report ─────────

const LABEL: Record<Predictor, string> = {
  recovery: "WHOOP recovery", hrv: "HRV", rhr: "resting heart rate", sleep: "sleep", prevStrain: "the previous day's strain",
};
const METRIC: Record<PerfMetric, string> = {
  e1rmPct: "e1RM vs your 28-day best", amrapDelta: "AMRAP reps vs expected",
};
const f2 = (x: number) => (x >= 0 ? "" : "−") + Math.abs(x).toFixed(2);
const f1 = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1);

function strength(r: number): string {
  const a = Math.abs(r);
  return a < 0.1 ? "no meaningful" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong";
}

function describe(c: Omit<Correlation, "summary">, windowDays: number): string {
  const rho = c.spearman!, [lo, hi] = c.ci95!;
  const metric = c.metric === "e1rmPct" ? `e1RM vs your ${windowDays}-day best` : METRIC[c.metric];
  const dir = rho > 0 ? "higher" : "lower";
  const rel = Math.abs(rho) < 0.1
    ? `${LABEL[c.predictor]} showed no meaningful relationship with ${metric}`
    : `${dir} ${LABEL[c.predictor]} went with better ${metric} — ${strength(rho)} ${rho > 0 ? "positive" : "negative"} relationship`;
  const stats = `(Spearman ρ = ${f2(rho)}, 95% CI ${f2(lo)} to ${f2(hi)}, p = ${c.p! < 0.001 ? "<0.001" : c.p!.toFixed(2)}, n = ${c.n})`;
  const verdict = lo <= 0 && hi >= 0
    ? "The interval includes zero, so this is consistent with no real effect; more sessions will narrow it."
    : "The interval excludes zero, but this is a correlation in one person's log — programming (light vs heavy days), time of day and illness can drive both.";
  return `Across ${c.n} sessions, ${rel} ${stats}. ${verdict}`;
}

/** Recovery → performance: correlations, WHOOP-zone buckets and a guarded finding. */
export function recoveryVsPerformance(workouts: HevyWorkout[], tz: string, recoveries: WhoopRecovery[], opts: CorrelateOpts = {}): RecoveryPerformance {
  const minN = opts.minN ?? 15, windowDays = opts.windowDays ?? 28;
  const sessions = sessionPerformance(workouts, tz, recoveries, opts);
  const predictors: Predictor[] = ["recovery", "hrv", "rhr", "sleep", ...((opts.lagDays ?? 1) > 0 ? (["prevStrain"] as const) : [])];
  const correlations: Correlation[] = [];
  for (const metric of ["e1rmPct", "amrapDelta"] as PerfMetric[])
    for (const predictor of predictors) {
      const pairs = sessions.filter((s) => s[predictor] != null && s[metric] != null);
      const x = pairs.map((s) => s[predictor]!), y = pairs.map((s) => s[metric]!);
      const n = pairs.length, rP = pearson(x, y), rS = spearman(x, y);
      const base = { predictor, metric, n, pearson: rP, spearman: rS, ci95: rS == null ? null : fisherCI(rS, n, 1.06), p: rS == null ? null : corrP(rS, n) };
      correlations.push({ ...base, summary: n >= minN && rS != null && base.ci95 && base.p != null ? describe(base, windowDays) : null });
    }

  const zones: [RecoveryZone, number, number][] = [["red", 0, 33], ["yellow", 34, 66], ["green", 67, 100]];
  const zoneOf = (s: number): RecoveryZone => (s < 34 ? "red" : s < 67 ? "yellow" : "green");
  const buckets: RecoveryBucket[] = zones.map(([zone, a, b]) => {
    const ss = sessions.filter((s) => s.recovery != null && zoneOf(s.recovery) === zone);
    const e = ss.flatMap((s) => (s.e1rmPct == null ? [] : [s.e1rmPct])), am = ss.flatMap((s) => (s.amrapDelta == null ? [] : [s.amrapDelta]));
    return { zone, range: [a, b], n: e.length, meanE1rmPct: mean(e), nAmrap: am.length, meanAmrapDelta: mean(am) };
  });

  let finding: string | null = null;
  const head = correlations.find((c) => c.predictor === "recovery" && c.metric === "e1rmPct");
  if (head?.summary) {
    const shown = buckets.filter((b) => b.n >= 3 && b.meanE1rmPct != null);
    const bucketLine = shown.length >= 2
      ? ` By zone: ${shown.map((b) => `${b.zone} days ${f1(b.meanE1rmPct!)}% (n=${b.n})`).join(", ")}.`
      : "";
    finding = head.summary + bucketLine;
  }
  return { sessions, correlations, buckets, finding, minN };
}
