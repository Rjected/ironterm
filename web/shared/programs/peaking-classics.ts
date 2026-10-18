// Classic percentage peaking blocks, transcribed from LiftVault's public Google Sheets (exported
// as CSV/XLSX and read cell by cell, formulas included):
//
//   Hatch Squat        "Hatch Squat Program | LiftVault.com" (Gayle Hatch, hatchsquat.com). 12 weeks,
//                      two days. Back squat pyramids interleaved with front squat sets, each a % of
//                      its own max; a 103% back squat single in week 11 day 1.
//   Korte 3×3          "Korte 3x3 Powerlifting Program" (Stephan Korte). Loads are % of a projected
//                      max = 1RM × 1.05 (the sheet's CEILING(1RM*1.05)); that's the max you enter
//                      here, and the defaults are the sheet's example. Phase 1 (weeks 1–4): bench 6–8×6, squat and deadlift 5–8×5,
//                      58/60/62/64% of projected, same all three days. Phase 2 (weeks 5–8): each day
//                      one lift does 2 heavy singles (80/85/90/95% of projected), the others 5×4
//                      (bench) or 3×3 (squat/deadlift) at 60%.
//   Ed Coan peaking    "Ed Coan Peaking Program #1 / #2" (The WeighTrainer sheets). One top lift a
//                      week, two work sets, reps 10 → 1, % of current max climbing to 111.1%.
//   Russian Bench      "6 Week Russian Bench Press Peaking Program" (LiftVault's bench adaptation of
//                      the Russian squat routine): 6×2 @80% days around 6×3–6×6 volume, then 5×5 @85,
//                      4×4 @90, 3×3 @95, 2×2 @100 and a 105% single.

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier } from "../program";
import type { Unit } from "../units";

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const toUnit = (lb: number, unit: Unit) => (unit === "lb" ? lb : kg(lb));
const sets = (n: number, reps: number, pct: number): PercentSet[] => Array.from({ length: n }, () => ({ pct, reps }));
const pctSlot = (id: string, lift: string, tier: Tier, weeks: PercentSet[][], note?: string): SlotDef => ({ id, lift, tier, note, progression: { kind: "percent", tmLift: lift, weeks } });

/** "B1x10@60 F1x5@60 …" → the back (B) and front (F) squat sets, in order. */
function parseHatch(s: string): { B: PercentSet[]; F: PercentSet[] } {
  const out = { B: [] as PercentSet[], F: [] as PercentSet[] };
  for (const tok of s.split(" ")) {
    const m = /^([BF])(\d+)x(\d+)@(\d+)$/.exec(tok)!;
    out[m[1] as "B" | "F"].push(...sets(Number(m[2]), Number(m[3]), Number(m[4]) / 100));
  }
  return out;
}

