// GZCL programs beyond GZCLP, all by Cody Lefever (u/GZCL).
//
// Jacked & Tan 2.0 (12 weeks), from Cody's blog post (swoleateveryheight.blogspot.com/2016/07/
// jacked-tan-20.html). Every number below comes from that post:
//   T1   work up to a rep max, then drop sets. Block 1 drop sets are % of TM:
//        10RM, 70%×6×3+ · 8RM, 75%×5×3+ · 6RM, 80%×4×3+ · 4RM, 82.5%×3×3+ · 2RM, 85%×2×4+ ·
//        wk 6 1RM (it should be a confident double). Block 2 drop sets are % of THAT DAY'S RM:
//        6RM, 85%×3×5+ · 4RM, 85%×2×5+ · 2RM, 85%×1×5+ · 5RM, 90%×2×3+ · 3RM, 90%×1×3+ · wk 12 1RM.
//   T2a  % of TM: 4×10@50, 4×8@60, 4×6@70, 5×4@75, 7×2@80, off, 5×6@70, 5×5@75, 5×4@80,
//        6×3@82.5, 7×2@85, off. The post says TM is recalculated from the week-6 1RM.
//   T2b  find an RM then 3 max-rep sets (MRS) at that weight: 15/12/10/8/6RM, rest, 15/12/10/6RM, rest, rest.
//   T3   RM + 3 MRS: 20/18/16/14/12/10RM, rest, 18/16/14/12RM, rest.
// Modelling: RM sets are RPE 9 (the r/gzcl wiki: "1–2 reps in the tank"). Block-2 drop sets use
// `ofTop`, whose pct is of the top set's e1RM (w × (1 + r/30)), so 85% of a 6RM is 0.85 / 1.2.
// The 1RM tests are their own days in weeks 6 and 12 and set TM = 90% of the single. That
// TM definition is ours, because the post never gives one. T2b/T3 RMs change every week, so
// they're fixed slots with the targets in the week label. The week-6 T3 10RM work is left off
// the test day. Exercise picks follow Liftosaur's layout. The post leaves selection to the lifter.
//
// The Rippler (12 weeks). The r/gzcl wiki gives weeks 1–4 of Cody's write-up:
//   T1 (% of a 2RM TM): 85%×5×3, 90%×3×4+, 87.5%×4×3, 92.5%×2×5. Two weeks up 5%, one week down 2.5%.
//   T2 (% of a 5RM TM for that movement): 80%×6×5, 85%×5×5, 90%×4×5+, 82.5%×6×4.
// Weeks 5–12 are RECONSTRUCTED from Liftosaur's 12-week version, which lists % of 1RM.
// Converted back (2RM ≈ 94% and 5RM ≈ 86% of 1RM), it matches weeks 1–4 exactly and continues
// the same pattern. T2 is off in weeks 11–12. T3 is 5×10+ (Cody's Boostcamp week 1).
//
// The GZCL Method (4-week wave), from "The GZCL Method, Simplified" (blog, 2014). Goal weight is
// an everyday 2–3RM. The post works squat and bench days:
//   Squat  T1 3×5@85, 4×3@90, 3@87.5 + 2×2@92.5 + 3×1@97.5, retest 3@90 · 2@95 · 1+@100.
//          T2 front squat 4×8@65, 5×6@70, 5×5@75, 5×4@80.
//   Bench  T1 5×3@85, 5×2@90, 5×3@87.5, retest as squat. T2 decline 5×6@65, 4×5@75, 5×6@70, 4×5@80.
//   After the retest: 2 reps on the 100% set → +5 lb, 3 → +10, 4+ → +15.
// Deadlift and OHP get the squat and bench waves. Their T2 and T3 picks are ours, taken from
// Cody's lists in the same post.

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, TmRule } from "../program";
import type { Unit } from "../units";

const conv = (unit: Unit) => (v: number) => (unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5);
const convAll = (unit: Unit, o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, conv(unit)(v)]));

