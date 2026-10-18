// e1RM projection.
//
// Series: per session, the rolling best Epley e1RM (sets of ≤ maxReps) over `windowDays` up to that
// session, restricted to the current training block: everything after the last gap of more than
// `gapDays` between sessions (a layoff resets the trend; pre-layoff numbers would drag the slope).
// The fit also only looks back `fitWeeks` within the block so it tracks the *recent* trend.
//
// Models
//   linear  y = a + b·x                    Theil–Sen slope (median pairwise slope), a = median(y − b·x)
//   log     y = a + b·ln(1 + x/τ)          the same robust fit on transformed time; gains slow down
//                                          over the block (diminishing returns). τ = `tauDays`.
// x is days since the start of the fit window.
//
// Band: residual bootstrap. Resample the fit residuals with replacement, add them to the fitted
// values, refit, and for each future date add one more resampled residual (prediction, not just
// the mean). `level` (0.8) central quantiles of those draws. The rolling-best series is
// autocorrelated, so the band is optimistic; treat it as "if the recent trend holds".
//
// whenReach(target): expected date where the fit crosses target, with an 80% range from the
// bootstrap fits. null when the trend is flat/negative (less than `flatPctPerMonth`), the block is
// inactive or too short, or the expected date is more than `maxYears` away.

import { addDays, epley, type LiftPoint } from "./stats";
import { theilSen } from "./stall";

export type ProjectionModel = "linear" | "log";
export type ProjectionStatus = "ok" | "flat" | "insufficient" | "inactive";

export interface ProjectionOptions {
  /** weeks to project forward from today. Default 12. */
  weeks?: number;
  /** rolling-best window, days. Default 28. */
  windowDays?: number;
  /** a gap longer than this between sessions starts a new block. Default 28. */
  gapDays?: number;
  /** only fit the last N weeks of the block. Default 26. */
  fitWeeks?: number;
  model?: ProjectionModel;
  /** log model time constant, days. Default 28. */
  tauDays?: number;
  /** central coverage of the band and whenReach range. Default 0.8. */
  level?: number;
  /** bootstrap iterations. Default 400. */
  iterations?: number;
  /** PRNG seed for reproducible bands. Default 1. */
  seed?: number;
  maxReps?: number;
  /** sessions needed in the fit window. Default 6. */
  minSessions?: number;
  /** fit window must span at least this many days. Default 21. */
  minSpanDays?: number;
  /** slower than this %/month (of current) counts as flat. Default 0.25. */
  flatPctPerMonth?: number;
  /** whenReach gives up beyond this. Default 3. */
  maxYears?: number;
}

export interface ProjectionPoint {
  date: string;
  /** that session's best e1RM (≤ maxReps) */
  e1rm: number;
  /** rolling best e1RM, the fitted series */
  best: number;
  /** used in the fit (inside the fit window) */
  inFit: boolean;
}

export interface ReachEstimate {
  target: number;
  /** expected date; today if already at/above target */
  date: string;
  /** level-range (default 80%) of dates; `late` null = beyond maxYears in too many bootstrap draws */
  early: string;
  late: string | null;
  days: number;
}

export interface Projection {
  status: ProjectionStatus;
  model: ProjectionModel;
  note: string;
  /** first session of the current block / of the fit window */
  blockStart: string | null;
  fitStart: string | null;
  points: ProjectionPoint[];
  /** fitted line from fitStart through the projection horizon, weekly + endpoints */
  fit: { date: string; value: number }[];
  /** prediction band from today forward, weekly */
  band: { date: string; lo: number; mid: number; hi: number }[];
  /** fitted value today, and at the horizon */
  current: number | null;
  projected: number | null;
  /** trend at today, per week and as %/month of current */
  slopePerWeek: number | null;
  pctPerMonth: number | null;
  whenReach: (target: number) => ReachEstimate | null;
}

const DEFAULTS = {
  weeks: 12, windowDays: 28, gapDays: 28, fitWeeks: 26, model: "linear" as ProjectionModel, tauDays: 28, level: 0.8, iterations: 400, seed: 1,
  maxReps: 10, minSessions: 6, minSpanDays: 21, flatPctPerMonth: 0.25, maxYears: 3,
};

const dayNum = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 86400000);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (sorted: number[], p: number) => {
  if (!sorted.length) return NaN;
  const r = p * (sorted.length - 1);
  const lo = Math.floor(r), hi = Math.ceil(r);
  return sorted[lo] * (1 - (r - lo)) + sorted[hi] * (r - lo);
};
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Line { a: number; b: number }

