// e1RM formula shootout.
//
// Formulas (w = weight, r = reps; every formula returns w at r = 1, the usual calculator
// convention, so "1RM from a single" is just the single):
//   epley     w·(1 + r/30)                           Epley, "Poundage Chart", Boyd Epley Workout, 1985
//   brzycki   w·36 / (37 − r)                        Brzycki, JOPERD 64(1), 1993
//   lombardi  w·r^0.10                               Lombardi, "Beginning Weight Training", 1989
//   mayhew    100w / (52.2 + 41.9·e^(−0.055r))       Mayhew et al., J Appl Sport Sci Res 6(4), 1992
//   oconner   w·(1 + 0.025r)                         O'Conner, Simmons & O'Shea, "Weight Training Today", 1989
//   wathan    100w / (48.8 + 53.8·e^(−0.075r))       Wathan, in Baechle (ed.) "Essentials of S&C" (NSCA), 1994
//   lander    100w / (101.3 − 2.67123r)              Lander, NSCA Journal 6(6), 1985
//   rts       w / RTS%(r, RPE)                       Tuchscherer RTS chart (see rpe.ts); logged RPE, else RPE 10
//
// Backtest: every heavy single or double (≤2 reps, ≥ heavyPct of the then-best e1RM, not logged
// below RPE 9) is a "test". Each formula predicts it from the best 3–10-rep set in the preceding
// `windowWeeks` (strictly before the test day): predicted e1RM → predicted load for the test's rep
// count via the same formula (so doubles are judged on that formula's own 2RM). Error = (predicted
// − actual) / actual. One test per session (its heaviest ≤2-rep set).
//
// Thin data: most lifters rarely test singles. With fewer than `minN` tests on the requested lift
// the samples are pooled across `poolLifts` (big four by default); if still thin, `best` falls
// back to Epley and `adequate` is false. Error stats are still reported for whatever n exists.

import type { HevyWorkout } from "./hevy";
import { BIG_FOUR } from "./lifts";
import { pctAt, standardPct, type RpeChart } from "./rpe";
import { addDays, epley, liftHistory, type LiftPoint } from "./stats";
import type { Unit } from "./units";

export type Formula = "epley" | "brzycki" | "lombardi" | "mayhew" | "oconner" | "wathan" | "lander" | "rts";

export const FORMULAS: readonly Formula[] = ["epley", "brzycki", "lombardi", "mayhew", "oconner", "wathan", "lander", "rts"];

export const FORMULA_INFO: Record<Formula, { name: string; expr: string; source: string }> = {
  epley: { name: "Epley", expr: "w·(1 + r/30)", source: "Epley B. Poundage Chart. Boyd Epley Workout, 1985" },
  brzycki: { name: "Brzycki", expr: "w·36/(37 − r)", source: "Brzycki M. Strength testing: predicting a one-rep max from reps-to-fatigue. JOPERD 64(1):88–90, 1993" },
  lombardi: { name: "Lombardi", expr: "w·r^0.10", source: "Lombardi VP. Beginning Weight Training. W.C. Brown, 1989" },
  mayhew: { name: "Mayhew", expr: "100w/(52.2 + 41.9e^(−0.055r))", source: "Mayhew JL et al. Relative muscular endurance performance as a predictor of bench press strength. J Appl Sport Sci Res 6(4):200–206, 1992" },
  oconner: { name: "O'Conner", expr: "w·(1 + 0.025r)", source: "O'Conner B, Simmons J, O'Shea P. Weight Training Today. West Publishing, 1989" },
  wathan: { name: "Wathan", expr: "100w/(48.8 + 53.8e^(−0.075r))", source: "Wathan D. Load assignment. In Baechle TR (ed.), Essentials of Strength Training and Conditioning (NSCA), 1994" },
  lander: { name: "Lander", expr: "100w/(101.3 − 2.67123r)", source: "Lander J. Maximum based on reps. NSCA Journal 6(6):60–61, 1985" },
  rts: { name: "RTS chart", expr: "w / RTS%(reps, RPE)", source: "Tuchscherer M. The Reactive Training Manual. Reactive Training Systems, 2008" },
};