// [week][day], straight from the sheet's Program tab (back and front squat alternate in this order)
const HATCH: string[][] = [
  ["B1x10@60 F1x5@60 B1x8@70 F1x5@70 B1x6@75 F1x5@70 B1x4@80 F1x5@70", "B1x10@60 F1x5@60 B1x8@65 F1x5@65 B1x8@70 F1x5@70 B1x8@75 F1x5@70"],
  ["B1x10@60 F1x5@60 B1x8@65 F1x5@70 B1x6@70 F1x5@75 B1x6@75 F1x5@75 B1x6@80", "B1x10@60 F1x5@60 B1x8@70 F1x5@65 B1x8@75 F1x5@70 B1x8@80 F1x5@70"],
  ["B1x8@65 F1x5@60 B1x8@70 F1x5@70 B1x6@80 F1x5@75 B1x6@85 F1x5@80", "B1x10@60 F1x5@60 B1x10@65 F1x5@65 B1x8@70 F1x5@70 B1x8@75 F1x5@70"],
  ["B1x8@65 F1x5@70 B1x8@70 F1x5@75 B1x6@80 F1x5@80 B1x6@85 F1x5@85", "B1x8@65 F1x5@60 B1x8@70 F1x5@65 B1x8@75 F1x5@70 B1x8@80 F1x5@70"],
  ["B1x8@65 F1x5@70 B1x6@75 F1x4@80 B1x4@85 F1x3@85 B1x4@90 F1x3@90", "B1x6@65 F1x5@60 B1x6@75 F1x5@65 B1x6@80 F1x5@70 B1x6@80 F1x5@70"],
  ["B1x6@70 F1x5@65 B1x6@80 F1x4@75 B1x3@90 F1x4@80 B1x2@95 F1x4@80", "B1x4@75 F1x5@60 B1x4@80 F1x5@65 B1x4@80 F1x5@70 B1x4@80 F1x5@70"],
  ["B1x5@70 F1x5@65 B1x5@80 F1x4@75 B1x2@85 F1x4@80 B1x3@90 F1x4@85 B1x1@100", "B1x4@70 F1x5@60 B1x4@75 F1x5@65 B1x4@80 F1x5@70 B1x4@85 F1x5@70"],
  ["B1x5@65 F1x5@60 B1x5@70 F1x5@65 B1x5@75 F1x5@65 B1x5@80 F1x5@65", "B2x5@65 F4x5@60 B3x5@70"],
  ["B1x5@60 F1x5@65 B1x3@70 F1x4@75 B1x2@80 F1x4@80 B1x2@90 F1x4@85 B1x1@95", "B1x5@65 F4x5@65 B3x5@75"],
  ["B1x5@60 F1x5@60 B1x5@65 F1x5@65 B1x5@70 F1x5@70 B1x5@75 F1x5@70", "B1x5@60 F1x5@60 B1x5@65 F1x5@65 B1x5@70 F1x5@70 B1x5@75 F1x5@70"],
  ["B1x5@60 F1x5@60 B1x3@70 F1x5@70 B1x2@80 F1x5@75 B1x2@90 F1x5@75 B1x1@95 B1x1@103", "B1x5@60 F1x5@60 B1x5@65 F1x5@70 B1x5@70 F1x5@75 B1x5@70 F1x5@80"],
  ["B1x5@60 F1x5@65 B1x5@70 F1x5@70 B1x5@75 F1x5@75 B1x5@75", "B1x5@60 F1x5@60 B1x5@70 F1x5@70 B1x5@75 F1x5@75 B1x5@75"],
];

