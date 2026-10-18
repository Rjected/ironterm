// Strength balance: ratios between your current best e1RMs and commonly cited reference ratios.
//
// "Current best" = best Epley e1RM from sets of ≤10 reps over the last `months` (12). Ratios with a
// lift you haven't done in that window are skipped. Lifts trained more than `staleDays` apart are
// still compared but the note says so (detraining on one side skews the ratio).
//
// Reference ratios are rules of thumb, not standards: limb lengths, style (sumo/conventional, grip
// width) and training emphasis shift them a lot. A ratio is "low"/"high" only outside its typical
// range; inside it, it's "balanced".
//
// Sources
//   SBS     Nuckols G., Stronger By Science articles on lift ratios, which analyse raw meet
//           results (OpenPowerlifting): raw deadlift ≈ 1.1–1.3× squat, bench ≈ 0.65–0.8× squat.
//   OPL     OpenPowerlifting public meet database (openpowerlifting.org), raw (unequipped) totals.
//   RIP     Rippetoe M. "Starting Strength", 3rd ed., 2011: press ≈ 0.6–0.65× bench in novices.
//   CRESSEY Front squat ≈ 85% of back squat, the ratio commonly attributed to Eric Cressey
//           (cresseysportsperformance.com strength-ratio writing).
//   PL      Powerlifting coaching convention (e.g. RTS / Tuchscherer, Juggernaut): competition-paused
//           bench ≈ 95% of touch-and-go; paused squat ≈ 85–90% of a normal squat.
//   COACH   General coaching heuristics (e.g. Israetel/Hoffmann, Renaissance Periodization;
//           strengthlevel.com population ratios). Least certain; wide individual spread.

import type { HevyWorkout } from "./hevy";
import { LIFTS } from "./lifts";
import { addDays, epley, liftHistory } from "./stats";
import type { Unit } from "./units";

export interface RatioDef {
  id: string;
  label: string;
  /** numerator candidates, first one with data wins */
  num: string[];
  /** denominator candidates */
  den: string[];
  ref: number;
  lo: number;
  hi: number;
  source: string;
  /** how to read a low ratio */
  lowMeans: string;
  /** how to read a high ratio */
  highMeans: string;
}

const D = (id: string, label: string, num: string[], den: string[], ref: number, lo: number, hi: number, source: string, lowMeans: string, highMeans: string): RatioDef =>
  ({ id, label, num, den, ref, lo, hi, source, lowMeans, highMeans });