/** n sets of `reps` at pct (0–1), last set AMRAP if `plus`. */
const S = (pct: number, reps: number, n: number, plus = false): PercentSet[] =>
  Array.from({ length: n }, (_, i) => ({ pct, reps, amrap: plus && i === n - 1 }));
const rm = (reps: number): PercentSet => ({ rpe: 9, reps });
/** drop sets at `frac` of the day's `rmReps`RM, as a fraction of that set's e1RM */
const ofRm = (frac: number, rmReps: number, reps: number, n: number): PercentSet[] =>
  Array.from({ length: n }, (_, i) => ({ pct: Math.round((frac / (1 + rmReps / 30)) * 1000) / 1000, ofTop: true, reps, amrap: i === n - 1 }));

const pctSlot = (id: string, tier: Tier, lift: string, tmLift: string, weeks: PercentSet[][], tmRule?: TmRule, note?: string): SlotDef => ({
  id, tier, lift, note, progression: { kind: "percent", tmLift, weeks, tmRule },
});
const fixed = (id: string, tier: Tier, lift: string, sets: number, reps: number, repsMax?: number, note?: string): SlotDef => ({
  id, tier, lift, progression: { kind: "fixed", sets, reps, repsMax, note },
});

// ───────────────────────── Jacked & Tan 2.0 ─────────────────────────

const JNT_T1: PercentSet[][] = [
  [rm(10), ...S(0.7, 6, 3, true)],
  [rm(8), ...S(0.75, 5, 3, true)],
  [rm(6), ...S(0.8, 4, 3, true)],
  [rm(4), ...S(0.825, 3, 3, true)],
  [rm(2), ...S(0.85, 2, 4, true)],
  [], // week 6: 1RM test day
  [rm(6), ...ofRm(0.85, 6, 3, 5)],
  [rm(4), ...ofRm(0.85, 4, 2, 5)],
  [rm(2), ...ofRm(0.85, 2, 1, 5)],
  [rm(5), ...ofRm(0.9, 5, 2, 3)],
  [rm(3), ...ofRm(0.9, 3, 1, 3)],
  [], // week 12: 1RM test day
];
const JNT_T2A: PercentSet[][] = [
  S(0.5, 10, 4), S(0.6, 8, 4), S(0.7, 6, 4), S(0.75, 4, 5), S(0.8, 2, 7), [],
  S(0.7, 6, 5), S(0.75, 5, 5), S(0.8, 4, 5), S(0.825, 3, 6), S(0.85, 2, 7), [],
];
const JNT_TEST: PercentSet[][] = Array.from({ length: 12 }, () => [{ rpe: 9, reps: 1 }]);
const JNT_WEEKS = [
  "Wk 1 · T1 10RM · T2b 15RM · T3 20RM",
  "Wk 2 · T1 8RM · T2b 12RM · T3 18RM",
  "Wk 3 · T1 6RM · T2b 10RM · T3 16RM",
  "Wk 4 · T1 4RM · T2b 8RM · T3 14RM",
  "Wk 5 · T1 2RM · T2b 6RM · T3 12RM",
  "Wk 6 · 1RM test",
  "Wk 7 · T1 6RM, drops 85% of it · T2b 15RM · T3 off",
  "Wk 8 · T1 4RM, drops 85% of it · T2b 12RM · T3 18RM",
  "Wk 9 · T1 2RM, drops 85% of it · T2b 10RM · T3 16RM",
  "Wk 10 · T1 5RM, drops 90% of it · T2b 6RM · T3 14RM",
  "Wk 11 · T1 3RM, drops 90% of it · T2b off · T3 12RM",
  "Wk 12 · 1RM test",
];
const MAIN_WEEKS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10];
const MRS = "work up to this week's RM (see week), then 3 max-rep sets at that weight, 1–2 in the tank";
const t2b = (id: string, lift: string) => fixed(id, "T2", lift, 4, 6, 15, MRS);
const t3 = (id: string, lift: string) => fixed(id, "T3", lift, 4, 10, 20, MRS);

