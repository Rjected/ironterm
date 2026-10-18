// Bodyweight: merge weigh-ins from several sources, smooth them into a trend, and derive rate of change,
// phase (cut / maintain / bulk) and relative strength. Pure functions.
//
// Trend: exponentially smoothed moving average as in John Walker's "The Hacker's Diet"
// (T_n = T_{n-1} + α·(W_n − T_{n-1}), α = 0.1 per day). Gap-aware: when weigh-ins are g days apart the
// previous trend has decayed g times, so the effective weight on the new reading is 1 − (1 − α)^g. A 30+
// day gap therefore nearly resets the trend instead of dragging old data forward.
// Rate: least-squares slope of the trend over a trailing window (Hacker's Diet also fits a line to the
// trend), reported per week and as % of bodyweight per week, the unit MacroFactor and most coaching
// guidance use for cut / bulk speed.

import type { LiftPoint } from "./stats";
import { addDays } from "./stats";
import { fromKg, type Unit } from "./units";

export type WeighInSource = "hevy" | "whoop" | "manual";

export interface WeighIn {
  /** local YYYY-MM-DD (an ISO timestamp is accepted; only the date part is used) */
  date: string;
  kg: number;
  source: WeighInSource;
  /** optional ISO time or HH:MM; the earliest reading of a day wins within one source (morning weigh-in) */
  time?: string;
}

export interface DailyWeight {
  date: string;
  kg: number;
  /** source the day's value came from */
  source: WeighInSource;
  /** every source that had a reading that day */
  sources: WeighInSource[];
}

export interface MergeOpts {
  /** which source wins when several report the same day (default manual > hevy > whoop: a scale entry beats a
   *  WHOOP profile value that is rarely updated) */
  priority?: WeighInSource[];
  /** readings outside this range (kg) are dropped as typos (default 25–350) */
  minKg?: number;
  maxKg?: number;
}

const DEFAULT_PRIORITY: WeighInSource[] = ["manual", "hevy", "whoop"];