export const RATIO_DEFS: RatioDef[] = [
  D("dl/squat", "Deadlift / Squat", ["deadlift", "sumoDeadlift"], ["squat"], 1.2, 1.1, 1.3, "SBS, OPL",
    "deadlift is lagging the squat — usually a pulling-strength or lockout/back issue; more pulling volume or variations (deficits, RDLs) help",
    "squat is lagging the deadlift — common with long arms or a hip-dominant build; more squat frequency or paused/front squats help"),
  D("bench/squat", "Bench / Squat", ["bench"], ["squat"], 0.75, 0.65, 0.85, "SBS, OPL",
    "bench is lagging the squat — more pressing volume/frequency (bench responds well to 2–3×/week)",
    "squat is lagging the bench — lower body is behind; prioritise squat volume"),
  D("ohp/bench", "OHP / Bench", ["ohp"], ["bench"], 0.63, 0.55, 0.7, "RIP, COACH",
    "overhead press is lagging the bench — shoulders/triceps lockout overhead; press more often",
    "bench is lagging the press — unusual; check bench technique (arch, leg drive) or bench frequency"),
  D("front/back", "Front Squat / Back Squat", ["frontSquat"], ["squat"], 0.83, 0.78, 0.88, "CRESSEY",
    "front squat is lagging — upper-back/quad strength or rack mobility; the back squat may lean on hips",
    "back squat is lagging the front squat — back-squat technique or hip/posterior-chain strength"),
  D("pause/tng bench", "Paused / Touch-and-go Bench", ["pauseBench"], ["bench"], 0.95, 0.92, 0.98, "PL",
    "you rely on the bounce — weak off the chest; more paused work",
    "paused is unusually close to touch-and-go — your TnG may be under-tested"),
  D("pause/normal squat", "Pause Squat / Squat", ["pauseSquat"], ["squat"], 0.88, 0.82, 0.92, "PL",
    "weak out of the hole — you rely on the stretch reflex; more paused squats",
    "pause squat close to your squat — your normal squat may be under-tested"),
  D("row/bench", "Barbell Row / Bench", ["row", "pendlayRow"], ["bench"], 0.85, 0.75, 1.0, "COACH",
    "upper back is lagging the press — add rowing volume for shoulder health and a stable bench",
    "row is strong relative to bench — bench has room to grow (or the row is loose/cheated)"),
  D("incline/bench", "Incline / Flat Bench", ["inclineBench"], ["bench"], 0.8, 0.72, 0.88, "COACH",
    "upper chest/shoulders are lagging the flat bench",
    "flat bench is lagging the incline — check flat-bench setup (arch, leg drive)"),
  D("cg/bench", "Close-Grip / Bench", ["cgBench"], ["bench"], 0.9, 0.85, 0.95, "COACH",
    "triceps are the weak link — lockout strength",
    "close-grip close to (or above) bench — your regular grip may be too wide for you"),
  D("sumo/conv", "Sumo / Conventional Deadlift", ["sumoDeadlift"], ["deadlift"], 1.0, 0.9, 1.1, "COACH",
    "conventional suits you better",
    "sumo suits you better — consider pulling sumo for max attempts"),
];

/** Reference squat-normalised profile: squat 1, bench 0.75, deadlift 1.2, OHP 0.75·0.63. */
export const REFERENCE_PROFILE = { squat: 1, bench: 0.75, deadlift: 1.2, ohp: 0.75 * 0.63 };

export interface LiftBest {
  lift: string;
  e1rm: number;
  weight: number;
  reps: number;
  date: string;
}

export interface RatioResult {
  id: string;
  label: string;
  num: LiftBest;
  den: LiftBest;
  ratio: number;
  ref: number;
  lo: number;
  hi: number;
  /** (ratio − ref) / ref */
  deviation: number;
  status: "low" | "balanced" | "high";
  /** lift that looks behind, if outside the range */
  lagging: string | null;
  /** best dates more than staleDays apart */
  stale: boolean;
  source: string;
  note: string;
}

export interface StrengthBalance {
  bests: Record<string, LiftBest>;
  ratios: RatioResult[];
  /** squat-normalised big four (null if no squat) */
  profile: { squat: number; bench: number | null; deadlift: number | null; ohp: number | null } | null;
  reference: typeof REFERENCE_PROFILE;
  /** most out-of-range ratio (largest |deviation| outside range) */
  weakest: RatioResult | null;
  /** lift keys flagged as lagging, most-flagged first */
  lagging: string[];
  summary: string;
}

export interface RatioOptions {
  today: string;
  tz?: string;
  map?: Record<string, string>;
  /** look-back window. Default 12. */
  months?: number;
  maxReps?: number;
  /** default 180 */
  staleDays?: number;
  defs?: RatioDef[];
}

const dayNum = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 86400000);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const nm = (k: string) => LIFTS[k]?.name ?? k;

