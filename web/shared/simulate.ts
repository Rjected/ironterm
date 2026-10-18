// "What if I ran program X for N weeks?" — a Monte Carlo simulator on top of the real engine.
//
// Nothing here re-implements progression. Each simulated session asks the engine for the plan
// (planDay), has a model lifter "perform" it as a synthetic HevyWorkout, and feeds that back
// through applyWorkout, exactly like a real logged workout (same idea as demo.ts). So stage-downs,
// resets, retests and TM moves are the program's own rules reacting to the model's performance.
//
// ── Starting values (startingConfig) ─────────────────────────────────────────────────────────
// Also the "switch programs and carry your maxes over" feature. Every number comes from a current
// e1RM per lift (estimateE1rm fills lifts you didn't give from STRENGTH_RATIOS).
//   nRM(lift)  = e1RM × RTS %1RM at n reps @10 (rpe.ts standardPct; 5RM ≈ 86%, 10RM ≈ 74%).
//   Percent slots → training max per lift, by the program's maxLabel:
//     "…90%…"                         → 90% of e1RM (Juggernaut)
//     "T1 = aRM, T2 = bRM"            → aRM for lifts whose first slot is T1/MAIN, else bRM (Rippler)
//     "a–bRM"                         → the ((a+b)/2)RM (GZCL Method 2.5RM, PHAT 4RM)
//     "nRM" / "n-rep"                 → nRM (Madcow, Texas, Bill Starr 5RM; UHF 2RM; Ivysaur 4RM)
//     "Working weight" (no number)    → (reps + 2)RM of that slot's first set (VDIP: reps with 2 in the tank)
//     "Training max" / "TM" / none    → 90% of e1RM (5/3/1 family, nSuns; unlabeled = 5/3/1 convention)
//     "1RM" / "Max"                   → 100% of e1RM ("Goal 1RM" → 105%: a modest goal)
//     Bodyweight lifts (dips, chins) keep the template's default TM (added load isn't modelled).
//   Stage slots (linear progression) → start weight:
//     retest rule (GZCLP T1)          → its retest % of its retest RM (GZCLP: 85% of 5RM ≈ 73% e1RM)
//     otherwise                       → 85% of the first stage's RM (GZCLP T2 3×10 ≈ 64% e1RM,
//                                        StrongLifts 5×5 ≈ 73%, T3 3×15+ ≈ 57% of that accessory)
//   Double progression (3×8–12)       → (low end + 2)RM: the bottom of the range with ~2 in reserve
//   Fixed slots                       → (reps + 2)RM
//   Accessories/variations: e1RM = ratio × a main lift's e1RM (STRENGTH_RATIOS; dumbbells are per
//   hand, as Hevy logs them), or a fallback by equipment and upper/lower body.
//   Increments come from the template's defaults.
//
// ── Lifter model (simulate) ─────────────────────────────────────────────────────────────────
// Latent strength: one true e1RM per main lift (squat, bench, deadlift, OHP). Every other lift's
// true e1RM is its STRENGTH_RATIOS ratio × that base (so accessories ride along).
//   Level t = e1RM / (ELITE_RATIO × bodyweight)  (bodyweight default 180 lb / 82 kg; elite ≈
//     squat 2.5×, bench 1.9×, deadlift 3.0×, OHP 1.25× bw). Diminishing returns live here: as e1RM
//     rises, t rises and the rate falls.
//   Base weekly gain g(t) = 3% × exp(−(t − 0.25) / 0.14), capped at 6%/wk
//     (t 0.25 novice ≈ 3%/wk, 0.5 intermediate ≈ 0.5%/wk, 0.8 advanced ≈ 0.06%/wk).
//   Program dose per base lift per week, from the sets actually done:
//     effective set v = min(1, (reps / max reps possible) / 0.6) × transfer
//       (transfer 1 for the lift itself, ~0.6 barbell variations, ~0.3 machine/DB compounds,
//        0 unrelated accessories)
//     D = Σv, H = Σv over sets ≥ 85% of that day's e1RM
//     dose factor f = [D/(D+5)] / [8/(8+5)] (8 effective sets/week = 1.0, saturating, cap 1.4)
//     intensity factor i = 0.75 + 0.25 × min(1, H/2)   (≥2 heavy sets/week for full 1RM transfer)
//   Weekly update: e1RM ×= 1 + g(t) × f × i × responder × (1 + 0.4·N(0,1)) × growthScale,
//     floored at −0.3%/wk. responder ~ lognormal(0, 0.3) per lift per run (individual response).
//   No accumulated fatigue across sessions, no detraining, perfect adherence (every planned
//     session done, in order, sessionsPerWeek per calendar week).
// Session performance:
//   Day e1RM = true × exp(N(0, 0.025)) shared by the session × exp(N(0, 0.02)) per base lift.
//   Max reps at a load = maxReps(): RTS %1RM table (rpe.ts) at RPE 10 averaged with Epley, on the day e1RM reduced
//     by fatigue. Each set adds fatigue 2.5% × (reps / (max reps + 1))² to its lift (easy sets ≈ free,
//     sets near failure ≈ 2%), and half of that
//     to later work on the same base lift (squat → front squat).
//   Straight sets: min(target, floor(max reps)). AMRAP: floor(max reps − 0.3·|N(0,1)|);
//     AMRAP with an RPE (SBS RIR): stop at that RIR. Double-progression sets aim for the top.
//   RPE-only sets: load = day e1RM (with ±2% self-assessment error) × RTS %1RM(reps, RPE), rounded
//     down. "% of today's top set" sets use the top set's e1RM by the RTS chart (RPE read as 10 − reps
//     left). Retests: one set
//     at the estimated RM.
//   Linear-progression (stage) slots: a missed set is logged one rep short and the lifter stops
//     after a second miss once a set has been made — how the engine recognizes a failed attempt.
//   Bodyweight lifts always hit their reps (AMRAP: +2); they don't feed the model.
//
// Outcomes counted per lift (mean per run): stalls = fail / stage-down / tm-down; resets = reset /
// deload / retest-next.