/** e1RM of one set with a given formula. `rpe` only affects "rts" (missing = RPE 10). `chart` swaps the standard RTS chart for a personal one. */
export function e1rmWith(formula: Formula, w: number, reps: number, rpe?: number | null, chart?: RpeChart): number {
  if (reps <= 0 || w <= 0) return 0;
  if (formula === "rts") {
    const e = rpe ?? 10;
    const p = chart ? pctAt(chart, reps, e) : standardPct(reps, e);
    return p > 0 ? w / p : 0;
  }
  if (reps === 1) return w;
  const r = reps;
  switch (formula) {
    case "epley": return epley(w, r);
    case "brzycki": return r >= 37 ? w * 36 : (w * 36) / (37 - r);
    case "lombardi": return w * r ** 0.1;
    case "mayhew": return (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r));
    case "oconner": return w * (1 + 0.025 * r);
    case "wathan": return (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r));
    case "lander": { const d = 101.3 - 2.67123 * r; return d <= 1 ? w * 100 : (100 * w) / d; }
  }
}

/** Load a formula predicts for `reps` (at `rpe` for "rts") given an e1RM. Inverse of e1rmWith. */
export function loadForReps(formula: Formula, e1rm: number, reps: number, rpe?: number | null, chart?: RpeChart): number {
  const k = e1rmWith(formula, 1, reps, rpe, chart);
  return k > 0 ? e1rm / k : 0;
}

export interface ShootoutOptions {
  tz?: string;
  map?: Record<string, string>;
  /** look-back window for predictor sets, weeks. Default 6. */
  windowWeeks?: number;
  /** a ≤2-rep set counts as a test when ≥ this fraction of the then-best Epley e1RM. Default 0.9. */
  heavyPct?: number;
  /** "then-best" = best Epley e1RM (≤10-rep sets) over this many days before the test, including it. Default 365. */
  bestWindowDays?: number;
  /** predictor rep range. Default [3, 10]. */
  minReps?: number;
  maxReps?: number;
  /** tests needed before a winner is trusted. Default 5. */
  minN?: number;
  /** pool these lifts when the requested lift is thin. Default the big four; [] disables pooling. */
  poolLifts?: readonly string[];
  /** optional personal RPE chart for the "rts" formula */
  chart?: RpeChart;
}

export interface ShootoutSample {
  lift: string;
  date: string;
  workoutId: string;
  /** the test set */
  weight: number;
  reps: number;
  rpe: number | null;
  /** predictor set used (best Epley 3–10-rep set in the window) */
  from: { date: string; weight: number; reps: number; rpe: number | null };
  /** predicted load for `reps`, per formula */
  predicted: Record<Formula, number>;
}

export interface FormulaScore {
  formula: Formula;
  name: string;
  n: number;
  /** mean |predicted − actual| / actual, fraction (0.03 = 3%); null when n = 0 */
  meanAbsPct: number | null;
  /** mean (predicted − actual) / actual; positive = formula overestimates */
  bias: number | null;
  /** root mean squared % error */
  rmsePct: number | null;
}

export interface ShootoutResult {
  lift: string;
  /** samples were pooled across lifts because the requested one was thin */
  pooled: boolean;
  liftsUsed: string[];
  /** tests on the requested lift alone */
  nLift: number;
  n: number;
  /** n ≥ minN */
  adequate: boolean;
  /** scores sorted by meanAbsPct ascending (formulas with n = 0 last) */
  scores: FormulaScore[];
  /** lowest error when adequate, else "epley" */
  best: Formula;
  note: string;
  samples: ShootoutSample[];
}

function liftSamples(points: LiftPoint[], lift: string, o: Required<Omit<ShootoutOptions, "chart" | "map" | "tz" | "poolLifts">> & { chart?: RpeChart }): ShootoutSample[] {
  const out: ShootoutSample[] = [];
  const sessBest = points.map((p) => Math.max(0, ...p.sets.filter((s) => s.reps <= 10).map((s) => epley(s.weight, s.reps))));
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const tests = p.sets.filter((s) => s.reps <= 2 && s.weight > 0 && (s.rpe == null || s.rpe >= 9));
    if (!tests.length) continue;
    const t = tests.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
    const bestStart = addDays(p.date, -o.bestWindowDays);
    let thenBest = 0;
    for (let j = 0; j <= i; j++) if (points[j].date > bestStart) thenBest = Math.max(thenBest, sessBest[j]);
    if (t.weight < o.heavyPct * thenBest) continue;

    const winStart = addDays(p.date, -o.windowWeeks * 7);
    let from: ShootoutSample["from"] | null = null;
    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (q.date < winStart || q.date >= p.date) continue;
      for (const s of q.sets) {
        if (s.reps < o.minReps || s.reps > o.maxReps || s.weight <= 0) continue;
        if (!from || epley(s.weight, s.reps) > epley(from.weight, from.reps)) from = { date: q.date, weight: s.weight, reps: s.reps, rpe: s.rpe ?? null };
      }
    }
    if (!from) continue;
    const f = from;
    const predicted = Object.fromEntries(FORMULAS.map((fm) => {
      const e1 = e1rmWith(fm, f.weight, f.reps, f.rpe, o.chart);
      return [fm, loadForReps(fm, e1, t.reps, t.rpe ?? null, o.chart)];
    })) as Record<Formula, number>;
    out.push({ lift, date: p.date, workoutId: p.workoutId, weight: t.weight, reps: t.reps, rpe: t.rpe ?? null, from: f, predicted });
  }
  return out;
}

