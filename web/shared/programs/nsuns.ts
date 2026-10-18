// nSuns 5/3/1 LP, 5-day. Every week is the same; the reps you get on the 1+ set decide how much
// that lift's TM goes up next week.
//
// Verified against the "5 Day LP" tab of the LiftVault nSuns LP Complete Bundle (spreadsheet copy
// and the public original): every set's weight / TM matches these percentages at 5 lb rounding.
// TM rule from the sheet: 0-1 reps on the 1+ set → no change, 2-3 → +5 lb, 4-5 → +5-10 lb,
// 6+ → +10-15 lb (low end for upper-body lifts, high end for lower).

import type { PercentSet, ProgramTemplate, SlotDef } from "../program";
import type { Unit } from "../units";

export const S = (spec: [number, number, boolean?][]): PercentSet[] => spec.map(([p, r, a]) => ({ pct: p / 100, reps: r, amrap: !!a }));

export const T1_531 = S([[75, 5], [85, 3], [95, 1, true], [90, 3], [85, 3], [80, 3], [75, 5], [70, 5], [65, 5, true]]);
export const T1_DL = S([[75, 5], [85, 3], [95, 1, true], [90, 3], [85, 3], [80, 3], [75, 3], [70, 3], [65, 3, true]]);
export const T1_BENCH_VOL = S([[65, 8], [75, 6], [85, 4], [85, 4], [85, 4], [80, 5], [75, 6], [70, 7], [65, 8, true]]);
export const T1_BENCH_HEAVY = S([[75, 5], [85, 3], [95, 1, true], [90, 3], [85, 5], [80, 3], [75, 5], [70, 3], [65, 5, true]]);
export const T2_A = S([[50, 6], [60, 5], [70, 3], [70, 5], [70, 7], [70, 4], [70, 6], [70, 8]]);
export const T2_SUMO = S([[50, 5], [60, 5], [70, 3], [70, 5], [70, 7], [70, 4], [70, 6], [70, 8]]);
export const T2_BENCHVAR = S([[40, 6], [50, 5], [60, 3], [60, 5], [60, 7], [60, 4], [60, 6], [60, 8]]);
export const T2_FRONT = S([[35, 5], [45, 5], [55, 3], [55, 5], [55, 7], [55, 4], [55, 6], [55, 8]]);

// Reps on the 95% 1+ set → number of TM increments.
export const UPPER = [{ minReps: 0, increments: 0 }, { minReps: 2, increments: 1 }, { minReps: 4, increments: 1 }, { minReps: 6, increments: 2 }];
export const LOWER = [{ minReps: 0, increments: 0 }, { minReps: 2, increments: 1 }, { minReps: 4, increments: 2 }, { minReps: 6, increments: 3 }];

export const t1 = (id: string, lift: string, sets: PercentSet[], table?: typeof UPPER, applyAt?: "now" | "weekEnd"): SlotDef => ({
  id, lift, tier: "T1",
  progression: { kind: "percent", tmLift: lift, weeks: [sets], tmRule: table ? { type: "amrapTable", setIndex: 2, table, ...(applyAt ? { applyAt } : {}) } : undefined },
});
export const t2 = (id: string, lift: string, tmLift: string, sets: PercentSet[]): SlotDef => ({ id, lift, tier: "T2", progression: { kind: "percent", tmLift, weeks: [sets] } });

export const nsuns: ProgramTemplate = {
  id: "nsuns5",
  name: "nSuns LP 5-Day",
  author: "/u/nSuns",
  source: "nSuns Linear Progression (LP) Complete Bundle | LiftVault.com",
  summary: "High-volume 5/3/1 variant with weekly TM bumps driven by your 1+ sets. Nine T1 sets, eight T2 sets per day.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [5],
  options: [],
  build() {
    return {
      templateId: "nsuns5",
      name: "nSuns LP 5-Day",
      sessionsPerWeek: 5,
      tmIncrement: { bench: { lb: 5, kg: 2.5 }, ohp: { lb: 5, kg: 2.5 }, squat: { lb: 5, kg: 2.5 }, deadlift: { lb: 5, kg: 2.5 } },
      days: [
        { id: "1", name: "Day 1 · Bench volume / OHP", slots: [t1("d1-t1", "bench", T1_BENCH_VOL), t2("d1-t2", "ohp", "ohp", T2_A)] },
        { id: "2", name: "Day 2 · Squat / Sumo", slots: [t1("d2-t1", "squat", T1_531, LOWER, "weekEnd"), t2("d2-t2", "sumoDeadlift", "deadlift", T2_SUMO)] },
        { id: "3", name: "Day 3 · OHP / Incline", slots: [t1("d3-t1", "ohp", T1_531, UPPER, "weekEnd"), t2("d3-t2", "inclineBench", "bench", T2_BENCHVAR)] },
        { id: "4", name: "Day 4 · Deadlift / Front squat", slots: [t1("d4-t1", "deadlift", T1_DL, LOWER, "weekEnd"), t2("d4-t2", "frontSquat", "squat", T2_FRONT)] },
        { id: "5", name: "Day 5 · Bench / CG bench", slots: [t1("d5-t1", "bench", T1_BENCH_HEAVY, UPPER, "weekEnd"), t2("d5-t2", "cgBench", "bench", T2_BENCHVAR)] },
      ],
    };
  },
  defaults(unit: Unit) {
    const lb = { squat: 250, bench: 185, deadlift: 300, ohp: 115 };
    return { trainingMaxes: Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5])), startWeights: {} };
  },
};