/** Best e1RM per lift since `since` (Epley, sets ≤ maxReps). */
export function currentBests(workouts: HevyWorkout[], lifts: string[], unit: Unit, since: string, opts: { tz?: string; map?: Record<string, string>; maxReps?: number } = {}): Record<string, LiftBest> {
  const out: Record<string, LiftBest> = {};
  const maxR = opts.maxReps ?? 10;
  for (const lift of lifts) {
    let b: LiftBest | null = null;
    for (const p of liftHistory(workouts, lift, unit, opts.tz ?? "UTC", opts.map)) {
      if (p.date < since) continue;
      for (const s of p.sets) {
        if (s.reps > maxR || s.weight <= 0) continue;
        const e = epley(s.weight, s.reps);
        if (!b || e > b.e1rm) b = { lift, e1rm: e, weight: s.weight, reps: s.reps, date: p.date };
      }
    }
    if (b) out[lift] = b;
  }
  return out;
}

/** Strength-balance report from the last 12 months. Weights in `unit` (ratios are unitless). */
export function strengthBalance(workouts: HevyWorkout[], unit: Unit, opts: RatioOptions): StrengthBalance {
  const defs = opts.defs ?? RATIO_DEFS;
  const staleDays = opts.staleDays ?? 180;
  const since = addDays(opts.today, -Math.round((opts.months ?? 12) * 30.44));
  const lifts = [...new Set(["squat", "bench", "deadlift", "ohp", ...defs.flatMap((d) => [...d.num, ...d.den])])];
  const bests = currentBests(workouts, lifts, unit, since, opts);
  const ratios: RatioResult[] = [];
  for (const d of defs) {
    const n = d.num.map((k) => bests[k]).find(Boolean);
    const m = d.den.map((k) => bests[k]).find(Boolean);
    if (!n || !m || n.lift === m.lift) continue;
    const ratio = n.e1rm / m.e1rm;
    const deviation = (ratio - d.ref) / d.ref;
    const status = ratio < d.lo ? "low" : ratio > d.hi ? "high" : "balanced";
    const lagging = status === "low" ? n.lift : status === "high" ? m.lift : null;
    const stale = Math.abs(dayNum(n.date) - dayNum(m.date)) > staleDays;
    const range = `typical ${d.lo.toFixed(2)}–${d.hi.toFixed(2)}`;
    let note = status === "balanced"
      ? `${nm(n.lift)} is ${pct(ratio)} of your ${nm(m.lift)} (${range}) — balanced.`
      : `${nm(n.lift)} is ${pct(ratio)} of your ${nm(m.lift)} (${range}): ${status === "low" ? d.lowMeans : d.highMeans}.`;
    if (stale) note += ` (Bests are ${Math.round(Math.abs(dayNum(n.date) - dayNum(m.date)) / 30)} months apart, so detraining may skew this.)`;
    ratios.push({ id: d.id, label: d.label, num: n, den: m, ratio, ref: d.ref, lo: d.lo, hi: d.hi, deviation, status, lagging, stale, source: d.source, note });
  }
  const sq = bests.squat?.e1rm;
  const profile = sq ? { squat: 1, bench: bests.bench ? bests.bench.e1rm / sq : null, deadlift: bests.deadlift ? bests.deadlift.e1rm / sq : null, ohp: bests.ohp ? bests.ohp.e1rm / sq : null } : null;
  const off = ratios.filter((r) => r.status !== "balanced");
  // distance outside the range relative to ref, so a wide range isn't penalised
  const outside = (r: RatioResult) => (r.ratio < r.lo ? (r.lo - r.ratio) : (r.ratio - r.hi)) / r.ref;
  const weakest = off.length ? off.reduce((a, b) => (outside(b) > outside(a) ? b : a)) : null;
  const counts = new Map<string, number>();
  for (const r of off) if (r.lagging) counts.set(r.lagging, (counts.get(r.lagging) ?? 0) + 1);
  const lagging = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const summary = !ratios.length
    ? "Not enough lifts in the last 12 months to compare."
    : !weakest
      ? `All ${ratios.length} ratios are within typical ranges.`
      : `${off.length} of ${ratios.length} ratios outside typical ranges. Biggest gap: ${weakest.note}`;
  return { bests, ratios, profile, reference: REFERENCE_PROFILE, weakest, lagging, summary };
}