export const gzclJnt2: ProgramTemplate = {
  id: "gzcl-jnt2",
  name: "Jacked & Tan 2.0",
  author: "Cody Lefever (GZCL)",
  source: "Cody's blog post 'Jacked & Tan 2.0' (swoleateveryheight.blogspot.com, 2016); exercise picks from Liftosaur",
  summary: "12-week powerbuilding block. Each T1 works up to a rep max and then does drop sets. Volume tapers into heavier work, with 1RM tests in weeks 6 and 12.",
  category: "gzcl",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 12,
  options: [],
  build() {
    const day = (n: number, name: string, t1: string, slots: SlotDef[]): DayDef[] => [
      { id: `D${n}`, name: `Day ${n} · ${name}`, weeks: MAIN_WEEKS, slots: [pctSlot(`d${n}-t1`, "T1", t1, t1, JNT_T1), ...slots] },
      { id: `D${n}-test`, name: `Day ${n} · ${name} 1RM test`, weeks: [5, 11], slots: [pctSlot(`d${n}-test`, "T1", t1, t1, JNT_TEST, { type: "e1rm", setIndex: 0, pct: 0.9 }, "work up to a 1RM you could nearly double. New TM = 90% of it")] },
    ];
    const days = [
      ...day(1, "Squat", "squat", [pctSlot("d1-t2a", "T2", "deficitDeadlift", "deadlift", JNT_T2A), t2b("d1-t2b", "chestSupportedRow"), t3("d1-t3a", "tricepPushdown"), t3("d1-t3b", "hammerCurl")]),
      ...day(2, "Bench", "bench", [pctSlot("d2-t2a", "T2", "cgBench", "bench", JNT_T2A), t2b("d2-t2b", "dbOhp"), t3("d2-t3a", "shrug"), t3("d2-t3b", "facePull")]),
      ...day(3, "Deadlift", "deadlift", [pctSlot("d3-t2a", "T2", "frontSquat", "frontSquat", JNT_T2A), t2b("d3-t2b", "latPulldown"), t3("d3-t3a", "legExtension"), t3("d3-t3b", "bicepCurl")]),
      ...day(4, "OHP", "ohp", [pctSlot("d4-t2a", "T2", "inclineBench", "inclineBench", JNT_T2A), t2b("d4-t2b", "dbRow"), t3("d4-t3a", "overheadTricep"), t3("d4-t3b", "lateralRaise")]),
    ];
    // Weekly order: D1 D2 D3 D4 in main weeks, the test days in weeks 6 and 12.
    const order = ["D1", "D1-test", "D2", "D2-test", "D3", "D3-test", "D4", "D4-test"];
    return {
      templateId: "gzcl-jnt2",
      name: "Jacked & Tan 2.0",
      sessionsPerWeek: 4,
      days: order.map((id) => days.find((d) => d.id === id)!),
      cycle: { weeks: 12, finite: true, weekNames: JNT_WEEKS },
      maxLabel: "Training max",
      notes: [
        "T1: work up to the week's rep max (1–2 reps in the tank), then the drop sets. The last drop set is a rep-out.",
        "Weeks 1–5 drop sets are % of TM. Weeks 7–11 drop sets are % of the RM you just hit (shown as % of top).",
        "Weeks 6 and 12: test a 1RM that should be a confident double. Week 6 resets the TM for block 2.",
        "T2b/T3: find the RM in the week label, then 3 max-rep sets at that weight with short rest.",
        "An optional 5th day (accessories, or a T1 variation such as slingshot bench) is up to you.",
      ],
    };
  },
  defaults(unit: Unit) {
    // TM ≈ 90% of 1RM for a 315/225/405/145 lifter.
    return {
      trainingMaxes: convAll(unit, { squat: 285, bench: 205, deadlift: 365, ohp: 130, frontSquat: 225, inclineBench: 165 }),
      startWeights: convAll(unit, {
        "d1-t2b": 50, "d1-t3a": 50, "d1-t3b": 30, "d2-t2b": 50, "d2-t3a": 70, "d2-t3b": 40,
        "d3-t2b": 120, "d3-t3a": 90, "d3-t3b": 30, "d4-t2b": 70, "d4-t3a": 40, "d4-t3b": 20,
      }),
    };
  },
};

