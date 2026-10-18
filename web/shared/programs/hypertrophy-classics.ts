// Free hypertrophy programs, from LiftVault's write-ups of the original free posts / videos:
//
//   Dumbbell PPL        u/gregariousHermit, r/Fitness (LiftVault "Dumbbell PPL Program"). Dumbbells,
//                       a bench and a pull-up bar. Every exercise 3 sets, as many reps as possible
//                       capped at 12; at 3×12 add weight. Stuck at the same weight and reps for three
//                       sessions → about −10% and rebuild (not automated: double progression holds).
//   Dr. Swole PPLUL     Bill "Dr. Swole" Wong's free Moderate Volume program (YouTube / Boostcamp;
//                       LiftVault "Dr. Swole's PPLUL"). 8 weeks, 5 days, rep ranges with RPE rising
//                       from 7–8 (week 1) to 9–10 (weeks 3–8). Load moves when you top the range.
//   Bro Split           LiftVault's classic 5-day bro split example: chest/calves, back, legs,
//                       arms/calves, shoulders. Mostly descending pyramids (10, 8, 8, 6); the sheet has
//                       no progression rule, so these are "beat last time" slots.
//   Gironda 10-8-6-15   Vince Gironda's 10-8-6-15 (LiftVault sheet credited to Iron and Grit). Every
//                       exercise 10 @50%, 8 @75%, 6 @100%, 15 @35% of its 6-rep max; upper and lower
//                       days alternate. Raise an exercise's 6RM when the set of 6 gets easy.

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, Weights } from "../program";
import type { Unit } from "../units";

const kg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (unit: Unit, rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));
const INC: Weights = { lb: 5, kg: 2.5 };
const LEGS: Weights = { lb: 10, kg: 5 };
const dbl = (id: string, lift: string, sets: number, lo: number, hi: number, o: { tier?: Tier; inc?: Weights; amrap?: boolean; note?: string } = {}): SlotDef => ({
  id, lift, tier: o.tier ?? "ACC", note: o.note, progression: { kind: "double", sets, reps: [lo, hi], increment: o.inc ?? INC, amrapLast: o.amrap },
});
const fixed = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string, tier: Tier = "ACC"): SlotDef => ({
  id, lift, tier, progression: { kind: "fixed", sets, reps, repsMax, note },
});

// ───────────────────────── Dumbbell PPL ─────────────────────────