function score(samples: ShootoutSample[]): FormulaScore[] {
  return FORMULAS.map((formula) => {
    const errs = samples.map((s) => (s.predicted[formula] - s.weight) / s.weight);
    const n = errs.length;
    const mean = (xs: number[]) => (n ? xs.reduce((a, b) => a + b, 0) / n : null);
    const ms = mean(errs.map((e) => e * e));
    return { formula, name: FORMULA_INFO[formula].name, n, meanAbsPct: mean(errs.map(Math.abs)), bias: mean(errs), rmsePct: ms == null ? null : Math.sqrt(ms) };
  }).sort((a, b) => (a.meanAbsPct ?? Infinity) - (b.meanAbsPct ?? Infinity));
}

/** Backtest every formula against your own heavy singles/doubles. Weights in `unit`. */
export function formulaShootout(workouts: HevyWorkout[], lift: string, unit: Unit, opts: ShootoutOptions = {}): ShootoutResult {
  const tz = opts.tz ?? "UTC";
  const o = {
    windowWeeks: opts.windowWeeks ?? 6, heavyPct: opts.heavyPct ?? 0.9, bestWindowDays: opts.bestWindowDays ?? 365,
    minReps: opts.minReps ?? 3, maxReps: opts.maxReps ?? 10, minN: opts.minN ?? 5, chart: opts.chart,
  };
  const pool = opts.poolLifts ?? BIG_FOUR;
  const own = liftSamples(liftHistory(workouts, lift, unit, tz, opts.map), lift, o);
  let samples = own;
  let liftsUsed = [lift];
  let pooled = false;
  if (own.length < o.minN && pool.length) {
    const others = pool.filter((l) => l !== lift);
    const extra = others.flatMap((l) => liftSamples(liftHistory(workouts, l, unit, tz, opts.map), l, o));
    if (extra.length) {
      pooled = true;
      samples = [...own, ...extra].sort((a, b) => a.date.localeCompare(b.date));
      liftsUsed = [lift, ...others.filter((l) => extra.some((s) => s.lift === l))];
    }
  }
  const scores = score(samples);
  const adequate = samples.length >= o.minN;
  const best: Formula = adequate ? scores[0].formula : "epley";
  const pct = (x: number | null) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
  const top = scores[0];
  const epl = scores.find((s) => s.formula === "epley")!;
  const where = pooled ? `${samples.length} heavy singles/doubles pooled across ${liftsUsed.join(", ")} (${own.length} on ${lift})` : `${samples.length} heavy singles/doubles on ${lift}`;
  const note = !samples.length
    ? `No heavy singles or doubles with 3–${o.maxReps}-rep sets in the ${o.windowWeeks} weeks before them; can't backtest. Using Epley.`
    : !adequate
      ? `Only ${where}; need ${o.minN} to pick a winner. Using Epley (error so far ${pct(epl.meanAbsPct)}).`
      : `${FORMULA_INFO[best].name} fits best over ${where}: off by ${pct(top.meanAbsPct)} on average (${top.bias! >= 0 ? "over" : "under"}estimates by ${pct(Math.abs(top.bias!))}). Epley: ${pct(epl.meanAbsPct)}${best !== "epley" && epl.meanAbsPct! - top.meanAbsPct! < 0.005 ? " — within noise of each other" : ""}.`;
  return { lift, pooled, liftsUsed, nLift: own.length, n: samples.length, adequate, scores, best, note, samples };
}