// ───────────────────────── The Rippler ─────────────────────────

const RIP_T1: PercentSet[][] = [
  S(0.85, 5, 3), S(0.9, 3, 4, true), S(0.875, 4, 3), S(0.925, 2, 5),
  S(0.9, 4, 3, true), S(0.95, 2, 4), S(0.925, 3, 3), S(0.975, 1, 9, true),
  S(0.95, 2, 3, true), S(1, 1, 1), S(0.9, 2, 4, true), [{ rpe: 10, reps: 1 }],
];
const RIP_T2: PercentSet[][] = [
  S(0.8, 6, 5), S(0.85, 5, 5), S(0.9, 4, 5, true), S(0.825, 6, 4),
  S(0.875, 5, 4), S(0.925, 4, 4, true), S(0.85, 6, 3), S(0.9, 5, 3),
  S(0.95, 4, 3, true), S(1, 3, 5, true), [], [],
];
const rip = (id: string, tier: Tier, lift: string) => pctSlot(id, tier, lift, lift, tier === "T1" ? RIP_T1 : RIP_T2);
const rt3 = (id: string, lift: string) => fixed(id, "T3", lift, 5, 10, undefined, "10+ every set (max-rep sets, short rest)");

export const gzclRippler: ProgramTemplate = {
  id: "gzcl-rippler",
  name: "The Rippler",
  author: "Cody Lefever (GZCL)",
  source: "r/gzcl wiki 'The Rippler' (weeks 1–4); weeks 5–12 reconstructed from Liftosaur's 12-week version (converted from % of 1RM)",
  summary: "12-week upper/lower split. T1 intensity goes two weeks up and one week down. T2 runs three-week linear waves. Lower reps and higher intensity than Jacked & Tan.",
  category: "gzcl",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 12,
  options: [],
  build() {
    return {
      templateId: "gzcl-rippler",
      name: "The Rippler",
      sessionsPerWeek: 4,
      days: [
        { id: "1", name: "Day 1 · Bench", slots: [rip("d1-t1", "T1", "bench"), rip("d1-t2", "T2", "inclineBench"), rt3("d1-t3a", "dbOhp"), rt3("d1-t3b", "lateralRaise")] },
        { id: "2", name: "Day 2 · Squat", slots: [rip("d2-t1", "T1", "squat"), rip("d2-t2", "T2", "stiffLegDeadlift"), rt3("d2-t3a", "pullUp"), rt3("d2-t3b", "bicepCurl")] },
        { id: "3", name: "Day 3 · OHP", slots: [rip("d3-t1", "T1", "ohp"), rip("d3-t2", "T2", "cgBench"), rt3("d3-t3a", "dbInclineBench"), rt3("d3-t3b", "pullover")] },
        { id: "4", name: "Day 4 · Deadlift", slots: [rip("d4-t1", "T1", "deadlift"), rip("d4-t2", "T2", "frontSquat"), rt3("d4-t3a", "row"), rt3("d4-t3b", "rearDeltFly")] },
      ],
      cycle: {
        weeks: 12, finite: true,
        weekNames: ["Wk 1", "Wk 2 · AMRAP T1", "Wk 3 · down week, AMRAP T2", "Wk 4 · recovery", "Wk 5", "Wk 6", "Wk 7", "Wk 8", "Wk 9", "Wk 10", "Wk 11 · no T2", "Wk 12 · test 1RM, no T2"],
      },
      maxLabel: "TM (T1 = 2RM, T2 = 5RM)",
      notes: [
        "Each movement has its own TM: a 2RM for the T1 lifts, a 5RM for the T2 lifts.",
        "AMRAPs leave 1–2 reps in the tank.",
        "Week 12: work up to a new 1RM. Go easy on the cycle-2 TMs.",
      ],
    };
  },
  defaults(unit: Unit) {
    // 2RM ≈ 94% and 5RM ≈ 86% of 1RM (squat 315, bench 225, deadlift 405, OHP 145).
    return {
      trainingMaxes: convAll(unit, { squat: 295, bench: 210, deadlift: 380, ohp: 135, inclineBench: 160, stiffLegDeadlift: 255, cgBench: 175, frontSquat: 215 }),
      startWeights: convAll(unit, { "d1-t3a": 40, "d1-t3b": 20, "d2-t3a": 0, "d2-t3b": 30, "d3-t3a": 50, "d3-t3b": 40, "d4-t3a": 135, "d4-t3b": 15 }),
    };
  },
};