export const dumbbellPpl: ProgramTemplate = {
  id: "dumbbell-ppl",
  name: "Dumbbell PPL",
  author: "u/gregariousHermit (r/Fitness)",
  source: "r/Fitness post, as written up by LiftVault \"Dumbbell PPL Program\"",
  summary: "Push / pull / legs with just adjustable dumbbells, a bench and a pull-up bar: every exercise 3 sets to 12, add weight at 3×12.",
  category: "hypertrophy",
  level: "beginner",
  daysPerWeek: [3, 4, 5, 6],
  options: [{ key: "days", label: "Days per week", default: "6", choices: ["3", "4", "5", "6"].map((v) => ({ value: v, label: `${v} days` })) }],
  build(o) {
    const n = Number(o.days ?? 6);
    const amrap = { amrap: true, note: "as many reps as you can, up to 12" };
    const hlr = (d: string) => dbl(`dp-${d}-hlr`, "hangingLegRaise", 3, 8, 12, { ...amrap, note: "up to 12; then hold a dumbbell between your feet" });
    const days: DayDef[] = [
      { id: "PUSH", name: "Push", slots: [
        dbl("dp-push-press", "dbBench", 3, 8, 12, { tier: "MAIN", ...amrap }), dbl("dp-push-fly", "inclineFly", 3, 8, 12, amrap),
        dbl("dp-push-arnold", "arnoldPress", 3, 8, 12, amrap), dbl("dp-push-tri", "overheadTricep", 3, 8, 12, amrap), hlr("push"),
      ] },
      { id: "PULL", name: "Pull", slots: [
        dbl("dp-pull-pullup", "pullUp", 3, 8, 12, { tier: "MAIN", ...amrap, note: "up to 12; then hold a dumbbell between your feet" }), dbl("dp-pull-row", "dbRow", 3, 8, 12, amrap),
        dbl("dp-pull-rev", "rearDeltFly", 3, 8, 12, amrap), dbl("dp-pull-curl", "bicepCurl", 3, 8, 12, amrap), dbl("dp-pull-shrug", "shrug", 3, 8, 12, amrap), hlr("pull"),
      ] },
      { id: "LEGS", name: "Legs", slots: [
        dbl("dp-legs-goblet", "gobletSquat", 3, 8, 12, { tier: "MAIN", ...amrap }), dbl("dp-legs-lunge", "lunge", 3, 8, 12, { ...amrap, note: "per side, up to 12" }),
        dbl("dp-legs-rdl", "dbRdl", 3, 8, 12, { ...amrap, note: "single-leg, per side, up to 12" }), dbl("dp-legs-calf", "calfRaise", 3, 8, 12, amrap), hlr("legs"),
      ] },
    ];
    return {
      templateId: "dumbbell-ppl",
      name: `Dumbbell PPL ${n}-Day`,
      sessionsPerWeek: n,
      days,
      notes: [
        "Run push, pull, legs in order; six days is PPL PPL + a rest day, fewer days just keep cycling.",
        "Every exercise: 3 sets, as many reps as you can but stop at 12. Start with a weight you can do for 8+. At 12 on all three sets, add weight.",
        "Same weight and reps three sessions in a row: drop about 10% and build back up.",
        "Rest 90 seconds between sets; about 45 minutes a session.",
      ],
    };
  },
  defaults: (unit) => ({
    startWeights: conv(unit, {
      "dp-push-press": 40, "dp-push-fly": 20, "dp-push-arnold": 25, "dp-push-tri": 30, "dp-push-hlr": 0,
      "dp-pull-pullup": 0, "dp-pull-row": 40, "dp-pull-rev": 10, "dp-pull-curl": 20, "dp-pull-shrug": 50, "dp-pull-hlr": 0,
      "dp-legs-goblet": 50, "dp-legs-lunge": 25, "dp-legs-rdl": 30, "dp-legs-calf": 40, "dp-legs-hlr": 0,
    }),
    trainingMaxes: {},
  }),
};

// ───────────────────────── Dr. Swole PPLUL ─────────────────────────

