// GZCLP, from "GZCLP 3 or 4-Day (12 Week) v4.5b5 by /u/Blacknoir" (LiftVault). The rules
// below come from the sheet's Start tab:
//
//   T1  5×3+ → 6×2+ → 10×1+ (modified 3×5+ → 4×3+ → 5×2+). Add weight each success.
//       Missing base volume (15 / 12 / 10) drops a stage at the SAME weight. Failing the last
//       stage means "Retest": find a new 5RM, next weight = 85% of it.
//   T2  3×10 → 3×8 → 3×6 (modified 4×8 → 4×6 → 4×4). Base volume 30 / 24 / 18. Failing the
//       last stage resets to 3×10 at slightly more than the previous 3×10 start. No retest.
//   T3  3×15+ (modified 4×12+). Add weight once the last set reaches 25 (modified 18).
//
// 3-day and 4-day run the same A1 B1 A2 B2 rotation; 3-day just spreads it over more weeks.

import type { ProgramTemplate, SlotDef, Stage, Tier, Weights } from "../program";
import { LIFTS } from "../lifts";
import type { Unit } from "../units";

const T1: Record<string, Stage[]> = {
  default: [{ sets: 5, reps: 3, amrap: true }, { sets: 6, reps: 2, amrap: true }, { sets: 10, reps: 1, amrap: true }],
  modified: [{ sets: 3, reps: 5, amrap: true }, { sets: 4, reps: 3, amrap: true }, { sets: 5, reps: 2, amrap: true }],
};
const T2: Record<string, Stage[]> = {
  default: [{ sets: 3, reps: 10, amrap: false }, { sets: 3, reps: 8, amrap: false }, { sets: 3, reps: 6, amrap: false }],
  modified: [{ sets: 4, reps: 8, amrap: false }, { sets: 4, reps: 6, amrap: false }, { sets: 4, reps: 4, amrap: false }],
};
const T3: Record<string, { stage: Stage; target: number }> = {
  default: { stage: { sets: 3, reps: 15, amrap: true }, target: 25 },
  modified: { stage: { sets: 4, reps: 12, amrap: true }, target: 18 },
};

const big = (lift: string): Weights => (LIFTS[lift]?.upper ? { lb: 5, kg: 2.5 } : { lb: 10, kg: 5 });
const small: Weights = { lb: 5, kg: 2.5 };

function slot(id: string, tier: Tier, lift: string, o: Record<string, string>, t3Scheme = o.t3): SlotDef {
  if (tier === "T1")
    return { id, tier, lift, progression: { kind: "stages", stages: T1[o.t1], advance: { type: "baseVolume" }, onFinalFail: { type: "retest", rmReps: 5, pct: 0.85 }, increment: big(lift) } };
  if (tier === "T2")
    return { id, tier, lift, progression: { kind: "stages", stages: T2[o.t2], advance: { type: "baseVolume" }, onFinalFail: { type: "reset", bumpIncrements: 2 }, increment: big(lift) } };
  const t = T3[t3Scheme];
  return { id, tier, lift, progression: { kind: "stages", stages: [t.stage], advance: { type: "amrapAtLeast", reps: t.target }, onFinalFail: { type: "hold" }, increment: small } };
}

export const gzclp: ProgramTemplate = {
  id: "gzclp",
  name: "GZCLP",
  author: "Cody Lefever (GZCL) · sheet v4.5b5 by /u/Blacknoir",
  source: "v4_5b5 GZCLP 3-4 Day 12-Week | LiftVault.com",
  summary: "Linear progression in three tiers. T1 heavy triples, T2 volume, T3 pump work. Rep schemes step down when you stall.",
  category: "gzcl",
  level: "beginner",
  daysPerWeek: [3, 4],
  options: [
    { key: "days", label: "Days per week", default: "4", choices: [{ value: "3", label: "3 day" }, { value: "4", label: "4 day" }] },
    { key: "t1", label: "T1 scheme", default: "default", choices: [{ value: "default", label: "5×3+ › 6×2+ › 10×1+" }, { value: "modified", label: "3×5+ › 4×3+ › 5×2+" }] },
    { key: "t2", label: "T2 scheme", default: "default", choices: [{ value: "default", label: "3×10 › 3×8 › 3×6" }, { value: "modified", label: "4×8 › 4×6 › 4×4" }] },
    { key: "t3", label: "T3 scheme", default: "default", choices: [{ value: "default", label: "3×15+ (move up at 25)" }, { value: "modified", label: "4×12+ (move up at 18)" }] },
    { key: "curls", label: "Extra T3 on A1", default: "on", choices: [{ value: "on", label: "Bicep curls 4×12+" }, { value: "off", label: "None" }] },
  ],
  build(o) {
    const opts = { days: "4", t1: "default", t2: "default", t3: "default", curls: "on", ...o };
    const a1 = [slot("a1-t1", "T1", "squat", opts), slot("a1-t2", "T2", "bench", opts), slot("a1-t3", "T3", "latPulldown", opts)];
    if (opts.curls === "on") a1.push(slot("a1-t3b", "T3", "bicepCurl", opts, "modified"));
    return {
      templateId: "gzclp",
      name: `GZCLP ${opts.days}-Day`,
      sessionsPerWeek: Number(opts.days),
      days: [
        { id: "A1", name: "Day A1 · Squat", slots: a1 },
        { id: "B1", name: "Day B1 · OHP", slots: [slot("b1-t1", "T1", "ohp", opts), slot("b1-t2", "T2", "deadlift", opts), slot("b1-t3", "T3", "dbRow", opts)] },
        { id: "A2", name: "Day A2 · Bench", slots: [slot("a2-t1", "T1", "bench", opts), slot("a2-t2", "T2", "squat", opts), slot("a2-t3", "T3", "latPulldown", opts)] },
        { id: "B2", name: "Day B2 · Deadlift", slots: [slot("b2-t1", "T1", "deadlift", opts), slot("b2-t2", "T2", "ohp", opts), slot("b2-t3", "T3", "dbRow", opts)] },
      ],
    };
  },
  defaults(unit: Unit) {
    // Starting weights from the sheet's Start tab (entered in lb).
    const lb: Record<string, number> = {
      "a1-t1": 185, "a1-t2": 145, "a1-t3": 42.5, "a1-t3b": 20,
      "b1-t1": 85, "b1-t2": 135, "b1-t3": 40,
      "a2-t1": 165, "a2-t2": 135, "a2-t3": 58,
      "b2-t1": 225, "b2-t2": 65, "b2-t3": 40,
    };
    const conv = (v: number) => (unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5);
    return {
      startWeights: Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, conv(v)])),
      // The sheet uses +5 for T2 squat rather than the usual +10 for lower body.
      increments: unit === "lb" ? { "a2-t2": 5 } : { "a2-t2": 2.5 },
      trainingMaxes: {},
    };
  },
};