import type { HevyExercise, HevySet, HevyWorkout } from "./hevy";
import { BIG_FOUR, LIFTS } from "./lifts";
import { allSlots, applyWorkout, initialState, planDay, type Outcome, type PlannedExercise, type ProgramConfig, type ProgramDef, type ProgramState, type SlotDef } from "./program";
import { buildProgram, defaultConfig, getTemplate } from "./programs";
import { standardPct } from "./rpe";
import { loadStep, roundTo, toKg, type Unit } from "./units";
import { similarLifts } from "./swaps";

// ───────────────────────── types ─────────────────────────

export type MainLift = (typeof BIG_FOUR)[number];

export interface Band {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export interface SimOptions {
  /** Monte Carlo runs (default 200; 100 for programs with > 30 exercises a week). */
  runs?: number;
  /** RNG seed (default 1). Same seed → same result. */
  seed?: number;
  /** Bodyweight in `unit`, for the level estimate. Default 180 lb / 82 kg. */
  bodyweight?: number;
  /** ISO date of the first session (default 2026-01-05). */
  startDate?: string;
  /** Multiplies every weekly gain (1 = model; 0 = a lifter who has plateaued). */
  growthScale?: number;
  /** Use this config instead of startingConfig (e.g. your real one). */
  config?: ProgramConfig;
}

export interface LiftProjection {
  /** true e1RM at week 0 */
  start: number;
  /** index w = true e1RM after w weeks (0…weeks) */
  trajectory: Band[];
  /** e1RM change after `weeks` */
  gain: Band;
  /** level used for the rate: e1RM / (elite ratio × bodyweight), at the start */
  level: number;
  /** model's base weekly gain at the start, before program dose (fraction) */
  baseWeeklyRate: number;
  /** mean per run: fail / stage-down / tm-down */
  stalls: number;
  /** mean per run: reset / deload / retest-next */
  resets: number;
  /** mean per run, by engine outcome */
  outcomes: Partial<Record<Outcome, number>>;
  /** sessions per week this exact lift is trained */
  sessionsPerWeek: number;
  /** effective (transfer-weighted) sets per week feeding this lift */
  effectiveSetsPerWeek: number;
}

export interface SimResult {
  templateId: string;
  name: string;
  unit: Unit;
  weeks: number;
  runs: number;
  sessionsPerWeek: number;
  /** finite programs: median week the program ended (null if it ran past `weeks` in most runs) */
  completedWeek: number | null;
  bodyweight: number;
  /** the starting config the simulation ran */
  config: ProgramConfig;
  lifts: Record<MainLift, LiftProjection>;
  /** projected program state after `weeks` (medians across runs) */
  endState: {
    trainingMaxes: Record<string, Band>;
    slots: Record<string, { lift: string; weight: Band; stage: number }>;
  };
}

export interface CompareRow {
  templateId: string;
  name: string;
  sessionsPerWeek: number;
  completedWeek: number | null;
  lifts: Record<MainLift, { start: number; end: Band; gain: Band; stalls: number; resets: number }>;
  /** median big-four total gain */
  totalGain: number;
}

// ───────────────────────── strength ratios ─────────────────────────

/** lift → [base main lift, e1RM ratio to the base, stimulus transfer to the base]. Ratios are rough population figures. */
export const STRENGTH_RATIOS: Record<string, [MainLift, number, number]> = {
  squat: ["squat", 1, 1], bench: ["bench", 1, 1], deadlift: ["deadlift", 1, 1], ohp: ["ohp", 1, 1],
  // squat family
  pauseSquat: ["squat", 0.85, 0.7], frontSquat: ["squat", 0.8, 0.6], boxSquat: ["squat", 0.9, 0.7], pinSquat: ["squat", 0.8, 0.6],
  zercherSquat: ["squat", 0.75, 0.5], safetyBarSquat: ["squat", 0.9, 0.7], hackSquat: ["squat", 1.0, 0.3], legPress: ["squat", 1.8, 0.3],
  gobletSquat: ["squat", 0.3, 0.1], bulgarianSplitSquat: ["squat", 0.2, 0.2], splitSquat: ["squat", 0.25, 0.2], lunge: ["squat", 0.25, 0.2],
  legExtension: ["squat", 0.5, 0], pendulumSquat: ["squat", 1.0, 0.3], beltSquat: ["squat", 1.0, 0.3], calfRaise: ["squat", 1.0, 0], seatedCalfRaise: ["squat", 0.6, 0],
  cableCrunch: ["squat", 0.3, 0],
  // deadlift family
  sumoDeadlift: ["deadlift", 0.95, 0.7], deficitDeadlift: ["deadlift", 0.88, 0.7], pauseDeadlift: ["deadlift", 0.8, 0.7], snatchGripDeadlift: ["deadlift", 0.8, 0.6],
  rackPull: ["deadlift", 1.1, 0.5], rdl: ["deadlift", 0.7, 0.5], dbRdl: ["deadlift", 0.3, 0.2], stiffLegDeadlift: ["deadlift", 0.7, 0.5],
  trapBarDeadlift: ["deadlift", 1.05, 0.6], goodMorning: ["deadlift", 0.45, 0.4], hipThrust: ["deadlift", 1.0, 0.2], legCurl: ["deadlift", 0.3, 0],
  reverseHyper: ["deadlift", 0.3, 0], kbSwing: ["deadlift", 0.2, 0], powerClean: ["deadlift", 0.5, 0.2], shrug: ["deadlift", 0.9, 0], farmersWalk: ["deadlift", 0.35, 0],
  // bench family
  pauseBench: ["bench", 0.95, 0.8], cgBench: ["bench", 0.9, 0.6], wideBench: ["bench", 0.97, 0.7], inclineBench: ["bench", 0.8, 0.5],
  declineBench: ["bench", 1.05, 0.5], feetUpBench: ["bench", 0.92, 0.7], floorPress: ["bench", 0.9, 0.5], spotoPress: ["bench", 0.9, 0.7],
  boardPress: ["bench", 1.08, 0.5], slingshotBench: ["bench", 1.15, 0.4], pinPress: ["bench", 0.9, 0.5], smithBench: ["bench", 1.0, 0.4],
  dbBench: ["bench", 0.4, 0.3], dbInclineBench: ["bench", 0.35, 0.25], dbDeclineBench: ["bench", 0.4, 0.25], machineChestPress: ["bench", 0.9, 0.3],
  chestFly: ["bench", 0.15, 0], inclineFly: ["bench", 0.13, 0], skullcrusher: ["bench", 0.4, 0.1], jmPress: ["bench", 0.6, 0.2],
  tricepPushdown: ["bench", 0.3, 0], overheadTricep: ["bench", 0.25, 0], tricepKickback: ["bench", 0.1, 0],
  // pulls (sized off bench, no transfer)
  row: ["bench", 0.75, 0], pendlayRow: ["bench", 0.7, 0], sealRow: ["bench", 0.6, 0], tBarRow: ["bench", 0.8, 0], dbRow: ["bench", 0.35, 0],
  chestSupportedRow: ["bench", 0.3, 0], cableRow: ["bench", 0.7, 0], latPulldown: ["bench", 0.7, 0], straightArmPulldown: ["bench", 0.3, 0],
  pullover: ["bench", 0.25, 0], facePull: ["bench", 0.25, 0],
  // press family / arms (sized off OHP)
  pushPress: ["ohp", 1.2, 0.5], seatedOhp: ["ohp", 0.95, 0.7], dbOhp: ["ohp", 0.38, 0.3], arnoldPress: ["ohp", 0.35, 0.25], machineShoulderPress: ["ohp", 0.9, 0.3],
  lateralRaise: ["ohp", 0.15, 0], frontRaise: ["ohp", 0.15, 0], rearDeltFly: ["ohp", 0.12, 0], uprightRow: ["ohp", 0.7, 0],
  bicepCurl: ["ohp", 0.25, 0], barbellCurl: ["ohp", 0.6, 0], hammerCurl: ["ohp", 0.27, 0], reverseCurl: ["ohp", 0.45, 0], inclineCurl: ["ohp", 0.2, 0],
  concentrationCurl: ["ohp", 0.2, 0], spiderCurl: ["ohp", 0.2, 0], preacherCurl: ["ohp", 0.5, 0], wristCurl: ["ohp", 0.5, 0],
};

/** Main-lift ratios to squat, to fill in big-four lifts you didn't give. */
const MAIN_TO_SQUAT: Record<MainLift, number> = { squat: 1, bench: 0.75, deadlift: 1.2, ohp: 0.48 };
const REFERENCE_SQUAT: Record<Unit, number> = { lb: 225, kg: 100 };

const ELITE_RATIO: Record<MainLift, number> = { squat: 2.5, bench: 1.9, deadlift: 3.0, ohp: 1.25 };
const DEFAULT_BW: Record<Unit, number> = { lb: 180, kg: 82 };

// model constants (documented at the top)
const G_REF = 0.03, T_REF = 0.25, T_SCALE = 0.14, G_CAP = 0.06;
const DOSE_K = 5, DOSE_REF = 8, DOSE_CAP = 1.4;
const HEAVY_PCT = 0.85, HEAVY_SETS = 2;
const RESPONDER_SD = 0.3, WEEK_NOISE = 0.4, GAIN_FLOOR = -0.003;
const SESSION_SD = 0.025, LIFT_SD = 0.02;
const FATIGUE_PER_SET = 0.025;
const AMRAP_SD = 0.3, RPE_ERR = 0.02;

const isBodyweight = (lift: string) => LIFTS[lift]?.kind === "bodyweight";

function ratioOf(lift: string): [MainLift, number, number] {
  const r = STRENGTH_RATIOS[lift];
  if (r) return r;
  const d = LIFTS[lift];
  if (!d) return ["squat", 0.5, 0];
  if (d.upper) return d.kind === "barbell" ? ["bench", 0.6, 0.2] : d.kind === "dumbbell" ? ["bench", 0.3, 0] : ["bench", 0.5, 0];
  return d.kind === "barbell" ? ["squat", 0.6, 0.2] : d.kind === "dumbbell" ? ["squat", 0.25, 0] : ["squat", 0.8, 0];
}

function mainE1rms(current: Record<string, number>, unit: Unit): Record<MainLift, number> {
  const given = BIG_FOUR.filter((l) => (current[l] ?? 0) > 0);
  const squatEq = given.length ? given.reduce((a, l) => a + current[l] / MAIN_TO_SQUAT[l], 0) / given.length : REFERENCE_SQUAT[unit];
  return Object.fromEntries(BIG_FOUR.map((l) => [l, (current[l] ?? 0) > 0 ? current[l] : squatEq * MAIN_TO_SQUAT[l]])) as Record<MainLift, number>;
}

/** Your e1RM for any lift: given, else ratio × a main lift. 0 for bodyweight lifts not given. */
export function estimateE1rm(lift: string, currentE1rms: Record<string, number>, unit: Unit = "lb"): number {
  if ((currentE1rms[lift] ?? 0) > 0) return currentE1rms[lift];
  if (isBodyweight(lift)) return 0;
  // a close relative you've logged beats a population ratio: scale its e1RM by how the two
  // compare (both expressed against squat), e.g. your face pulls → a rear delt fly weight
  const kin = similarLift(lift, currentE1rms);
  if (kin) return currentE1rms[kin] * squatShare(lift) / squatShare(kin);
  const [base, ratio] = ratioOf(lift);
  return mainE1rms(currentE1rms, unit)[base] * ratio;
}

/** How alike a logged lift must be to stand in for one you haven't logged. */
export const KIN_SCORE = 0.9;

/** The most alike lift (≥ KIN_SCORE) you have an e1RM for, if any. Not the big four: those are what the ratio fallback already uses. */
export function similarLift(lift: string, currentE1rms: Record<string, number>): string | null {
  for (const o of similarLifts(lift, 12)) {
    if (o.score < KIN_SCORE) break;
    if ((currentE1rms[o.lift] ?? 0) > 0 && !isBodyweight(o.lift) && !(BIG_FOUR as readonly string[]).includes(o.lift)) return o.lift;
  }
  return null;
}

/** A lift's typical e1RM as a fraction of squat. */
const squatShare = (lift: string): number => {
  if ((BIG_FOUR as readonly string[]).includes(lift)) return MAIN_TO_SQUAT[lift as MainLift];
  const [base, ratio] = ratioOf(lift);
  return ratio * MAIN_TO_SQUAT[base];
};

/** Fraction of 1RM you can lift for n reps (RTS chart at RPE 10). */
const rmFrac = (n: number) => standardPct(Math.max(1, n), 10);

// Max reps at a fraction of 1RM. RTS chart inverse (table in 0.05-rep steps, 1…40 reps), averaged
// with Epley's inverse 30·(1/frac − 1) where Epley says more: the two agree within ~a rep up to
// 8 reps, then diverge (70% → RTS 11.2, Epley 12.9; studies put it near 12). Epley also matches how
// the e1RMs you pass in were estimated.
const REP_STEP = 0.05;
const REP_TABLE = Array.from({ length: Math.round(39 / REP_STEP) + 1 }, (_, i) => standardPct(1 + i * REP_STEP, 10));
function rtsReps(frac: number): number {
  if (frac <= REP_TABLE[REP_TABLE.length - 1]) return 40;
  let lo = 0, hi = REP_TABLE.length - 1; // REP_TABLE decreasing
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (REP_TABLE[m] >= frac) lo = m; else hi = m;
  }
  const t = (REP_TABLE[lo] - frac) / (REP_TABLE[lo] - REP_TABLE[hi]);
  return 1 + (lo + t) * REP_STEP;
}
export function maxReps(frac: number): number {
  if (!(frac > 0)) return 40;
  if (frac > 1) return frac < 1.0001 ? 1 : 0;
  const rts = rtsReps(frac);
  return Math.min(40, Math.max(rts, (rts + 30 * (1 / frac - 1)) / 2));
}