// ───────────────────────── The GZCL Method ─────────────────────────

const RETEST = [{ pct: 0.9, reps: 3 }, { pct: 0.95, reps: 2 }, { pct: 1, reps: 1, amrap: true }];
const LOWER_T1: PercentSet[][] = [S(0.85, 5, 3), S(0.9, 3, 4), [...S(0.875, 3, 1), ...S(0.925, 2, 2), ...S(0.975, 1, 3)], RETEST];
const UPPER_T1: PercentSet[][] = [S(0.85, 3, 5), S(0.9, 2, 5), S(0.875, 3, 5), RETEST];
const LOWER_T2: PercentSet[][] = [S(0.65, 8, 4), S(0.7, 6, 5), S(0.75, 5, 5), S(0.8, 4, 5)];
const UPPER_T2: PercentSet[][] = [S(0.65, 6, 5), S(0.75, 5, 4), S(0.7, 6, 5), S(0.8, 5, 4)];
// Retest: reps on the 100% set − 1 → TM increments (2 reps +5, 3 +10, 4+ +15 lb). The set is
// index 2. `allSets` takes the fewest reps among sets at that weight or heavier, so a 6 on one
// set of 3×5 doesn't count as beating the target.
const RETEST_RULE: TmRule = { type: "amrapVsTarget", setIndex: 2, allSets: true, table: [{ diff: -99, increments: 0 }, { diff: 1, increments: 1 }, { diff: 2, increments: 2 }, { diff: 3, increments: 3 }] };
const mt1 = (id: string, lift: string, weeks: PercentSet[][]) => pctSlot(id, "T1", lift, lift, weeks, RETEST_RULE);
const mt3 = (id: string, lift: string, reps = 12) => fixed(id, "T3", lift, 3, reps);

