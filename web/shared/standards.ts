// Strength standards: powerlifting points formulas and bodyweight-ratio tiers. All inputs in kg.
//
// Coefficients are the published ones, transcribed the same way OpenPowerlifting implements them
// (gitlab.com/openpowerlifting/opl-data, crates/coefficients):
//   DOTS  — Tim Konertz, 2019 (adopted by the BVDK; OpenPowerlifting's default). 500 / quartic(bw).
//   Wilks — Robert Wilks, classic (1995 IPF table) and Wilks 2020 ("Wilks2", 600 / quintic(bw)).
//   GL    — IPF Good Lift points, 2020 (IPF Technical Committee): 100 / (A − B·e^(−C·bw)).

import type { HevyWorkout } from "./hevy";
import { epley, liftHistory } from "./stats";

export type Sex = "male" | "female";
export type Equipment = "raw" | "equipped";
export type Event = "total" | "bench";

const poly = (k: readonly number[], x: number) => k.reduce((a, c, i) => a + c * x ** i, 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ── DOTS ── coefficients ascending (e, d, c, b, a)
const DOTS = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
} as const;
const DOTS_BW = { male: [40, 210], female: [40, 150] } as const;

/** DOTS multiplier (points per kg lifted). Bodyweight clamped to 40–210 kg (M) / 40–150 kg (F). */
export function dotsCoefficient(bodyweightKg: number, sex: Sex): number {
  const [lo, hi] = DOTS_BW[sex];
  return 500 / poly(DOTS[sex], clamp(bodyweightKg, lo, hi));
}
export const dots = (totalKg: number, bodyweightKg: number, sex: Sex) => totalKg * dotsCoefficient(bodyweightKg, sex);

// ── Wilks (classic, 1995) ──
const WILKS = {
  male: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8],
  female: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8],
} as const;
const WILKS_BW = { male: [40, 201.9], female: [26.51, 154.53] } as const;

export function wilksCoefficient(bodyweightKg: number, sex: Sex): number {
  const [lo, hi] = WILKS_BW[sex];
  return 500 / poly(WILKS[sex], clamp(bodyweightKg, lo, hi));
}
export const wilks = (totalKg: number, bodyweightKg: number, sex: Sex) => totalKg * wilksCoefficient(bodyweightKg, sex);

// ── Wilks 2020 ──
const WILKS2 = {
  male: [47.46178854, 8.472061379, 0.07369410346, -0.001395833811, 7.07665973070743e-6, -1.20804336482315e-8],
  female: [-125.4255398, 13.71219419, -0.03307250631, -0.001050400051, 9.38773881462799e-6, -2.3334613884954e-8],
} as const;
const WILKS2_BW = { male: [40, 200.95], female: [40, 150.95] } as const;

export function wilks2020Coefficient(bodyweightKg: number, sex: Sex): number {
  const [lo, hi] = WILKS2_BW[sex];
  return 600 / poly(WILKS2[sex], clamp(bodyweightKg, lo, hi));
}
export const wilks2020 = (totalKg: number, bodyweightKg: number, sex: Sex) => totalKg * wilks2020Coefficient(bodyweightKg, sex);

// ── IPF GL points (2020) ── [A, B, C]
const GL: Record<Sex, Record<Equipment, Record<Event, [number, number, number]>>> = {
  male: {
    raw: { total: [1199.72839, 1025.18162, 0.00921], bench: [320.98041, 281.40258, 0.01008] },
    equipped: { total: [1236.25115, 1449.21864, 0.01644], bench: [381.22073, 733.79378, 0.02398] },
  },
  female: {
    raw: { total: [610.32796, 1045.59282, 0.03048], bench: [142.40398, 442.52671, 0.04724] },
    equipped: { total: [758.63878, 949.31382, 0.02435], bench: [221.82209, 357.00377, 0.02937] },
  },
};

/** IPF GL points. Classic (raw) three-lift total by default. 0 below 35 kg bodyweight, like the IPF. */
export function ipfGl(totalKg: number, bodyweightKg: number, sex: Sex, equipment: Equipment = "raw", event: Event = "total"): number {
  if (bodyweightKg < 35 || totalKg <= 0) return 0;
  const [A, B, C] = GL[sex][equipment][event];
  return (totalKg * 100) / (A - B * Math.exp(-C * bodyweightKg));
}

// ── bodyweight-ratio tiers ──

export type Tier = "Beginner" | "Novice" | "Intermediate" | "Advanced" | "Elite";
export const TIERS: Tier[] = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
export type StandardLift = "squat" | "bench" | "deadlift" | "ohp";
export const STANDARD_LIFTS: StandardLift[] = ["squat", "bench", "deadlift", "ohp"];

/**
 * 1RM ÷ bodyweight thresholds for each tier, from the bodyweight-ratio summaries on Strength Level
 * (strengthlevel.com/strength-standards/{squat,bench-press,deadlift,shoulder-press}, "Male/Female
 * strength standards" ratio tables, built from ~millions of user-entered lifts). Those pages give one
 * ratio per tier averaged across bodyweights; the exact per-bodyweight tables differ slightly.
 */