/** Project the rolling-best e1RM of one lift. `points` from liftHistory, any unit. */
export function projectLift(points: LiftPoint[], today: string, opts: ProjectionOptions = {}): Projection {
  const o = { ...DEFAULTS, ...opts };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date)).filter((p) => p.date <= today);
  const sess = sorted
    .map((p) => ({ date: p.date, e1rm: Math.max(0, ...p.sets.filter((s) => s.reps > 0 && s.reps <= o.maxReps).map((s) => epley(s.weight, s.reps))) }))
    .filter((p) => p.e1rm > 0);

  const empty = (status: ProjectionStatus, note: string, extra: Partial<Projection> = {}): Projection => ({
    status, model: o.model, note, blockStart: null, fitStart: null, points: [], fit: [], band: [], current: null, projected: null,
    slopePerWeek: null, pctPerMonth: null, whenReach: () => null, ...extra,
  });
  if (!sess.length) return empty("insufficient", "No sessions with sets of ≤" + o.maxReps + " reps.");

  // current block
  let start = 0;
  for (let i = sess.length - 1; i > 0; i--) if (dayNum(sess[i].date) - dayNum(sess[i - 1].date) > o.gapDays) { start = i; break; }
  const block = sess.slice(start);
  const pts: ProjectionPoint[] = block.map((p, i) => {
    let best = 0;
    const from = addDays(p.date, -o.windowDays + 1);
    for (let j = i; j >= 0 && block[j].date >= from; j--) best = Math.max(best, block[j].e1rm);
    return { date: p.date, e1rm: p.e1rm, best, inFit: false };
  });
  const blockStart = block[0].date;
  const last = block[block.length - 1].date;
  const idle = dayNum(today) - dayNum(last);
  if (idle > o.gapDays)
    return empty("inactive", `No session in ${idle} days; the last block ended ${last}. Projection resumes once you're training again.`, { blockStart, points: pts });

  const fitFrom = addDays(today, -o.fitWeeks * 7);
  for (const p of pts) p.inFit = p.date >= fitFrom;
  const fp = pts.filter((p) => p.inFit);
  const fitStart = fp[0]?.date ?? null;
  const span = fp.length ? dayNum(fp[fp.length - 1].date) - dayNum(fp[0].date) : 0;
  if (fp.length < o.minSessions || span < o.minSpanDays)
    return empty("insufficient", `Only ${fp.length} session${fp.length === 1 ? "" : "s"} over ${span} days in the current block (since ${blockStart}); need ${o.minSessions} over ${o.minSpanDays}+ days.`, { blockStart, fitStart, points: pts });

  const x0 = dayNum(fitStart!);
  const tx = (d: number) => (o.model === "log" ? Math.log(1 + Math.max(0, d) / o.tauDays) : d);
  const xs = fp.map((p) => tx(dayNum(p.date) - x0));
  const ys = fp.map((p) => p.best);
  const fitLine = (yy: number[]): Line => {
    const b = theilSen(xs, yy) ?? 0;
    return { b, a: median(yy.map((y, i) => y - b * xs[i])) };
  };
  const at = (l: Line, date: string) => l.a + l.b * tx(dayNum(date) - x0);
  const main = fitLine(ys);
  const resid = ys.map((y, i) => y - (main.a + main.b * xs[i]));

  // bootstrap
  const rnd = mulberry32(o.seed);
  const pick = () => resid[Math.floor(rnd() * resid.length)];
  const boots: Line[] = [];
  for (let k = 0; k < o.iterations; k++) boots.push(fitLine(ys.map((_, i) => main.a + main.b * xs[i] + pick())));

  const horizon = addDays(today, o.weeks * 7);
  const futureDates: string[] = [];
  for (let d = today; d < horizon; d = addDays(d, 7)) futureDates.push(d);
  futureDates.push(horizon);
  const lo = (1 - o.level) / 2, hi = 1 - lo;
  const band = futureDates.map((date) => {
    const draws = boots.map((l) => at(l, date) + pick()).sort((a, b) => a - b);
    return { date, lo: quantile(draws, lo), mid: at(main, date), hi: quantile(draws, hi) };
  });
  const fit: { date: string; value: number }[] = [];
  for (let d = fitStart!; d < horizon; d = addDays(d, 7)) fit.push({ date: d, value: at(main, d) });
  if (!fit.some((f) => f.date === today)) fit.push({ date: today, value: at(main, today) });
  fit.push({ date: horizon, value: at(main, horizon) });
  fit.sort((a, b) => a.date.localeCompare(b.date));

  const current = at(main, today);
  const slopePerWeek = at(main, addDays(today, 7)) - current;
  const pctPerMonth = current > 0 ? ((at(main, addDays(today, 30)) - current) / current) * 100 : 0;
  const flat = pctPerMonth < o.flatPctPerMonth;

  const reachDays = (l: Line, target: number): number | null => {
    if (l.b <= 0) return null;
    const t = (target - l.a) / l.b;
    const d = o.model === "log" ? o.tauDays * (Math.exp(Math.min(t, 50)) - 1) : t;
    const fromToday = d - (dayNum(today) - x0);
    return Number.isFinite(fromToday) ? Math.max(0, fromToday) : null;
  };
  const maxDays = o.maxYears * 365;
  const whenReach = (target: number): ReachEstimate | null => {
    if (current >= target) return { target, date: today, early: today, late: today, days: 0 };
    if (flat) return null;
    const d = reachDays(main, target);
    if (d == null || d > maxDays) return null;
    const ds = boots.map((l) => reachDays(l, target)).map((v) => (v == null || v > maxDays ? Infinity : v)).sort((a, b) => a - b);
    const e = quantile(ds, lo), l = quantile(ds, hi);
    const r = (n: number) => Math.round(n);
    return { target, date: addDays(today, r(d)), early: addDays(today, r(Number.isFinite(e) ? e : d)), late: Number.isFinite(l) ? addDays(today, r(l)) : null, days: r(d) };
  };

  const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
  const note = flat
    ? `Flat: rolling best ${pctPerMonth >= 0 ? "+" : ""}${f1(pctPerMonth)}%/month over ${fp.length} sessions since ${fitStart}. No target date until it moves.`
    : `Trending ${f1(slopePerWeek)}/week (+${f1(pctPerMonth)}%/month) since ${fitStart}${start > 0 ? ` (block began ${blockStart} after a layoff)` : ""}; ${o.weeks} weeks out ≈ ${f1(at(main, horizon))} (${Math.round(o.level * 100)}%: ${f1(band[band.length - 1].lo)}–${f1(band[band.length - 1].hi)}).`;

  return { status: flat ? "flat" : "ok", model: o.model, note, blockStart, fitStart, points: pts, fit, band, current, projected: at(main, horizon), slopePerWeek, pctPerMonth, whenReach };
}