export const gzclMethod: ProgramTemplate = {
  id: "gzcl-method",
  name: "The GZCL Method",
  author: "Cody Lefever (GZCL)",
  source: "Cody's blog post 'The GZCL Method, Simplified' (2014), squat and bench examples; r/gzcl wiki tier guidelines",
  summary: "The original 4-day tier template. Heavy T1 waves at 85–100% of an everyday 2–3RM, a T2 at 65–80%, and fixed T3 work. Week 4 retests and sets next cycle's goal weight.",
  category: "gzcl",
  level: "intermediate",
  daysPerWeek: [4],
  options: [],
  build() {
    const tmIncrement = Object.fromEntries(["squat", "bench", "deadlift", "ohp"].map((l) => [l, { lb: 5, kg: 2.5 }]));
    return {
      templateId: "gzcl-method",
      name: "The GZCL Method",
      sessionsPerWeek: 4,
      tmIncrement,
      days: [
        { id: "1", name: "Day 1 · Squat", slots: [mt1("d1-t1", "squat", LOWER_T1), pctSlot("d1-t2", "T2", "frontSquat", "squat", LOWER_T2), mt3("d1-t3a", "legCurl"), mt3("d1-t3b", "legExtension"), mt3("d1-t3c", "calfRaise", 15)] },
        { id: "2", name: "Day 2 · Bench", slots: [mt1("d2-t1", "bench", UPPER_T1), pctSlot("d2-t2", "T2", "declineBench", "bench", UPPER_T2), fixed("d2-t2b", "T2", "row", 5, 5, 6, "post: 135 · 145 · 140 · 150 lb across the wave"), mt3("d2-t3a", "dip"), fixed("d2-t3b", "T3", "cableRow", 3, 15), mt3("d2-t3c", "overheadTricep"), mt3("d2-t3d", "bicepCurl")] },
        { id: "3", name: "Day 3 · Deadlift", slots: [mt1("d3-t1", "deadlift", LOWER_T1), pctSlot("d3-t2", "T2", "deficitDeadlift", "deadlift", LOWER_T2), mt3("d3-t3a", "backExtension"), mt3("d3-t3b", "hangingLegRaise")] },
        { id: "4", name: "Day 4 · OHP", slots: [mt1("d4-t1", "ohp", UPPER_T1), pctSlot("d4-t2", "T2", "pushPress", "ohp", UPPER_T2), fixed("d4-t3a", "T3", "lateralRaise", 3, 15), fixed("d4-t3b", "T3", "facePull", 3, 15), mt3("d4-t3c", "tricepPushdown")] },
      ],
      cycle: { weeks: 4, weekNames: ["Wk 1", "Wk 2", "Wk 3", "Wk 4 · retest"] },
      maxLabel: "Goal weight (2–3RM)",
      notes: [
        "Goal weight is a 2–3RM you can hit on any day, not a perfect-day max.",
        "Week 4 retest: the reps on the 100% set raise next cycle's goal weight (2 → +5 lb, 3 → +10, 4+ → +15).",
        "T3 picks are a starting point. Choose 1–3 movements that fix your weak points.",
      ],
    };
  },
  defaults(unit: Unit) {
    return {
      trainingMaxes: convAll(unit, { squat: 290, bench: 205, deadlift: 370, ohp: 135 }),
      startWeights: convAll(unit, {
        "d1-t3a": 90, "d1-t3b": 100, "d1-t3c": 135, "d2-t2b": 135, "d2-t3a": 0, "d2-t3b": 100, "d2-t3c": 45, "d2-t3d": 45,
        "d3-t3a": 25, "d3-t3b": 0, "d4-t3a": 20, "d4-t3b": 40, "d4-t3c": 50,
      }),
      increments: {},
    };
  },
};

// ───────────────────────── VDIP ─────────────────────────
//
// Volume-Dependent Intensity Progression. Sources: Cody's VDIP tab ("GZCL Free
// Compendium November 27th Update.xlsx") and his blog post (2016/11). Every set is a max-rep set
// (MRS) left 1–2 reps short of failure, and next week's weight depends on the session's total reps:
//   T1 3 MRS: 15+ → +10 lb · 10–14 → +5 · under 10 → drop 5–10% (we use 5%)
//   T2 3 MRS: over 30 → +10 · 25–30 → +5 · 20–24 → same · under 20 → drop 5–10% (we use 5%)
//   T3 4 MRS: over 50 → +5 · otherwise stay
// Each slot's working weight is its "TM" (pct 1). Start T1 at about 85% and T2 at about 65% of
// an everyday 2RM. The 4 days follow the sheet's days 1–4. The sheet's day 5 (front squat T1,
// back squat T2) would share those lifts' working weights, so it's left out. Bodyweight T3s
// (pull-ups, dips) are fixed slots.

const vdip = (id: string, tier: Tier, lift: string): SlotDef => {
  const n = tier === "T3" ? 4 : 3;
  const reps = tier === "T1" ? 5 : tier === "T2" ? 10 : 13;
  const table =
    tier === "T1" ? [{ minReps: 0, pct: -0.05 }, { minReps: 10, increments: 1 }, { minReps: 15, increments: 2 }]
    : tier === "T2" ? [{ minReps: 0, pct: -0.05 }, { minReps: 20, increments: 0 }, { minReps: 25, increments: 1 }, { minReps: 31, increments: 2 }]
    : [{ minReps: 0, increments: 0 }, { minReps: 51, increments: 1 }];
  return {
    id, tier, lift, restSeconds: tier === "T1" ? 240 : tier === "T2" ? 150 : 60,
    note: "max-rep sets, 1–2 reps in the tank",
    progression: { kind: "percent", tmLift: lift, weeks: [Array.from({ length: n }, () => ({ pct: 1, reps, amrap: true }))], tmRule: { type: "totalReps", table } },
  };
};
const VDIP_LIFTS = { t1: ["squat", "bench", "deadlift", "ohp"], t2: ["stiffLegDeadlift", "pauseBench", "frontSquat", "pushPress"], t3: ["lunge", "cgBench", "dbOhp", "dbRow", "cableRow", "inclineBench"] };