export const drSwolePplul: ProgramTemplate = {
  id: "dr-swole-pplul",
  name: "Dr. Swole PPLUL",
  author: "Bill \"Dr. Swole\" Wong",
  source: "Dr. Swole's free PPLUL (Moderate Volume), as written up by LiftVault",
  summary: "Pull, push, legs, upper, lower over five days for eight weeks: rep ranges on every lift, pushed from RPE 7–8 in week 1 to 9–10 from week 3.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [5],
  weeks: 8,
  then: { when: "After eight weeks, take an easy week and run it again; move up to the higher-volume version only if you recovered well." },
  options: [],
  build() {
    const big = { tier: "MAIN" as Tier };
    return {
      templateId: "dr-swole-pplul",
      name: "Dr. Swole PPLUL",
      sessionsPerWeek: 5,
      days: [
        { id: "PULL", name: "Pull", slots: [
          dbl("ds-pull-row", "row", 4, 6, 10, big), dbl("ds-pull-pd", "latPulldown", 3, 8, 12), dbl("ds-pull-crow", "cableRow", 3, 10, 15),
          dbl("ds-pull-hammer", "hammerCurl", 3, 8, 12), dbl("ds-pull-ccurl", "bicepCurl", 3, 10, 15, { note: "cable curl" }), dbl("ds-pull-upright", "uprightRow", 3, 8, 12),
        ] },
        { id: "PUSH", name: "Push", slots: [
          dbl("ds-push-bench", "bench", 4, 5, 8, big), dbl("ds-push-incline", "dbInclineBench", 3, 6, 10), dbl("ds-push-skull", "skullcrusher", 3, 8, 12),
          dbl("ds-push-pushdown", "tricepPushdown", 3, 10, 15), dbl("ds-push-lat", "lateralRaise", 3, 8, 12), dbl("ds-push-clat", "lateralRaise", 3, 10, 15, { note: "cable lateral raise" }),
        ] },
        { id: "LEGS", name: "Legs", slots: [
          dbl("ds-legs-squat", "squat", 4, 5, 8, { ...big, inc: LEGS }), dbl("ds-legs-rdl", "rdl", 3, 6, 10, { inc: LEGS }), dbl("ds-legs-press", "legPress", 3, 8, 12, { inc: LEGS }),
          dbl("ds-legs-lunge", "lunge", 3, 8, 12), dbl("ds-legs-calf", "calfRaise", 5, 8, 12), fixed("ds-legs-abs", "crunch", 3, 10, 15, "ab triset"),
        ] },
        { id: "UPPER", name: "Upper", slots: [
          dbl("ds-up-ohp", "ohp", 3, 5, 8, big), dbl("ds-up-dbbench", "dbBench", 3, 8, 12), dbl("ds-up-chin", "chinUp", 4, 6, 10, { note: "weighted" }),
          dbl("ds-up-curl", "inclineCurl", 4, 8, 12), dbl("ds-up-cgbench", "cgBench", 3, 6, 10), dbl("ds-up-lat", "lateralRaise", 4, 8, 12),
        ] },
        { id: "LOWER", name: "Lower", slots: [
          dbl("ds-low-dl", "deadlift", 3, 5, 8, { ...big, inc: LEGS }), dbl("ds-low-fsq", "frontSquat", 4, 6, 10, { inc: LEGS }), dbl("ds-low-ext", "legExtension", 3, 10, 15),
          dbl("ds-low-curl", "legCurl", 3, 10, 15), dbl("ds-low-calf", "calfRaise", 5, 10, 15, { note: "machine calf raise" }), fixed("ds-low-abs", "crunch", 3, 10, 15, "ab triset"),
        ] },
      ],
      cycle: { weeks: 8, finite: true, weekNames: ["Week 1 · RPE 7–8", "Week 2 · RPE 8–9", ...Array.from({ length: 6 }, (_, w) => `Week ${w + 3} · RPE 9–10`)] },
      notes: [
        "Mon pull, Tue push, Wed legs, Fri upper, Sat lower (rest Thursday and Sunday); keep a rest day between legs and upper and between lower and the next pull.",
        "Effort: compounds RPE 7–8 in week 1 (find your weights), 8–9 in week 2, 9–10 from week 3; accessories one notch harder. Top of the range on every set → add weight.",
        "Swap exercises for similar ones in the same rep range; don't replace compounds with isolation work. Upper day is push-leaning: add a row if your back lags.",
      ],
    };
  },
  defaults: (unit) => ({
    startWeights: conv(unit, {
      "ds-pull-row": 135, "ds-pull-pd": 120, "ds-pull-crow": 110, "ds-pull-hammer": 30, "ds-pull-ccurl": 40, "ds-pull-upright": 65,
      "ds-push-bench": 185, "ds-push-incline": 55, "ds-push-skull": 60, "ds-push-pushdown": 50, "ds-push-lat": 20, "ds-push-clat": 15,
      "ds-legs-squat": 225, "ds-legs-rdl": 185, "ds-legs-press": 360, "ds-legs-lunge": 40, "ds-legs-calf": 135, "ds-legs-abs": 0,
      "ds-up-ohp": 105, "ds-up-dbbench": 60, "ds-up-chin": 0, "ds-up-curl": 25, "ds-up-cgbench": 155, "ds-up-lat": 20,
      "ds-low-dl": 275, "ds-low-fsq": 155, "ds-low-ext": 100, "ds-low-curl": 80, "ds-low-calf": 135, "ds-low-abs": 0,
    }),
    trainingMaxes: {},
  }),
};

