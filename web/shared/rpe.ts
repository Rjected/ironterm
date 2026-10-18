// Personal RPE chart.
//
// Standard chart: Mike Tuchscherer's RTS RPE chart (Reactive Training Systems; "The Reactive
// Training Manual", 2008, and the RTS chart as republished in Helms, Valdez & Morgan, "The Muscle
// and Strength Pyramid: Training", 2nd ed.). It is one curve: %1RM depends only on the number of
// reps you could have done, i.e. effective reps n = reps + (10 − RPE). 1@10 = 100%, 1@9 = 2@10 =
// 95.5%, 3@8 = 5@10 = 86.3%, 5@8 = 81.1%. The published values for n = 1…16 in half-rep steps are
// in RTS_CURVE below, which covers the whole 1–12 reps × RPE 6–10 table.
//
// Personal chart: for every set with an RPE logged, observed %1RM = weight / reference e1RM, where
// the reference is the rolling best Epley e1RM (sets of ≤10 reps, no RPE involved) over the
// previous `windowDays`, including that day. Each (reps, RPE) cell's mean is blended with the
// standard value by shrinkage: blended = (k·prior + n·observed) / (k + n). With `pooled`, the prior
// is the standard value shifted by your overall offset (itself shrunk toward 0), so cells you've
// never logged still move a little toward how you rate RPE in general.
//
// Caveat: if you never train near a max, the Epley reference sits below your true 1RM and observed
// percentages read high ("grinds harder"). Epley matches the chart's RPE 10 column within ~1% for
// 1–10 reps, so the two estimates are consistent at the top end.

import type { HevyWorkout } from "./hevy";
import { addDays, epley, liftHistory } from "./stats";
import type { Unit } from "./units";

/** RTS %1RM by effective reps (reps + 10 − RPE) = 1, 1.5, 2 … 16. */
export const RTS_CURVE: readonly number[] = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4,
  76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.2,
];

export const CHART_REPS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);
export const CHART_RPES: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** Standard RTS %1RM (as a fraction) for any reps ≥ 1 and RPE; interpolates, extrapolates linearly past the table. */
export function standardPct(reps: number, rpe: number): number {
  const n = reps + 10 - rpe;
  const x = (n - 1) * 2; // index into RTS_CURVE
  if (x <= 0) return (RTS_CURVE[0] + ((RTS_CURVE[0] - RTS_CURVE[2]) / 2) * -x) / 100;
  const last = RTS_CURVE.length - 1;
  if (x >= last) return Math.max(0.3, (RTS_CURVE[last] - ((RTS_CURVE[last - 2] - RTS_CURVE[last]) / 2) * (x - last)) / 100);
  const i = Math.floor(x), t = x - i;
  return (RTS_CURVE[i] * (1 - t) + RTS_CURVE[i + 1] * t) / 100;
}

export interface RpeChart {
  /** row labels: 1…12 */
  reps: number[];
  /** column labels: 6, 6.5 … 10 */
  rpes: number[];
  /** pct[repsIndex][rpeIndex] = fraction of 1RM */
  pct: number[][];
  /** the standard chart, same shape */
  standard: number[][];
  /** logged sets behind each cell */
  samples: number[][];
  /** raw observed mean per cell (null = no data) */
  observed: (number | null)[][];
  /** weighted mean (observed − standard), fraction of 1RM. Positive = you lift heavier than the chart at a given RPE. */
  offsetPct: number;
  /** weighted mean (chart RPE implied by the load − RPE you logged). Positive = you rate sets easier than the chart, i.e. you grind harder than your RPE says. */
  offsetRpe: number;
  totalSamples: number;
  summary: string;
}

const grid = <T>(f: (r: number, e: number, i: number, j: number) => T): T[][] =>
  CHART_REPS.map((r, i) => CHART_RPES.map((e, j) => f(r, e, i, j)));

export function standardChart(): RpeChart {
  const std = grid((r, e) => standardPct(r, e));
  return {
    reps: [...CHART_REPS], rpes: [...CHART_RPES], pct: std.map((row) => [...row]), standard: std,
    samples: grid(() => 0), observed: grid(() => null), offsetPct: 0, offsetRpe: 0, totalSamples: 0, summary: "Standard RTS chart (no RPE data yet).",
  };
}

/** %1RM from a chart, interpolating between cells and extrapolating outside 1–12 reps / RPE 6–10 with the standard curve's shape. */
export function pctAt(chart: RpeChart, reps: number, rpe: number): number {
  const R = chart.reps, E = chart.rpes;
  const cr = Math.min(Math.max(reps, R[0]), R[R.length - 1]);
  const ce = Math.min(Math.max(rpe, E[0]), E[E.length - 1]);
  const ri = Math.min(R.length - 2, Math.max(0, Math.floor(cr - R[0])));
  const rt = (cr - R[ri]) / (R[ri + 1] - R[ri]);
  let ei = 0;
  while (ei < E.length - 2 && E[ei + 1] <= ce) ei++;
  const et = (ce - E[ei]) / (E[ei + 1] - E[ei]);
  const at = (i: number, j: number) => chart.pct[i][j];
  const v = (at(ri, ei) * (1 - et) + at(ri, ei + 1) * et) * (1 - rt) + (at(ri + 1, ei) * (1 - et) + at(ri + 1, ei + 1) * et) * rt;
  // outside the table: scale by the standard curve's ratio
  if (cr === reps && ce === rpe) return v;
  return v * (standardPct(reps, rpe) / standardPct(cr, ce));
}