export const hatchSquat: ProgramTemplate = {
  id: "hatch-squat",
  name: "Hatch Squat Program",
  author: "Gayle Hatch",
  source: "hatchsquat.com · LiftVault \"Hatch Squat Program\" sheet",
  summary: "The weightlifting coach's 12-week squat cycle: back squat pyramids and front squat sets twice a week, peaking with a 103% back squat single in week 11.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [2],
  weeks: 12,
  then: { when: "After week 12, retest both squats and either run it again from the new maxes or move to a general program." },
  options: [],
  build() {
    const parsed = HATCH.map((wk) => wk.map(parseHatch));
    const day = (d: number): DayDef => ({
      id: `D${d + 1}`, name: `Day ${d + 1}`,
      slots: [
        pctSlot(`hatch-d${d + 1}-bs`, "squat", "MAIN", parsed.map((wk) => wk[d].B), "alternate with the front squat sets"),
        pctSlot(`hatch-d${d + 1}-fs`, "frontSquat", "MAIN", parsed.map((wk) => wk[d].F), "% of your front squat max"),
      ],
    });
    return {
      templateId: "hatch-squat",
      name: "Hatch Squat",
      sessionsPerWeek: 2,
      maxLabel: "1RM",
      days: [day(0), day(1)],
      cycle: { weeks: 12, finite: true, weekNames: Array.from({ length: 12 }, (_, w) => (w === 10 ? "Week 11 · 103% single" : `Week ${w + 1}`)) },
      notes: [
        "Enter your back squat and front squat 1RMs; each lift runs off its own max.",
        "Alternate: a back squat set, then a front squat set, down the pyramid as the weight climbs.",
        "Week 11 day 1 ends with a single at 103% of your back squat max: a true max attempt.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { squat: toUnit(405, unit), frontSquat: toUnit(315, unit) }, startWeights: {} };
  },
};

// ───────────────────────── Korte 3×3 ─────────────────────────

const P1 = [0.58, 0.6, 0.62, 0.64];
const HEAVY = [0.8, 0.85, 0.9, 0.95];
const LIGHT = 0.6;

export const korte: ProgramTemplate = {
  id: "korte-3x3",
  name: "Korte 3×3",
  author: "Stephan Korte",
  source: "LiftVault \"Korte 3x3 Powerlifting Program\" sheet",
  summary: "All three lifts three days a week for eight weeks: four weeks of high-volume fives and sixes around 60%, then four weeks of heavy singles building to 95% of a projected max.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 8,
  then: { when: "After week 8, test your maxes. The projected max is 5% over the 1RM you started with; if you hit it, run it again from there." },
  options: [],
  build() {
    // phase 2: which lift does the heavy singles on each day; the others do 5×4 (bench) / 3×3 at 60%
    const heavy = ["deadlift", "bench", "squat"];
    const day = (d: number, name: string): DayDef => ({
      id: name.slice(0, 3).toUpperCase(), name,
      slots: (["bench", "squat", "deadlift"] as const).map((lift) => {
        const vol = lift === "bench" ? sets(6, 6, 0) : sets(5, 5, 0);
        const p1 = P1.map((p) => vol.map((s) => ({ ...s, pct: p })));
        const p2 = HEAVY.map((h) => (heavy[d] === lift ? sets(2, 1, h) : lift === "bench" ? sets(5, 4, LIGHT) : sets(3, 3, LIGHT)));
        return pctSlot(`korte-${d + 1}-${lift}`, lift, "MAIN", [...p1, ...p2], lift === "bench" ? "weeks 1–4: 6–8 sets" : "weeks 1–4: 5–8 sets");
      }),
    });
    return {
      templateId: "korte-3x3",
      name: "Korte 3×3",
      sessionsPerWeek: 3,
      maxLabel: "Projected max (1RM + 5%)",
      days: [day(0, "Monday"), day(1, "Wednesday"), day(2, "Friday")],
      cycle: { weeks: 8, finite: true, weekNames: ["Volume · Week 1", "Volume · Week 2", "Volume · Week 3", "Volume · Week 4", "Intensity · Week 5", "Intensity · Week 6", "Intensity · Week 7", "Intensity · Week 8"] },
      notes: [
        "Enter a projected max for each lift: your current 1RM + 5% (a 400 squat → 420). Phase 1 runs 58–64% of it, phase 2 builds singles from 80% to 95%.",
        "Phase 1: same workout Monday, Wednesday and Friday. Bench 6–8 sets of 6, squat and deadlift 5–8 sets of 5; the minimum is listed, add sets up to 8 as recovery allows.",
        "Phase 2: one lift a day does two heavy singles (deadlift Monday, bench Wednesday, squat Friday); the rest is 5×4 bench or 3×3 at 60%. Korte says the peaking half can be swapped for your own taper.",
      ],
    };
  },
  defaults(unit) {
    // the sheet's example: 1RMs 405 / 290 / 450 → projected 426 / 305 / 473
    return { trainingMaxes: { squat: toUnit(426, unit), bench: toUnit(305, unit), deadlift: toUnit(473, unit) }, startWeights: {} };
  },
};

// ───────────────────────── Ed Coan peaking ─────────────────────────

/** [sets, reps, % of current max] per week */
const COAN1: [number, number, number][] = [[2, 10, 70.4], [2, 10, 70.4], [2, 8, 74.1], [2, 8, 77.7], [2, 5, 81.5], [2, 5, 85.2], [2, 5, 88.9], [2, 3, 92.6], [2, 3, 96.3], [2, 2, 100], [2, 2, 103.7], [1, 1, 111.1]];
const COAN2: [number, number, number][] = [[2, 10, 66.7], [2, 10, 66.7], [2, 8, 70.4], [2, 8, 74.1], [2, 5, 77.8], [2, 5, 81.5], [2, 5, 85.2], [2, 5, 88.9], [2, 3, 92.6], [2, 3, 96.3], [2, 2, 100], [2, 2, 103.7], [1, 1, 107.4], [1, 1, 111.1]];
const LIFT_NAME: Record<string, string> = { squat: "Squat", bench: "Bench", deadlift: "Deadlift" };

function coan(id: string, label: string, table: [number, number, number][]): ProgramTemplate {
  const n = table.length;
  return {
    id,
    name: `Ed Coan Peaking (${n} Weeks)`,
    author: "Ed Coan",
    source: `LiftVault "Ed Coan Peaking Program ${label}" sheet (The WeighTrainer)`,
    summary: `A ${n}-week ladder for one lift or all three: two work sets a week, tens down to a single, finishing about 11% above your current max.`,
    category: "peaking",
    level: "intermediate",
    daysPerWeek: [1, 3],
    weeks: n,
    then: { when: "Take the new max into your next program; don't run the ladder back to back." },
    options: [
      { key: "lift", label: "Lift", default: "all", choices: [
        { value: "all", label: "All three (one day each)" }, { value: "squat", label: "Squat" }, { value: "bench", label: "Bench press" }, { value: "deadlift", label: "Deadlift" },
      ] },
    ],
    build(o) {
      const which = o.lift && o.lift !== "all" ? [o.lift] : ["squat", "bench", "deadlift"];
      const weeks = table.map(([s, r, p]) => sets(s, r, p / 100));
      return {
        templateId: id,
        name: `Ed Coan ${n}-Week Peak`,
        sessionsPerWeek: which.length,
        maxLabel: "1RM",
        days: which.map((lift) => ({ id: lift.slice(0, 2).toUpperCase(), name: `${LIFT_NAME[lift]} day`, slots: [pctSlot(`coan${n}-${lift}`, lift, "MAIN", weeks)] })),
        cycle: { weeks: n, finite: true, weekNames: Array.from({ length: n }, (_, w) => (w === n - 1 ? `Week ${n} · max` : `Week ${w + 1}`)) },
        notes: [
          "Enter your current max, not a goal: the percentages go past 100% on purpose and end with a single at 111%.",
          "Warm up as you see fit. No assistance is prescribed; keep it light as the singles get close.",
        ],
      };
    },
    defaults(unit) {
      return { trainingMaxes: { squat: toUnit(405, unit), bench: toUnit(275, unit), deadlift: toUnit(455, unit) }, startWeights: {} };
    },
  };
}

export const coan12 = coan("coan-peak-12", "#1", COAN1);
export const coan14 = coan("coan-peak-14", "#2", COAN2);

// ───────────────────────── Russian Bench ─────────────────────────

/** [day][week] */
const RB: PercentSet[][][] = [
  [sets(6, 2, 0.8), sets(6, 4, 0.8), sets(6, 2, 0.8), sets(5, 5, 0.85), sets(6, 2, 0.8), sets(2, 2, 1.0)],
  [sets(6, 3, 0.8), sets(6, 2, 0.8), sets(6, 6, 0.8), sets(6, 2, 0.8), sets(3, 3, 0.95), sets(6, 2, 0.8)],
  [sets(6, 2, 0.8), sets(6, 5, 0.8), sets(6, 2, 0.8), sets(4, 4, 0.9), sets(6, 2, 0.8), sets(1, 1, 1.05)],
];

export const russianBench: ProgramTemplate = {
  id: "russian-bench",
  name: "Russian Bench Peaking",
  author: "LiftVault (Kyle Risley), after the Russian squat routine",
  source: "LiftVault \"6 Week Russian Bench Press Peaking Program\" sheet",
  summary: "The Russian squat routine's grid applied to the bench: 6×2 @ 80% days around a volume ramp to 6×6, then 5×5 → 2×2 at 85–100% and a 105% single.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 6,
  then: { when: "Don't repeat it back to back: take the new max into a general program for a while." },
  options: [],
  build() {
    return {
      templateId: "russian-bench",
      name: "Russian Bench",
      sessionsPerWeek: 3,
      maxLabel: "1RM",
      days: RB.map((weeks, d) => ({ id: `D${d + 1}`, name: `Day ${d + 1}`, slots: [pctSlot(`rb-d${d + 1}`, "bench", "MAIN", weeks)] })),
      cycle: { weeks: 6, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4 · intensity", "Week 5", "Week 6 · test"] },
      notes: [
        "Percentages are of your starting bench 1RM; don't overestimate it, or weeks 5 and 6 get very hard.",
        "Straight sets: every set in a session uses the same weight. Accessories are fine in weeks 1–3; keep them minimal after that, and skip bench variations.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { bench: toUnit(225, unit) }, startWeights: {} };
  },
};

export const PEAKING_CLASSICS = [hatchSquat, korte, coan12, coan14, russianBench];