export const RATIO_STANDARDS: Record<Sex, Record<StandardLift, [number, number, number, number, number]>> = {
  male: {
    squat: [0.75, 1.25, 1.5, 2.25, 2.75],
    bench: [0.5, 0.75, 1.25, 1.75, 2],
    deadlift: [1, 1.5, 2, 2.5, 3],
    ohp: [0.35, 0.55, 0.8, 1.1, 1.4],
  },
  female: {
    squat: [0.5, 0.75, 1.25, 1.5, 2],
    bench: [0.25, 0.5, 0.75, 1, 1.5],
    deadlift: [0.5, 1, 1.25, 1.75, 2.5],
    ohp: [0.2, 0.35, 0.5, 0.75, 1],
  },
};

export interface TierResult {
  ratio: number;
  /** highest tier reached; null when below Beginner */
  tier: Tier | null;
  next: Tier | null;
  /** 1RM (kg) needed for the next tier */
  nextKg: number | null;
  /** 0–1 progress from the current tier threshold to the next */
  progress: number;
}

export function strengthTier(lift: StandardLift, oneRmKg: number, bodyweightKg: number, sex: Sex): TierResult {
  const t = RATIO_STANDARDS[sex][lift];
  const ratio = bodyweightKg > 0 ? oneRmKg / bodyweightKg : 0;
  let i = -1;
  while (i + 1 < t.length && ratio >= t[i + 1] - 1e-9) i++;
  const lo = i < 0 ? 0 : t[i], hi = i + 1 < t.length ? t[i + 1] : null;
  return {
    ratio,
    tier: i < 0 ? null : TIERS[i],
    next: hi == null ? null : TIERS[i + 1],
    nextKg: hi == null ? null : hi * bodyweightKg,
    progress: hi == null ? 1 : clamp((ratio - lo) / (hi - lo), 0, 1),
  };
}

// ── profile from workouts ──

export interface LiftStandard {
  lift: StandardLift;
  /** best Epley e1RM, kg (null if never logged) */
  e1rmKg: number | null;
  date: string | null;
  tier: TierResult | null;
}

export interface StrengthProfile {
  bodyweightKg: number;
  sex: Sex;
  lifts: Record<StandardLift, LiftStandard>;
  /** squat + bench + deadlift best e1RMs (kg); null unless all three exist */
  totalKg: number | null;
  dots: number | null;
  wilks: number | null;
  wilks2020: number | null;
  ipfGl: number | null;
  /** IPF GL for bench alone (classic bench event) */
  ipfGlBench: number | null;
}

export interface StandardsOpts {
  tz?: string;
  map?: Record<string, string>;
  /** only count sessions on/after this local date (e.g. last 12 months) */
  since?: string;
  /** cap reps used for e1RM (higher-rep sets are poor 1RM predictors); default 10 */
  maxReps?: number;
}

/** Best e1RMs for the big four, bodyweight ratios, tiers and points from the SBD total. */
export function strengthProfile(workouts: HevyWorkout[], bodyweightKg: number, sex: Sex, opts: StandardsOpts = {}): StrengthProfile {
  const tz = opts.tz ?? "UTC", maxReps = opts.maxReps ?? 10;
  const lifts = {} as Record<StandardLift, LiftStandard>;
  for (const lift of STANDARD_LIFTS) {
    let best: { kg: number; date: string } | null = null;
    for (const p of liftHistory(workouts, lift, "kg", tz, opts.map)) {
      if (opts.since && p.date < opts.since) continue;
      for (const s of p.sets) {
        if (s.reps > maxReps || s.weight <= 0) continue;
        const e = epley(s.weight, s.reps);
        if (!best || e > best.kg) best = { kg: e, date: p.date };
      }
    }
    lifts[lift] = { lift, e1rmKg: best?.kg ?? null, date: best?.date ?? null, tier: best ? strengthTier(lift, best.kg, bodyweightKg, sex) : null };
  }
  const { squat, bench, deadlift } = lifts;
  const totalKg = squat.e1rmKg != null && bench.e1rmKg != null && deadlift.e1rmKg != null ? squat.e1rmKg + bench.e1rmKg + deadlift.e1rmKg : null;
  return {
    bodyweightKg,
    sex,
    lifts,
    totalKg,
    dots: totalKg == null ? null : dots(totalKg, bodyweightKg, sex),
    wilks: totalKg == null ? null : wilks(totalKg, bodyweightKg, sex),
    wilks2020: totalKg == null ? null : wilks2020(totalKg, bodyweightKg, sex),
    ipfGl: totalKg == null ? null : ipfGl(totalKg, bodyweightKg, sex),
    ipfGlBench: bench.e1rmKg == null ? null : ipfGl(bench.e1rmKg, bodyweightKg, sex, "raw", "bench"),
  };
}