/** Merge weigh-ins (any mix of sources, e.g. [...hevy, ...whoop, ...manual]) into one reading per day, oldest first. */
export function mergeWeighIns(weighIns: WeighIn[], opts: MergeOpts = {}): DailyWeight[] {
  const prio = opts.priority ?? DEFAULT_PRIORITY;
  const rank = (s: WeighInSource) => { const i = prio.indexOf(s); return i < 0 ? prio.length : i; };
  const lo = opts.minKg ?? 25, hi = opts.maxKg ?? 350;

  // date → source → readings
  const days = new Map<string, Map<WeighInSource, WeighIn[]>>();
  for (const w of weighIns) {
    if (!w || !Number.isFinite(w.kg) || w.kg < lo || w.kg > hi || !w.date) continue;
    const date = w.date.slice(0, 10);
    const bySrc = days.get(date) ?? new Map<WeighInSource, WeighIn[]>();
    bySrc.set(w.source, [...(bySrc.get(w.source) ?? []), w]);
    days.set(date, bySrc);
  }

  const out: DailyWeight[] = [];
  for (const [date, bySrc] of days) {
    const sources = [...bySrc.keys()].sort((a, b) => rank(a) - rank(b));
    const src = sources[0];
    const rs = bySrc.get(src)!;
    const timed = rs.filter((r) => r.time).sort((a, b) => a.time!.localeCompare(b.time!));
    // earliest timed reading; otherwise the mean of that source's readings (exact duplicates collapse)
    const kg = timed.length ? timed[0].kg : rs.reduce((a, r) => a + r.kg, 0) / rs.length;
    out.push({ date, kg, source: src, sources });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type Phase = "cutting" | "maintaining" | "bulking";

export interface TrendPoint {
  date: string;
  /** that day's scale reading (unit) */
  raw: number;
  /** smoothed trend (unit) */
  trend: number;
}

export interface BodyweightTrend {
  unit: Unit;
  alpha: number;
  points: TrendPoint[];
  latest: TrendPoint | null;
  /** trend slope over the last `rateWindowDays`, unit per week; null with < 2 readings spanning ≥ 7 days */
  weeklyRate: number | null;
  /** weeklyRate as % of current trend weight per week */
  weeklyRatePct: number | null;
  /** trend now minus trend 28 days before the latest reading; null without data that far back */
  change4w: number | null;
  phase: Phase | null;
}

export interface TrendOpts {
  unit?: Unit;
  /** smoothing per day (default 0.1, Hacker's Diet) */
  alpha?: number;
  /** trailing window for the rate fit (default 21 days) */
  rateWindowDays?: number;
  /** |% BW/week| at or below which the phase is "maintaining" (default 0.25) */
  maintainPct?: number;
  /** readings older than this many days before `today` don't produce a rate / phase (default 21) */
  staleDays?: number;
  /** YYYY-MM-DD; defaults to the latest reading's date */
  today?: string;
}

const dayNum = (d: string) => Math.round(Date.parse(d.slice(0, 10) + "T12:00:00Z") / 86400000);

/** Smoothed bodyweight trend with weekly rate, 4-week change and phase. Accepts merged days or raw weigh-ins. */
export function bodyweightTrend(input: (DailyWeight | WeighIn)[], opts: TrendOpts = {}): BodyweightTrend {
  const unit = opts.unit ?? "kg", alpha = opts.alpha ?? 0.1;
  const window = opts.rateWindowDays ?? 21, maintain = opts.maintainPct ?? 0.25, stale = opts.staleDays ?? 21;
  const days = input.length && "sources" in input[0] ? (input as DailyWeight[]) : mergeWeighIns(input as WeighIn[]);
  const points: TrendPoint[] = [];
  let prev: { day: number; trend: number } | null = null;
  for (const d of days) {
    const n = dayNum(d.date);
    let t: number;
    if (!prev) t = d.kg;
    else {
      const gap = Math.max(1, n - prev.day);
      const a = 1 - Math.pow(1 - alpha, gap);
      t = prev.trend + a * (d.kg - prev.trend);
    }
    prev = { day: n, trend: t };
    points.push({ date: d.date, raw: fromKg(d.kg, unit), trend: fromKg(t, unit) });
  }
  const latest = points[points.length - 1] ?? null;
  let weeklyRate: number | null = null, weeklyRatePct: number | null = null, change4w: number | null = null, phase: Phase | null = null;
  if (latest) {
    const end = dayNum(latest.date);
    const win = points.filter((p) => dayNum(p.date) >= end - window);
    if (win.length >= 2 && end - dayNum(win[0].date) >= 7) {
      weeklyRate = slope(win.map((p) => dayNum(p.date)), win.map((p) => p.trend)) * 7;
      weeklyRatePct = (weeklyRate / latest.trend) * 100;
    }
    const back = trendAt({ points }, addDays(latest.date, -28), 7);
    if (back != null && dayNum(points[0].date) <= end - 21) change4w = latest.trend - back;
    const today = opts.today ?? latest.date;
    if (weeklyRatePct != null && dayNum(today) - end <= stale)
      phase = weeklyRatePct < -maintain ? "cutting" : weeklyRatePct > maintain ? "bulking" : "maintaining";
  }
  return { unit, alpha, points, latest, weeklyRate, weeklyRatePct, change4w, phase };
}

function slope(x: number[], y: number[]): number {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  return sxx ? sxy / sxx : 0;
}

/**
 * Trend weight on a date (trend unit): linear between readings, carried flat up to `maxGapDays` past the
 * last reading or before the first. Null when the nearest reading is farther away than that.
 */
export function trendAt(trend: Pick<BodyweightTrend, "points">, date: string, maxGapDays = 30): number | null {
  const ps = trend.points;
  if (!ps.length) return null;
  const n = dayNum(date);
  let lo = 0, hi = ps.length - 1;
  if (n <= dayNum(ps[0].date)) return dayNum(ps[0].date) - n <= maxGapDays ? ps[0].trend : null;
  if (n >= dayNum(ps[hi].date)) return n - dayNum(ps[hi].date) <= maxGapDays ? ps[hi].trend : null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dayNum(ps[mid].date) <= n) lo = mid; else hi = mid;
  }
  const a = ps[lo], b = ps[hi], da = dayNum(a.date), db = dayNum(b.date);
  if (Math.min(n - da, db - n) > maxGapDays) return null;
  return a.trend + ((b.trend - a.trend) * (n - da)) / (db - da);
}

export interface RelativeStrengthPoint {
  date: string;
  workoutId: string;
  e1rm: number;
  bodyweight: number;
  /** e1RM ÷ trend bodyweight */
  ratio: number;
}

/**
 * Relative strength over time: each session's e1RM divided by the trend bodyweight that day. `liftPoints`
 * must be in the trend's unit (liftHistory(..., trend.unit, ...)); sessions with no bodyweight within
 * `maxGapDays` are skipped.
 */
export function strengthVsBodyweight(trend: BodyweightTrend, liftPoints: LiftPoint[], maxGapDays = 30): RelativeStrengthPoint[] {
  const out: RelativeStrengthPoint[] = [];
  for (const p of liftPoints) {
    if (!(p.e1rm > 0)) continue;
    const bw = trendAt(trend, p.date, maxGapDays);
    if (bw == null || bw <= 0) continue;
    out.push({ date: p.date, workoutId: p.workoutId, e1rm: p.e1rm, bodyweight: bw, ratio: p.e1rm / bw });
  }
  return out;
}
