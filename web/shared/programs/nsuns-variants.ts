// nSuns 5/3/1 LP: 4-day, 6-day squat-focus and 6-day deadlift-focus layouts. Same set tables and
// weekly TM rule as the 5-day program (see nsuns.ts); only the day layout changes.
//
// Source: LiftVault "nSuns Linear Progression (LP) Complete Bundle" (the spreadsheet + the public
// original it was copied from). Every Mon–Fri set in the "4 Day LP", "6 Day Deadlift Focus" and
// unnamed squat-focus tab ("Sheet3") divides back to the 5-day percentages at 5 lb rounding.
//
// - 4-day: Bench (volume) / OHP · Squat / Sumo · Bench (heavy) / CG bench · Deadlift / Front squat.
//   OHP only appears as a T2, so it has no 1+ set. nSuns' rule (his reply in the original r/Fitness
//   thread, 5icyza: "would you just increase TM by 5 lbs if you can successfully complete all the
//   reps for that day?" — "Yes exactly"): finish every Monday OHP rep → OHP TM +5 lb (2.5 kg) for
//   next week. Encoded as total reps at the 70% sets (3+5+7+4+6+8 = 33).
// - 6-day: the 5-day week plus a Saturday of 8×3 on the focus lift (3rd set "3+") and 6×3 on its
//   variation. The sheet's formulas are MROUND(TM × 0.725) and MROUND(otherTM × 0.75 × 0.75), i.e.
//   72.5% and 56.25% of the TM. The deadlift-focus tab also swaps Tuesday and Thursday (deadlift
//   Tue + Sat, squat Thu). The 6-day tabs' press TM cell reads the wrong 1RM in the sheet (a bug),
//   so both OHP days use the OHP TM with the 5-day percentages.
// CAP3 isn't included: the bundle doesn't contain it and its "TM = new e1RM, else +5" rule needs
// an engine change.

import type { DayDef, PercentSet, ProgramTemplate, SlotDef } from "../program";
import type { Unit } from "../units";
import { LOWER, T1_531, T1_BENCH_HEAVY, T1_BENCH_VOL, T1_DL, T2_A, T2_BENCHVAR, T2_FRONT, T2_SUMO, UPPER, t1 as t1now, t2 } from "./nsuns";

// The sheet raises TMs once a week, so a bump earned on Tuesday's squat doesn't change Thursday's
// front squat or Saturday's 8×3: apply it at the end of the week.
const t1 = (id: string, lift: string, sets: PercentSet[], table?: typeof UPPER): SlotDef => t1now(id, lift, sets, table, "weekEnd");

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const TMI = { lb: 5, kg: 2.5 };
const tmIncrement = { bench: TMI, ohp: TMI, squat: TMI, deadlift: TMI };

// Saturday of the 6-day versions (sheet formulas: TM × 0.725 and TM × 0.75 × 0.75).
const SAT_T1: PercentSet[] = Array.from({ length: 8 }, (_, i) => ({ pct: 0.725, reps: 3, amrap: i === 2 }));
const SAT_T2: PercentSet[] = Array.from({ length: 6 }, () => ({ pct: 0.5625, reps: 3 }));

/** 4-day OHP: every rep of Monday's T2 done at the 70% sets (33 reps) → +1 increment next week. */
const OHP_ALL_REPS: SlotDef["progression"] = { kind: "percent", tmLift: "ohp", weeks: [T2_A], tmRule: { type: "totalReps", table: [{ minReps: 0, increments: 0 }, { minReps: 33, increments: 1 }], applyAt: "weekEnd" } };

const day = (id: string, name: string, ...slots: SlotDef[]): DayDef => ({ id, name, slots });

function defaults(unit: Unit) {
  const lb = { squat: 285, bench: 205, deadlift: 340, ohp: 135 };
  return { trainingMaxes: Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : kg(v)])), startWeights: {} };
}

const NOTES = [
  "TM = 90% of your 1RM. Each week, the reps on a lift's 1+ set decide its TM bump: 0–1 none, 2–3 +5 lb, 4–5 +5 (upper) / +10 (lower), 6+ +10 / +15.",
  "Assistance (2–3 exercises, bodybuilding sets/reps) is up to you; the sheet only names body parts.",
];