// ───────────────────────── starting config ─────────────────────────

function firstPercentSlot(def: ProgramDef, lift: string): SlotDef | undefined {
  return allSlots(def).find((s) => s.progression.kind === "percent" && s.progression.tmLift === lift);
}

/** TM as a fraction of e1RM under the program's maxLabel convention (see header). */
export function tmFraction(maxLabel: string | undefined, tier: string, slotReps: number): number {
  const l = maxLabel ?? "";
  const tiered = l.match(/T1\s*=\s*(\d+)\s*RM.*T2\s*=\s*(\d+)\s*RM/i);
  if (tiered) return rmFrac(Number(tier === "T1" || tier === "MAIN" ? tiered[1] : tiered[2]));
  const pct = l.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return Number(pct[1]) / 100;
  const range = l.match(/(\d+)\s*[–-]\s*(\d+)\s*RM/i);
  if (range) return rmFrac((Number(range[1]) + Number(range[2])) / 2);
  const rm = l.match(/(\d+)\s*RM/i) ?? l.match(/(\d+)-rep/i);
  if (rm) return rmFrac(Number(rm[1])) * (/goal/i.test(l) && Number(rm[1]) === 1 ? 1.05 : 1);
  if (/working weight/i.test(l)) return rmFrac(slotReps + 2);
  if (!l || /training max|\bTM\b/i.test(l)) return 0.9;
  if (/max/i.test(l)) return 1;
  return 0.9;
}