// ───────────────────────── Bro Split ─────────────────────────

const PYR = "pyramid 10, 8, 8, 6: heavier each set";

export const broSplit: ProgramTemplate = {
  id: "bro-split",
  name: "Bro Split (5-Day)",
  author: "LiftVault (Emma Lennon)",
  source: "LiftVault \"Bro Split Workout: Example and Spreadsheet\"",
  summary: "The classic bodybuilding week: chest, back, legs, arms and shoulders each get their own day, with descending pyramids and calves twice a week.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [5],
  options: [],
  build() {
    const calves = (d: string) => [fixed(`bs-${d}-scalf`, "calfRaise", 5, 8, 20, "20, 15, 12, 10, 8"), fixed(`bs-${d}-secalf`, "seatedCalfRaise", 5, 10, 25, "25, 20, 15, 12, 10")];
    return {
      templateId: "bro-split",
      name: "Bro Split",
      sessionsPerWeek: 5,
      days: [
        { id: "CHEST", name: "Chest / Calves", slots: [
          fixed("bs-ch-incline", "inclineBench", 4, 6, 10, PYR, "MAIN"), fixed("bs-ch-db", "dbBench", 4, 6, 10, PYR), fixed("bs-ch-fly", "inclineFly", 4, 6, 10, PYR),
          { id: "bs-ch-dip", lift: "dip", tier: "ACC", progression: { kind: "fixed", sets: 3, reps: 1, amrapLast: true, note: "chest dips, every set as many as you can" } },
          ...calves("ch"),
        ] },
        { id: "BACK", name: "Back", slots: [
          fixed("bs-bk-dl", "deadlift", 3, 6, 10, "10, 8, 6", "MAIN"), fixed("bs-bk-row", "row", 4, 8, 12, "12, 10, 8, 8"),
          fixed("bs-bk-chin", "pullUp", 4, 10, undefined, "wide-grip"), fixed("bs-bk-crow", "cableRow", 4, 8, 12, "12, 10, 8, 8, each with a drop set to failure"),
        ] },
        { id: "LEGS", name: "Legs", slots: [
          fixed("bs-lg-sq", "squat", 5, 6, 15, "15, 10, 8, 8, 6", "MAIN"), fixed("bs-lg-fsq", "frontSquat", 4, 6, 10, PYR), fixed("bs-lg-press", "legPress", 3, 8, 10, "10, 8, 8"),
          fixed("bs-lg-ext", "legExtension", 4, 8, 12, "12, 10, 8, 8"), fixed("bs-lg-curl", "legCurl", 4, 8, 12, "12, 10, 8, 8"),
        ] },
        { id: "ARMS", name: "Arms / Calves", slots: [
          fixed("bs-ar-curl", "barbellCurl", 4, 6, 12, "12, 10, 8, 6", "MAIN"), fixed("bs-ar-altcurl", "bicepCurl", 3, 8, 10, "alternating"), fixed("bs-ar-preacher", "preacherCurl", 3, 10),
          fixed("bs-ar-conc", "concentrationCurl", 3, 15), fixed("bs-ar-ohtri", "overheadTricep", 3, 12, 15, "one-arm dumbbell"), fixed("bs-ar-rope", "tricepPushdown", 4, 8, 12, "rope, 12, 10, 8, 8"),
          fixed("bs-ar-skull", "skullcrusher", 4, 10, 12), ...calves("ar"),
        ] },
        { id: "SHOULDERS", name: "Shoulders", slots: [
          fixed("bs-sh-press", "ohp", 4, 6, 10, PYR, "MAIN"), fixed("bs-sh-lat", "lateralRaise", 4, 10), fixed("bs-sh-rear", "rearDeltFly", 3, 10, undefined, "bent-over"),
          fixed("bs-sh-front", "frontRaise", 3, 10), fixed("bs-sh-upright", "uprightRow", 2, 10), fixed("bs-sh-pecdeck", "rearDeltFly", 4, 12, 15, "rear-delt pec deck"),
          fixed("bs-sh-shrug", "shrug", 4, 10, 20, "barbell, 20, 15, 12, 10"), fixed("bs-sh-dbshrug", "shrug", 3, 8, 12, "dumbbell, 12, 10, 8"),
        ] },
      ],
      notes: [
        "Five days on, two off (the rest days can move). Day 6 is optional work for lagging parts if you've recovered.",
        "Most lifts are descending pyramids: the weight goes up as the reps come down. Beat last week's weights or reps.",
        "Add calf and ab work twice a week if you like.",
      ],
    };
  },
  defaults: () => ({ startWeights: {}, trainingMaxes: {} }),
};