/** Load for a target reps @ RPE given an e1RM (same unit). Not rounded to plates. */
export function loadFor(chart: RpeChart, e1rm: number, reps: number, rpe: number): number {
  return e1rm * pctAt(chart, reps, rpe);
}

/** e1RM implied by a set of `weight` × `reps` @ `rpe`. */
export function e1rmFrom(chart: RpeChart, weight: number, reps: number, rpe: number): number {
  const p = pctAt(chart, reps, rpe);
  return p > 0 ? weight / p : 0;
}

/** RPE the standard chart implies for a set at fraction `pct` of 1RM for `reps`. */
export function impliedRpe(pct: number, reps: number): number {
  // invert the monotone curve by bisection on n (effective reps)
  let lo = 0.5, hi = 20;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (standardPct(mid, 10) > pct) lo = mid; else hi = mid;
  }
  return reps + 10 - (lo + hi) / 2;
}

export interface PersonalChartOptions {
  tz?: string;
  /** lift key → Hevy template id overrides (as in liftHistory) */
  map?: Record<string, string>;
  /** reference e1RM = best Epley e1RM over this many days up to the set's date. Default 42. */
  windowDays?: number;
  /** shrinkage pseudo-count per cell: samples needed to trust a cell half and half. Default 6. */
  k?: number;
  /** pseudo-count for the overall offset. Default 10. */
  kOffset?: number;
  /** shrink cells toward standard + overall offset instead of plain standard. Default true. */
  pooled?: boolean;
  /** only use sets on or after this date (YYYY-MM-DD) */
  since?: string;
}

/** Learn a personal RPE chart for one lift from logged RPEs. Weights are read in `unit` (the chart itself is unitless). */
export function personalChart(workouts: HevyWorkout[], liftKey: string, unit: Unit, opts: PersonalChartOptions = {}): RpeChart {
  const tz = opts.tz ?? "UTC";
  const windowDays = opts.windowDays ?? 42;
  const k = opts.k ?? 6;
  const kOff = opts.kOffset ?? 10;
  const pooled = opts.pooled ?? true;
  const pts = liftHistory(workouts, liftKey, unit, tz, opts.map);

  // Epley best per session from ≤10-rep sets
  const sessBest = pts.map((p) => ({ date: p.date, e1: Math.max(0, ...p.sets.filter((s) => s.reps <= 10).map((s) => epley(s.weight, s.reps))) }));
  const ref = (date: string) => {
    const start = addDays(date, -windowDays);
    let b = 0;
    for (const s of sessBest) if (s.date > start && s.date <= date) b = Math.max(b, s.e1);
    return b;
  };

  const sum = grid(() => 0), cnt = grid(() => 0);
  let rpeDiff = 0;
  for (const p of pts) {
    if (opts.since && p.date < opts.since) continue;
    const r1 = ref(p.date);
    if (!r1) continue;
    for (const s of p.sets) {
      if (s.rpe == null || s.weight <= 0 || s.reps < 1 || s.reps > 12) continue;
      const e = Math.round(s.rpe * 2) / 2;
      if (e < 6 || e > 10) continue;
      const obs = s.weight / r1;
      if (obs < 0.4 || obs > 1.05) continue; // logging errors
      const i = s.reps - 1, j = CHART_RPES.indexOf(e);
      sum[i][j] += obs;
      cnt[i][j] += 1;
      rpeDiff += impliedRpe(obs, s.reps) - e;
    }
  }

  const std = grid((r, e) => standardPct(r, e));
  const observed = grid((_r, _e, i, j) => (cnt[i][j] ? sum[i][j] / cnt[i][j] : null));
  let N = 0, diff = 0;
  for (let i = 0; i < std.length; i++) for (let j = 0; j < std[i].length; j++) if (cnt[i][j]) { N += cnt[i][j]; diff += sum[i][j] - cnt[i][j] * std[i][j]; }
  const offsetPct = N ? diff / N : 0;
  const offsetRpe = N ? rpeDiff / N : 0;
  const g = pooled ? diff / (N + kOff) : 0; // shrunk global offset

  const pct = grid((_r, _e, i, j) => {
    const prior = std[i][j] + g;
    const n = cnt[i][j];
    return n ? (k * prior + sum[i][j]) / (k + n) : prior;
  });
  monotone(pct);

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const summary = N < 5
    ? `Only ${N} RPE-logged set${N === 1 ? "" : "s"}; using the standard chart.`
    : Math.abs(offsetRpe) < 0.25
      ? `Your RPE matches the chart (within ${r1(Math.abs(offsetRpe))} RPE over ${N} sets).`
      : offsetRpe > 0
        ? `You grind harder than you rate: your loads match about ${r1(offsetRpe)} RPE higher than you log (${N} sets).`
        : `You rate sets harder than the chart: your loads match about ${r1(-offsetRpe)} RPE lower than you log (${N} sets).`;

  return { reps: [...CHART_REPS], rpes: [...CHART_RPES], pct, standard: std, samples: cnt, observed, offsetPct, offsetRpe, totalSamples: N, summary };
}

/** Keep %1RM non-increasing in reps and non-decreasing in RPE (noisy cells can break the order). */
function monotone(p: number[][]) {
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 0; j < p[0].length; j++) for (let i = 1; i < p.length; i++) if (p[i][j] > p[i - 1][j]) { const m = (p[i][j] + p[i - 1][j]) / 2; p[i][j] = m; p[i - 1][j] = m; }
    for (let i = 0; i < p.length; i++) for (let j = 1; j < p[i].length; j++) if (p[i][j] < p[i][j - 1]) { const m = (p[i][j] + p[i][j - 1]) / 2; p[i][j] = m; p[i][j - 1] = m; }
  }
}