/** Start weight for a non-percent slot from that lift's e1RM (see header). */
function slotStart(slot: SlotDef, e1rm: number): number {
  const p = slot.progression;
  if (p.kind === "stages") {
    if (p.onFinalFail.type === "retest") return p.onFinalFail.pct * e1rm * rmFrac(p.onFinalFail.rmReps);
    return 0.85 * e1rm * rmFrac(p.stages[0].reps);
  }
  if (p.kind === "double") return e1rm * rmFrac(p.reps[0] + 2);
  if (p.kind === "fixed") return e1rm * rmFrac(p.reps + 2);
  return 0;
}

/**
 * A ProgramConfig whose starting weights / training maxes follow the program's conventions,
 * derived from your current e1RMs (in `unit`). Doubles as "switch programs, keep your maxes".
 */
export function startingConfig(templateId: string, options: Record<string, string>, currentE1rms: Record<string, number>, unit: Unit, startDate: string, swaps?: Record<string, string>): ProgramConfig {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown template ${templateId}`);
  const base = defaultConfig(templateId, unit, startDate);
  // with the swaps applied, a swapped slot is estimated for the exercise actually done
  const cfg: ProgramConfig = { ...base, options: { ...base.options, ...options }, startWeights: {}, trainingMaxes: {}, ...(swaps ? { swaps } : {}) };
  const def = buildProgram(cfg)!;
  const tmLifts = new Set<string>();
  for (const s of allSlots(def)) {
    const p = s.progression;
    if (p.kind === "percent") {
      tmLifts.add(p.tmLift);
      if (p.tmRule?.type === "amrapTable") for (const l of p.tmRule.alsoLifts ?? []) tmLifts.add(l);
      continue;
    }
    const e = estimateE1rm(s.lift, currentE1rms, unit);
    const step = loadStep(LIFTS[s.lift]?.kind ?? "barbell", unit, def.microplates);
    cfg.startWeights[s.id] = e > 0 ? Math.max(step, roundTo(slotStart(s, e), step)) : base.startWeights[s.id] ?? 0;
  }
  for (const lift of tmLifts) {
    const e = estimateE1rm(lift, currentE1rms, unit);
    if (!(e > 0)) { cfg.trainingMaxes[lift] = base.trainingMaxes[lift] ?? 0; continue; }
    const slot = firstPercentSlot(def, lift);
    const p = slot?.progression;
    const reps = p?.kind === "percent" ? p.weeks[0]?.[0]?.reps ?? 5 : 5;
    const step = unit === "lb" ? 5 : 2.5;
    cfg.trainingMaxes[lift] = roundTo(e * tmFraction(def.maxLabel, slot?.tier ?? "T1", reps), step);
  }
  return cfg;
}

// ───────────────────────── RNG ─────────────────────────

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

function normal(r: () => number): number {
  let u = r();
  while (u <= 1e-12) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ───────────────────────── simulation ─────────────────────────

interface LiftInfo {
  base: MainLift;
  ratio: number;
  transfer: number;
  bw: boolean;
  step: number;
  /** fatigue group: shares fatigue with the base only if it trains it */
  group: string;
}

const STALL: Outcome[] = ["fail", "stage-down", "tm-down"];
const RESET: Outcome[] = ["reset", "deload", "retest-next"];

function quantiles(xs: number[]): Band {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    if (!s.length) return 0;
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { p10: r1(q(0.1)), p50: r1(q(0.5)), p90: r1(q(0.9)), mean: r1(s.reduce((a, x) => a + x, 0) / Math.max(1, s.length)) };
}

export function baseWeeklyRate(level: number): number {
  return Math.min(G_CAP, G_REF * Math.exp(-(level - T_REF) / T_SCALE));
}

/**
 * Run `templateId` forward `weeks` calendar weeks from your current e1RMs, `runs` times.
 * Returns e1RM bands per main lift by week, stalls/resets, and the projected program end state.
 */
export function simulate(templateId: string, options: Record<string, string>, currentE1rms: Record<string, number>, unit: Unit, weeks: number, opts: SimOptions = {}): SimResult {
  const startDate = opts.startDate ?? "2026-01-05";
  const cfg0 = opts.config ?? startingConfig(templateId, options, currentE1rms, unit, startDate);
  const def = buildProgram(cfg0);
  if (!def) throw new Error(`unknown template ${templateId}`);
  // Accessory-heavy programs (PHAT, Arnold split, Reddit PPL: > 30 exercises a week) default to
  // 100 runs to stay within ~300 ms for 12 weeks.
  const weeklyExercises = (def.days.reduce((a, d) => a + d.slots.length, 0) / def.days.length) * def.sessionsPerWeek;
  const runs = Math.max(1, opts.runs ?? (weeklyExercises > 30 ? 100 : 200));
  const growthScale = opts.growthScale ?? 1;
  const bw = opts.bodyweight ?? DEFAULT_BW[unit];
  const main0 = mainE1rms(currentE1rms, unit);

  // every lift the program touches, with its model ratio
  const info = new Map<string, LiftInfo>();
  const liftMap: Record<string, string> = {};
  for (const s of allSlots(def)) {
    if (info.has(s.lift)) continue;
    const [base, defRatio, transfer] = ratioOf(s.lift);
    const given = currentE1rms[s.lift];
    const ratio = given > 0 ? given / main0[base] : defRatio;
    info.set(s.lift, { base, ratio, transfer, bw: isBodyweight(s.lift) && !(given > 0), step: loadStep(LIFTS[s.lift]?.kind ?? "barbell", unit, def.microplates), group: transfer > 0 ? base : s.lift });
    liftMap[s.lift] = `sim-${s.lift}`;
  }
  const cfg: ProgramConfig = { ...cfg0, liftMap };
  const slotById = new Map(allSlots(def).map((s) => [s.id, s]));
  // matchLift scans the whole liftMap per exercise per slot; a per-day map keeps that small
  const cfgByDay = def.days.map((d): ProgramConfig => ({ ...cfg, liftMap: Object.fromEntries(d.slots.map((s) => [s.lift, liftMap[s.lift]])) }));
  const spw = Math.max(1, Math.round(def.sessionsPerWeek));
  const r = mulberry32(opts.seed ?? 1);
  const t0 = Date.parse(startDate + "T00:00:00Z");

  // results[lift][week][run]
  const traj: Record<MainLift, number[][]> = Object.fromEntries(BIG_FOUR.map((l) => [l, Array.from({ length: weeks + 1 }, () => new Array<number>(runs))])) as Record<MainLift, number[][]>;
  const outcomes: Record<MainLift, Partial<Record<Outcome, number>>> = Object.fromEntries(BIG_FOUR.map((l) => [l, {}])) as Record<MainLift, Partial<Record<Outcome, number>>>;
  const liftSessions: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
  const effSets: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
  let activeWeeks = 0;
  const completedAt: number[] = [];
  const endTms: Record<string, number[]> = {};
  const endSlots: Record<string, { lift: string; w: number[]; stage: number[] }> = {};

  for (let run = 0; run < runs; run++) {
    const E: Record<MainLift, number> = { ...main0 };
    const responder: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
    for (const l of BIG_FOUR) responder[l] = Math.exp(RESPONDER_SD * normal(r) - (RESPONDER_SD * RESPONDER_SD) / 2);
    for (const l of BIG_FOUR) traj[l][0][run] = E[l];
    let state: ProgramState = initialState(def, cfg);
    let done: number | null = null;
    let n = 0;

    for (let wk = 0; wk < weeks; wk++) {
      const D: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
      const H: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
      if (!state.complete) activeWeeks++;
      for (let k = 0; k < spw && !state.complete; k++) {
        const day = Math.floor((k * 7) / spw);
        const plan = planDay(def, cfg, state);
        const sess = Math.exp(SESSION_SD * normal(r));
        const dayE: Record<MainLift, number> = { squat: 0, bench: 0, deadlift: 0, ohp: 0 };
        for (const l of BIG_FOUR) dayE[l] = E[l] * sess * Math.exp(LIFT_SD * normal(r));
        const fatigue = new Map<string, number>(); // per lift and per group
        const exercises: HevyExercise[] = [];
        const seen = new Set<MainLift>();
        for (const ex of plan.exercises) {
          const li = info.get(ex.lift)!;
          if (li.base === ex.lift) seen.add(li.base as MainLift);
          const sets = perform(ex, slotById.get(ex.slotId), li, li.ratio * dayE[li.base], fatigue, r, (frac, v) => {
            D[li.base] += v * li.transfer;
            if (frac >= HEAVY_PCT) H[li.base] += v * li.transfer;
          });
          // performed in `unit`; Hevy carries kg
          if (unit !== "kg") for (const st of sets) st.weight_kg = toKg(st.weight_kg ?? 0, unit);
          exercises.push({ title: liftMap[ex.lift], exercise_template_id: liftMap[ex.lift], sets });
        }
        for (const l of seen) liftSessions[l]++;
        const start = new Date(t0 + (wk * 7 + day) * 864e5 + 17 * 36e5).toISOString();
        const w: HevyWorkout = { id: `sim-${run}-${n++}`, title: plan.dayName, start_time: start, end_time: start, exercises };
        const next = applyWorkout(def, cfgByDay[state.dayIndex], state, w, state.dayIndex);
        const entry = next.log[next.log.length - 1];
        for (const res of entry?.results ?? []) {
          const li = info.get(res.lift);
          if (!li || li.base !== res.lift) continue;
          const o = outcomes[li.base as MainLift];
          o[res.outcome] = (o[res.outcome] ?? 0) + 1;
        }
        state = { ...next, log: [] };
        if (state.complete && done == null) done = wk + 1;
      }
      // weekly adaptation
      for (const l of BIG_FOUR) {
        effSets[l] += D[l];
        const level = E[l] / (ELITE_RATIO[l] * bw);
        const f = Math.min(DOSE_CAP, D[l] / (D[l] + DOSE_K) / (DOSE_REF / (DOSE_REF + DOSE_K)));
        const i = 0.75 + 0.25 * Math.min(1, H[l] / HEAVY_SETS);
        const g = baseWeeklyRate(level) * f * i * responder[l] * (1 + WEEK_NOISE * normal(r)) * growthScale;
        E[l] *= 1 + Math.max(GAIN_FLOOR * (growthScale > 0 ? 1 : 0), g);
        traj[l][wk + 1][run] = E[l];
      }
    }
    if (done != null) completedAt.push(done);
    for (const [lift, tm] of Object.entries(state.tms)) (endTms[lift] ??= []).push(tm);
    for (const s of allSlots(def)) {
      const st = state.slots[s.id];
      if (!st) continue;
      const e = (endSlots[s.id] ??= { lift: s.lift, w: [], stage: [] });
      e.w.push(st.weight);
      e.stage.push(st.stage);
    }
  }

  const perRun = (x: number) => Math.round((x / runs) * 100) / 100;
  const lifts = Object.fromEntries(BIG_FOUR.map((l) => {
    const o = Object.fromEntries(Object.entries(outcomes[l]).map(([k, v]) => [k, perRun(v!)])) as Partial<Record<Outcome, number>>;
    const sum = (ks: Outcome[]) => perRun(ks.reduce((a, k) => a + (outcomes[l][k] ?? 0), 0));
    const level = main0[l] / (ELITE_RATIO[l] * bw);
    return [l, {
      start: Math.round(main0[l] * 10) / 10,
      trajectory: traj[l].map(quantiles),
      gain: quantiles(traj[l][weeks].map((x, i) => x - traj[l][0][i])),
      level: Math.round(level * 1000) / 1000,
      baseWeeklyRate: Math.round(baseWeeklyRate(level) * 1e5) / 1e5,
      stalls: sum(STALL),
      resets: sum(RESET),
      outcomes: o,
      sessionsPerWeek: Math.round((liftSessions[l] / Math.max(1, activeWeeks)) * 100) / 100,
      effectiveSetsPerWeek: Math.round((effSets[l] / Math.max(1, activeWeeks)) * 10) / 10,
    } satisfies LiftProjection];
  })) as Record<MainLift, LiftProjection>;

  const mode = (xs: number[]) => {
    const c = new Map<number, number>();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  };
  completedAt.sort((a, b) => a - b);
  return {
    templateId,
    name: def.name,
    unit,
    weeks,
    runs,
    sessionsPerWeek: def.sessionsPerWeek,
    completedWeek: completedAt.length * 2 > runs ? completedAt[Math.floor(completedAt.length / 2)] : null,
    bodyweight: bw,
    config: cfg0,
    lifts,
    endState: {
      trainingMaxes: Object.fromEntries(Object.entries(endTms).map(([k, v]) => [k, quantiles(v)])),
      slots: Object.fromEntries(Object.entries(endSlots).map(([k, v]) => [k, { lift: v.lift, weight: quantiles(v.w), stage: mode(v.stage) }])),
    },
  };
}

/** The model lifter performs one planned exercise. `onSet(frac of day e1RM, effective-set value)` feeds the dose. */
function perform(ex: PlannedExercise, slot: SlotDef | undefined, li: LiftInfo, dayE1rm: number, fatigue: Map<string, number>, r: () => number, onSet: (frac: number, v: number) => void): HevySet[] {
  const out: HevySet[] = [];
  const stage = slot?.progression.kind === "stages" && slot.progression.advance.type === "baseVolume" ? slot.progression : null;
  const isDouble = slot?.progression.kind === "double";
  const retest = ex.scheme.endsWith("RM TEST");
  let topE1rm = 0, misses = 0, made = 0;

  for (const ps of ex.sets) {
    if (li.bw || dayE1rm <= 0) {
      out.push({ type: "normal", weight_kg: ps.weight, reps: ps.amrap ? ps.reps + 2 : ps.repsMax ?? ps.reps });
      continue;
    }
    const fLift = fatigue.get(ex.lift) ?? 0, fGroup = fatigue.get("g:" + li.group) ?? 0;
    const eff = dayE1rm * (1 - (0.5 * fLift + 0.5 * fGroup));
    // choose the load
    let w = ps.weight;
    if (retest) w = Math.floor((eff * (1 + RPE_ERR * normal(r)) * rmFrac(ps.reps)) / li.step) * li.step;
    else if (ps.ofTop && ps.pct != null) w = topE1rm > 0 ? roundTo(topE1rm * ps.pct, li.step) : Math.floor((eff * ps.pct * 0.95) / li.step) * li.step;
    else if (w <= 0) w = Math.floor((eff * (1 + RPE_ERR * normal(r)) * standardPct(ps.reps, ps.rpe ?? 8)) / li.step) * li.step;
    w = Math.max(li.step, w);
    const cap = maxReps(w / eff);
    const capInt = Math.floor(cap + 1e-9);
    let reps: number;
    if (ps.amrap) {
      reps = Math.floor(cap - AMRAP_SD * Math.abs(normal(r)));
      if (ps.rpe != null) reps = Math.max(Math.min(ps.reps, capInt), Math.floor(cap - (10 - ps.rpe)));
      reps = Math.max(0, Math.min(capInt, reps));
    } else if (isDouble || (ps.repsMax != null && ps.rpe == null)) {
      reps = Math.min(ps.repsMax ?? ps.reps, capInt);
    } else {
      reps = Math.min(ps.reps, capInt);
    }
    if (stage && reps < ps.reps) {
      // linear-progression miss: logged one short (see header), stop after a second miss
      reps = Math.max(1, ps.reps - 1);
      misses++;
    } else made++;
    if (reps > 0) {
      out.push({ type: "normal", weight_kg: w, reps });
      // the lifter's read of the set: RPE = 10 − reps left in the tank
      topE1rm = Math.max(topE1rm, w / standardPct(reps, Math.min(10, Math.max(6, 10 - (cap - reps)))));
      const add = FATIGUE_PER_SET * (Math.min(reps, cap) / (cap + 1)) ** 2;
      fatigue.set(ex.lift, fLift + add);
      fatigue.set("g:" + li.group, fGroup + add);
      onSet(w / dayE1rm, Math.min(1, Math.min(reps, cap) / Math.max(1, cap) / 0.6));
    }
    if (stage && misses >= 2 && made > 0) break;
  }
  return out;
}

/** Side-by-side big-four summary after `weeks` for several programs. `opts.options[templateId]` sets template options. */
export function compare(templateIds: string[], currentE1rms: Record<string, number>, unit: Unit, weeks: number, opts: Omit<SimOptions, "config"> & { options?: Record<string, Record<string, string>> } = {}): CompareRow[] {
  return templateIds.map((id) => {
    const res = simulate(id, opts.options?.[id] ?? {}, currentE1rms, unit, weeks, opts);
    const lifts = Object.fromEntries(BIG_FOUR.map((l) => {
      const p = res.lifts[l];
      return [l, { start: p.start, end: p.trajectory[weeks], gain: p.gain, stalls: p.stalls, resets: p.resets }];
    })) as CompareRow["lifts"];
    return {
      templateId: id, name: res.name, sessionsPerWeek: res.sessionsPerWeek, completedWeek: res.completedWeek, lifts,
      totalGain: Math.round(BIG_FOUR.reduce((a, l) => a + res.lifts[l].gain.p50, 0) * 10) / 10,
    };
  });
}