// ───────────────────────── Gironda 10-8-6-15 ─────────────────────────

const G10: PercentSet[] = [{ pct: 0.5, reps: 10 }, { pct: 0.75, reps: 8 }, { pct: 1, reps: 6 }, { pct: 0.35, reps: 15 }];

export const gironda: ProgramTemplate = {
  id: "gironda-10-8-6-15",
  name: "Vince Gironda 10-8-6-15",
  author: "Vince Gironda",
  source: "LiftVault \"Vince Gironda 10-8-6-15 Workout Spreadsheet\" (credited to Iron and Grit)",
  summary: "The Iron Guru's four-set scheme on every exercise: 10 to prime, 8 and 6 heavy, 15 to burn out, all off your 6-rep max. Upper and lower days alternate.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [5, 6],
  options: [{ key: "days", label: "Days per week", default: "6", choices: [{ value: "6", label: "6 days (3 upper, 3 lower)" }, { value: "5", label: "5 days (3 upper, 2 lower)" }] }],
  build(o) {
    const n = Number(o.days ?? 6);
    const slot = (lift: string, note?: string): SlotDef => ({ id: `gir-${lift}`, lift, tier: "MAIN", note, progression: { kind: "percent", tmLift: lift, weeks: [G10] }, restSeconds: 60 });
    return {
      templateId: "gironda-10-8-6-15",
      name: "Gironda 10-8-6-15",
      sessionsPerWeek: n,
      maxLabel: "6RM",
      days: [
        { id: "UPPER", name: "Upper", slots: [
          slot("wideBench", "wide-grip, to the neck"), slot("latPulldown", "45° lean, to the chest"), slot("uprightRow"),
          slot("overheadTricep", "two-dumbbell pullover-style extension"), slot("hammerCurl", "thumbs-up dumbbell curl"),
        ] },
        { id: "LOWER", name: "Lower", slots: [slot("squat", "Gironda's \"special squat\": 3/4 depth in a Smith machine"), slot("calfRaise", "alternate heel raises"), slot("crunch", "barbell 1/4 roll-ups")] },
      ],
      notes: [
        "Enter a 6-rep max for each exercise. Every exercise: 10 @ 50%, 8 @ 75%, 6 @ 100%, 15 @ 35% of it.",
        "Tempo about 2 up, 1 squeeze, 2 down; rest 60 seconds or less.",
        "Alternate upper and lower days. When the set of 6 starts to feel easy, raise that exercise's 6RM in Setup.",
      ],
    };
  },
  defaults: (unit) => ({ trainingMaxes: conv(unit, { wideBench: 185, latPulldown: 140, uprightRow: 85, overheadTricep: 60, hammerCurl: 35, squat: 225, calfRaise: 180, crunch: 0 }), startWeights: {} }),
};

export const HYPERTROPHY_CLASSICS = [dumbbellPpl, drSwolePplul, broSplit, gironda];