export const gzclVdip: ProgramTemplate = {
  id: "gzcl-vdip",
  name: "VDIP",
  author: "Cody Lefever (GZCL)",
  source: "GZCL Free Compendium November 27th Update.xlsx (VDIP tab); Cody's blog post 'Volume-Dependent Intensity Progression' (2016)",
  summary: "Every set is a max-rep set at one weight. Your total reps decide next week's weight: more volume earns more load. Expect 4–6 weeks of progress before a deload and retest.",
  category: "gzcl",
  level: "advanced",
  daysPerWeek: [4],
  options: [],
  build() {
    const tmIncrement = Object.fromEntries([...VDIP_LIFTS.t1, ...VDIP_LIFTS.t2, ...VDIP_LIFTS.t3].map((l) => [l, { lb: 5, kg: 2.5 }]));
    return {
      templateId: "gzcl-vdip",
      name: "VDIP",
      sessionsPerWeek: 4,
      tmIncrement,
      maxLabel: "Working weight",
      days: [
        { id: "1", name: "Day 1 · Squat", slots: [vdip("d1-t1", "T1", "squat"), vdip("d1-t2", "T2", "stiffLegDeadlift"), vdip("d1-t3a", "T3", "lunge"), fixed("d1-t3b", "T3", "pullUp", 4, 10, undefined, "max-rep sets, 50+ total")] },
        { id: "2", name: "Day 2 · Bench", slots: [vdip("d2-t1", "T1", "bench"), vdip("d2-t2", "T2", "pauseBench"), vdip("d2-t3a", "T3", "cgBench"), vdip("d2-t3b", "T3", "dbOhp")] },
        { id: "3", name: "Day 3 · Deadlift", slots: [vdip("d3-t1", "T1", "deadlift"), vdip("d3-t2", "T2", "frontSquat"), vdip("d3-t3a", "T3", "dbRow"), vdip("d3-t3b", "T3", "cableRow")] },
        { id: "4", name: "Day 4 · OHP", slots: [vdip("d4-t1", "T1", "ohp"), vdip("d4-t2", "T2", "pushPress"), vdip("d4-t3a", "T3", "inclineBench"), fixed("d4-t3b", "T3", "dip", 4, 12, undefined, "max-rep sets, 50+ total")] },
      ],
      notes: [
        "Every set is a max-rep set at the same weight. Stop 1–2 reps short of failure, never grind.",
        "T1 3 sets: 15+ total → +10 lb, 10–14 → +5, under 10 → drop. T2 3 sets: 31+ → +10, 25–30 → +5, 20–24 → stay, under 20 → drop. T3 4 sets: 51+ → +5.",
        "Slow or ugly reps: repeat the weight even if you hit the number. After 4–6 weeks, deload and retest.",
        "Spoto press is logged as paused bench. Kroc rows as dumbbell rows.",
      ],
    };
  },
  defaults(unit: Unit) {
    return {
      trainingMaxes: convAll(unit, {
        squat: 250, bench: 180, deadlift: 325, ohp: 115,
        stiffLegDeadlift: 205, pauseBench: 125, frontSquat: 160, pushPress: 105,
        lunge: 95, cgBench: 115, dbOhp: 35, dbRow: 75, cableRow: 105, inclineBench: 115,
      }),
      startWeights: { "d1-t3b": 0, "d4-t3b": 0 },
    };
  },
};

export const gzclFamily: ProgramTemplate[] = [gzclJnt2, gzclRippler, gzclMethod, gzclVdip];