export const nsuns4: ProgramTemplate = {
  id: "nsuns-4day",
  name: "nSuns LP 4-Day",
  author: "/u/nSuns",
  source: "nSuns Linear Progression (LP) Complete Bundle | LiftVault.com (4 Day LP tab)",
  summary: "The 5-day nSuns LP minus the OHP day: two bench days, one squat day, one deadlift day, weekly TM bumps from the 1+ sets.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [],
  build() {
    return {
      templateId: "nsuns-4day",
      name: "nSuns LP 4-Day",
      sessionsPerWeek: 4,
      tmIncrement,
      maxLabel: "Training max",
      notes: [...NOTES, "OHP has no 1+ set in the 4-day version: finish every rep of Monday's OHP and its TM goes up 5 lb next week (nSuns' own rule)."],
      days: [
        day("1", "Day 1 · Bench volume / OHP", t1("n4-d1-t1", "bench", T1_BENCH_VOL), { id: "n4-d1-t2", lift: "ohp", tier: "T2", progression: OHP_ALL_REPS }),
        day("2", "Day 2 · Squat / Sumo", t1("n4-d2-t1", "squat", T1_531, LOWER), t2("n4-d2-t2", "sumoDeadlift", "deadlift", T2_SUMO)),
        day("3", "Day 3 · Bench / CG bench", t1("n4-d3-t1", "bench", T1_BENCH_HEAVY, UPPER), t2("n4-d3-t2", "cgBench", "bench", T2_BENCHVAR)),
        day("4", "Day 4 · Deadlift / Front squat", t1("n4-d4-t1", "deadlift", T1_DL, LOWER), t2("n4-d4-t2", "frontSquat", "squat", T2_FRONT)),
      ],
    };
  },
  defaults,
};

function sixDay(focus: "squat" | "deadlift"): ProgramTemplate {
  const id = `nsuns-6day-${focus}`;
  const name = `nSuns LP 6-Day (${focus === "squat" ? "Squat" : "Deadlift"} focus)`;
  const p = focus === "squat" ? "n6s" : "n6d";
  const squatDay = (n: string) => day(n, `Day ${n} · Squat / Sumo`, t1(`${p}-d${n}-t1`, "squat", T1_531, LOWER), t2(`${p}-d${n}-t2`, "sumoDeadlift", "deadlift", T2_SUMO));
  const dlDay = (n: string) => day(n, `Day ${n} · Deadlift / Front squat`, t1(`${p}-d${n}-t1`, "deadlift", T1_DL, LOWER), t2(`${p}-d${n}-t2`, "frontSquat", "squat", T2_FRONT));
  const sat =
    focus === "squat"
      ? day("6", "Day 6 · Squat 8×3 / Sumo 6×3", { id: `${p}-d6-t1`, lift: "squat", tier: "T1", progression: { kind: "percent", tmLift: "squat", weeks: [SAT_T1] } }, t2(`${p}-d6-t2`, "sumoDeadlift", "deadlift", SAT_T2))
      : day("6", "Day 6 · Deadlift 8×3 / Front squat 6×3", { id: `${p}-d6-t1`, lift: "deadlift", tier: "T1", progression: { kind: "percent", tmLift: "deadlift", weeks: [SAT_T1] } }, t2(`${p}-d6-t2`, "frontSquat", "squat", SAT_T2));
  return {
    id,
    name,
    author: "/u/nSuns",
    source: `LiftVault: nSuns LP Complete Bundle (${focus === "squat" ? "squat-focus tab" : "6 Day Deadlift Focus tab"})`,
    summary: `The 5-day nSuns LP plus a sixth day of extra ${focus} volume (8×3 at a moderate weight, plus 6×3 on a variation).`,
    category: "strength",
    level: "intermediate",
    daysPerWeek: [6],
    options: [],
    build() {
      return {
        templateId: id,
        name,
        sessionsPerWeek: 6,
        tmIncrement,
        maxLabel: "Training max",
        notes: [...NOTES, `Saturday's 8×3 doesn't change the TM; the "3+" on set 3 is a gauge, not a test.`],
        days: [
          day("1", "Day 1 · Bench volume / OHP", t1(`${p}-d1-t1`, "bench", T1_BENCH_VOL), t2(`${p}-d1-t2`, "ohp", "ohp", T2_A)),
          focus === "squat" ? squatDay("2") : dlDay("2"),
          day("3", "Day 3 · OHP / Incline", t1(`${p}-d3-t1`, "ohp", T1_531, UPPER), t2(`${p}-d3-t2`, "inclineBench", "bench", T2_BENCHVAR)),
          focus === "squat" ? dlDay("4") : squatDay("4"),
          day("5", "Day 5 · Bench / CG bench", t1(`${p}-d5-t1`, "bench", T1_BENCH_HEAVY, UPPER), t2(`${p}-d5-t2`, "cgBench", "bench", T2_BENCHVAR)),
          sat,
        ],
      };
    },
    defaults,
  };
}

export const nsuns6Squat = sixDay("squat");
export const nsuns6Deadlift = sixDay("deadlift");
