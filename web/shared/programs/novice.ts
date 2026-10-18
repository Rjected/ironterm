// Novice and early-intermediate programs: StrongLifts 5×5, Starting Strength, GreySkull LP,
// Phrak's GSLP, the r/Fitness Basic Beginner Routine, Ice Cream Fitness 5×5, Fierce 5, AllPro's
// Simple Beginner Routine, Madcow 5×5, Bill Starr 5×5 and the Texas Method.
//
// Sources (no source spreadsheets, so they come from published write-ups and memory):
//   StrongLifts    stronglifts.com (Mehdi): A squat/bench/row 5×5, B squat/OHP 5×5 + deadlift 1×5.
//                  +5 lb a session (+10 deadlift). Fail the same weight 3 sessions running → -10%.
//   Starting Str.  Rippetoe, Starting Strength 3rd ed. novice progression, phases 1–3 (phase 3
//                  alternates deadlift / power clean on A and adds chin-ups on B). 3×5, DL 1×5,
//                  cleans 5×3. Reset after 3 stalls by 10% is the common wiki rule (approximation).
//   GreySkull LP   John Sheaffer's e-book (from memory): 2×5, 1×5+ on the presses and squat, 1×5+
//                  deadlift. +2.5 lb upper / +5 lb lower, double jump for 10+ reps, miss → -10%.
//   Phrak's GSLP   r/Fitness wiki: 3×5+ (last set AMRAP), A OHP/chins/squat, B bench/rows/deadlift.
//   Reddit BBR     r/Fitness wiki (via liftosaur summary): A row/bench/squat, B chins/OHP/deadlift,
//                  2×5 + 1×5+, same increments, double for 10+, miss → -10%.
//   ICF 5×5        Jason Blaha's Ice Cream Fitness 5×5 (memory): SL core plus 3×8 accessories.
//   Fierce 5       fitnessvolt.com write-up: A squat/bench/pendlay + face pulls, calf/pushdown
//                  superset; B front squat/OHP/RDL + pulldown, abs/curl superset. The article gives
//                  no failure rule; 3 strikes → -10% here is an approximation.
//   AllPro         LiftVault (All Pro Simple Beginner Routine): 2 work sets, reps 8→12 over a
//                  5-week cycle, Mon 100% / Wed 90% / Fri 80%; 12 on both heavy sets in week 5 → +10%.
//   Madcow         Madcow's 5×5 sheet (memory): 12.5% ramps to a Monday top set, Wednesday light
//                  squat (ramp, repeat 3rd set) + OHP/deadlift ramps, Friday ramp + triple at +2.5%
//                  and a back-off 8. Top set +2.5% a week, the 5RM you enter is hit in week 4.
//   Bill Starr     Heavy / light / medium "Big Three" (barbend + Starting Strength forum summaries):
//                  5×5 ramps to the top set Monday, 80% Wednesday, 90% Friday. +10 lb squat,
//                  +5 lb bench / clean a week. Ramp spacing reuses Madcow's 12.5% (approximation).
//   Texas Method   Rippetoe & Kilgore, Practical Programming: Mon 5×5 @ 90% of Friday's 5RM,
//                  Wed squat 2×5 @ 80% of Monday, Fri new 5RM. Bench and press alternate weeks.

import type { PercentSet, ProgramTemplate, SlotDef, Stage, Tier, TmRule, Weights } from "../program";
import type { Unit } from "../units";

// ───────────────────────── helpers ─────────────────────────

const kg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (unit: Unit, rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));
const W = (lb: number, kgs: number): Weights => ({ lb, kg: kgs });
const UP = W(5, 2.5);
const LOW = W(10, 5);
const MICRO_UP = W(2.5, 1.25);
const MICRO_LOW = W(5, 2.5);

const st = (sets: number, reps: number, amrap = false): Stage => ({ sets, reps, amrap });

interface Linear {
  increment: Weights;
  /** sessions failed in a row before deloading (default 1) */
  fails?: number;
  /** deload fraction on final fail; omit = hold */
  deload?: number;
  amrapBonus?: { reps: number; increments: number };
  stages?: Stage[];
}

/** Linear per-session progression. Reuse the same id on several days to share one progression. */
function lin(id: string, lift: string, tier: Tier, sets: number, reps: number, o: Linear & { amrap?: boolean; note?: string; rest?: number }): SlotDef {
  return {
    id, lift, tier, note: o.note, restSeconds: o.rest,
    progression: {
      kind: "stages",
      stages: o.stages ?? [st(sets, reps, !!o.amrap)],
      advance: { type: "baseVolume" },
      onFinalFail: o.deload ? { type: "deload", pct: o.deload } : { type: "hold" },
      increment: o.increment,
      failsBeforeAction: o.fails,
      amrapBonus: o.amrapBonus,
    },
  };
}

const fixed = (id: string, lift: string, sets: number, reps: number, extra: { repsMax?: number; amrapLast?: boolean; note?: string } = {}): SlotDef => ({
  id, lift, tier: "ACC", progression: { kind: "fixed", sets, reps, ...extra },
});

const dbl = (id: string, lift: string, sets: number, lo: number, hi: number, increment = UP): SlotDef => ({
  id, lift, tier: "ACC", progression: { kind: "double", sets, reps: [lo, hi], increment },
});

const pctSlot = (id: string, lift: string, tier: Tier, weeks: PercentSet[][], tmLift = lift, tmRule?: TmRule, note?: string): SlotDef => ({
  id, lift, tier, note, progression: { kind: "percent", tmLift, weeks, tmRule },
});

const sets = (n: number, pct: number, reps: number): PercentSet[] => Array.from({ length: n }, () => ({ pct, reps }));

// ───────────────────────── StrongLifts 5×5 ─────────────────────────

export const stronglifts: ProgramTemplate = {
  id: "stronglifts",
  name: "StrongLifts 5×5",
  author: "Mehdi Hadim",
  source: "stronglifts.com 5×5 guide (published program)",
  summary: "Two alternating full-body workouts, five sets of five. Add weight every session; three misses in a row at a weight means a 10% deload.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const sl = { increment: UP, fails: 3, deload: 0.1 };
    return {
      templateId: "stronglifts",
      name: "StrongLifts 5×5",
      sessionsPerWeek: 3,
      days: [
        { id: "A", name: "Workout A · Squat / Bench / Row", slots: [lin("sq", "squat", "MAIN", 5, 5, sl), lin("bench", "bench", "MAIN", 5, 5, sl), lin("row", "row", "MAIN", 5, 5, sl)] },
        { id: "B", name: "Workout B · Squat / OHP / Deadlift", slots: [lin("sq", "squat", "MAIN", 5, 5, sl), lin("ohp", "ohp", "MAIN", 5, 5, sl), lin("dl", "deadlift", "MAIN", 1, 5, { ...sl, increment: LOW })] },
      ],
      notes: [
        "Alternate A and B, three days a week (ABA, BAB).",
        "Squat is the same progression on both days: +5 lb every session it's completed.",
        "Miss reps at the same weight three sessions in a row → drop that lift 10%.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { sq: 135, bench: 95, row: 85, ohp: 65, dl: 155 }), trainingMaxes: {} };
  },
};

// ───────────────────────── Starting Strength ─────────────────────────

export const startingStrength: ProgramTemplate = {
  id: "starting-strength",
  name: "Starting Strength",
  author: "Mark Rippetoe",
  source: "Starting Strength: Basic Barbell Training, 3rd ed. (novice progression; reset rule from the community wiki)",
  summary: "Squat every session, alternate press and bench, deadlift for one heavy set of five. Power cleans and chin-ups come in as the program matures.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [
    { key: "phase", label: "Phase", default: "1", choices: [
      { value: "1", label: "Phase 1 · deadlift both days" },
      { value: "2", label: "Phase 2 · power cleans on B" },
      { value: "3", label: "Phase 3 · DL / clean alternate, chin-ups" },
    ] },
  ],
  build(o) {
    const phase = o.phase ?? "1";
    const r = { fails: 3, deload: 0.1 };
    const sq = lin("sq", "squat", "MAIN", 3, 5, { ...r, increment: UP });
    const press = lin("press", "ohp", "MAIN", 3, 5, { ...r, increment: UP });
    const bench = lin("bench", "bench", "MAIN", 3, 5, { ...r, increment: UP });
    const dl = lin("dl", "deadlift", "MAIN", 1, 5, { ...r, increment: LOW });
    const pc = lin("pc", "powerClean", "MAIN", 5, 3, { ...r, increment: UP });
    const chins = fixed("chin", "chinUp", 3, 5, { amrapLast: true, note: "to failure; add weight once 3×10 is easy" });
    const days =
      phase === "1"
        ? [
            { id: "A", name: "Workout A · Squat / Press / Deadlift", slots: [sq, press, dl] },
            { id: "B", name: "Workout B · Squat / Bench / Deadlift", slots: [sq, bench, dl] },
          ]
        : phase === "2"
          ? [
              { id: "A", name: "Workout A · Squat / Press / Deadlift", slots: [sq, press, dl] },
              { id: "B", name: "Workout B · Squat / Bench / Power clean", slots: [sq, bench, pc] },
            ]
          : [
              { id: "A1", name: "Workout A · Squat / Press / Deadlift", slots: [sq, press, dl] },
              { id: "B1", name: "Workout B · Squat / Bench / Chin-ups", slots: [sq, bench, chins] },
              { id: "A2", name: "Workout A · Squat / Press / Power clean", slots: [sq, press, pc] },
              { id: "B2", name: "Workout B · Squat / Bench / Chin-ups", slots: [sq, bench, chins] },
            ];
    return {
      templateId: "starting-strength",
      name: `Starting Strength · Phase ${phase}`,
      sessionsPerWeek: 3,
      days,
      notes: [
        "3×5 across after warm-ups; deadlift is one work set of 5, power cleans 5×3.",
        "Add weight every session: +5 lb squat/press/bench/clean, +10 lb deadlift (go bigger early if it's easy).",
        "Stall at a weight three sessions running → reset that lift 10% and build back.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { sq: 135, press: 65, bench: 95, dl: 155, pc: 75, chin: 0 }), trainingMaxes: {} };
  },
};

// ───────────────────────── GreySkull family ─────────────────────────

const gs = (upper: boolean) => ({ increment: upper ? MICRO_UP : MICRO_LOW, deload: 0.1, amrapBonus: { reps: 10, increments: 2 } });
const gsMain = (id: string, lift: string, upper: boolean, sets3 = true) =>
  lin(id, lift, "MAIN", sets3 ? 3 : 1, 5, { ...gs(upper), amrap: true });
/** Chin-ups as 3×5+ with added weight (start at 0 = bodyweight). */
const gsChins = (id: string) => lin(id, "chinUp", "MAIN", 3, 5, { ...gs(true), amrap: true, note: "weight = added load; bodyweight is 0" });

const GS_NOTES = [
  "Last set is AMRAP (5+). Hit all the reps → +2.5 lb upper, +5 lb lower next time.",
  "10+ reps on the AMRAP set → double the jump.",
  "Miss any reps → drop 10% and go for an AMRAP rep PR on the way back up.",
];

export const greyskull: ProgramTemplate = {
  id: "greyskull",
  name: "GreySkull LP",
  author: "John Sheaffer",
  source: "GreySkull LP e-book (from memory; matches the r/Fitness summaries)",
  summary: "Alternate bench and overhead press, 2×5 then an AMRAP set. Big AMRAPs earn double jumps; any miss resets that lift 10%.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [
    { key: "arms", label: "Arms & abs", default: "on", choices: [{ value: "on", label: "Curls, triceps, ab rollouts" }, { value: "off", label: "Main lifts only" }] },
  ],
  build(o) {
    const arms = (o.arms ?? "on") === "on";
    const a: SlotDef[] = [gsMain("bench", "bench", true), gsMain("row", "row", true), gsMain("sq", "squat", false)];
    const b: SlotDef[] = [gsMain("ohp", "ohp", true), gsChins("chin"), gsMain("dl", "deadlift", false, false)];
    if (arms) {
      a.push(dbl("curl", "barbellCurl", 2, 10, 15), fixed("abs-a", "abWheel", 2, 10, { amrapLast: true }));
      b.push(dbl("tri", "skullcrusher", 2, 10, 15), fixed("abs-b", "abWheel", 2, 10, { amrapLast: true }));
    }
    return {
      templateId: "greyskull",
      name: "GreySkull LP",
      sessionsPerWeek: 3,
      microplates: true,
      days: [
        { id: "A", name: "Day A · Bench / Row / Squat", slots: a },
        { id: "B", name: "Day B · OHP / Chin-up / Deadlift", slots: b },
      ],
      notes: ["Shown as 3×5+: two sets of five, then the AMRAP.", "Deadlift is a single AMRAP set (1×5+).", ...GS_NOTES],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { bench: 95, row: 85, sq: 135, ohp: 65, chin: 0, dl: 155, curl: 45, tri: 45, "abs-a": 0, "abs-b": 0 }), trainingMaxes: {} };
  },
};

export const phrakGslp: ProgramTemplate = {
  id: "phrak-gslp",
  name: "Phrak's GSLP",
  author: "/u/phrakture (after John Sheaffer)",
  source: "r/Fitness wiki: Phrak's Greyskull LP variant (published program)",
  summary: "The r/Fitness take on GreySkull: OHP, chins and squats on A, bench, rows and deadlifts on B, every lift 3×5+.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    return {
      templateId: "phrak-gslp",
      name: "Phrak's GSLP",
      sessionsPerWeek: 3,
      microplates: true,
      days: [
        { id: "A", name: "Workout A · OHP / Chin-up / Squat", slots: [gsMain("ohp", "ohp", true), gsChins("chin"), gsMain("sq", "squat", false)] },
        { id: "B", name: "Workout B · Bench / Row / Deadlift", slots: [gsMain("bench", "bench", true), gsMain("row", "row", true), gsMain("dl", "deadlift", false, false)] },
      ],
      notes: ["Alternate A and B (ABA, BAB).", ...GS_NOTES],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { ohp: 65, chin: 0, sq: 135, bench: 95, row: 85, dl: 155 }), trainingMaxes: {} };
  },
};

export const redditBbr: ProgramTemplate = {
  id: "reddit-bbr",
  name: "Basic Beginner Routine",
  author: "r/Fitness",
  source: "r/Fitness wiki: Basic Beginner Routine (published program, via liftosaur summary)",
  summary: "The r/Fitness starter program: row, bench, squat on A; chin-up, OHP, deadlift on B. Two sets of five and an AMRAP for everything.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    return {
      templateId: "reddit-bbr",
      name: "Basic Beginner Routine",
      sessionsPerWeek: 3,
      microplates: true,
      days: [
        { id: "A", name: "Workout A · Row / Bench / Squat", slots: [gsMain("row", "row", true), gsMain("bench", "bench", true), gsMain("sq", "squat", false)] },
        { id: "B", name: "Workout B · Chin-up / OHP / Deadlift", slots: [gsChins("chin"), gsMain("ohp", "ohp", true), gsMain("dl", "deadlift", false, false)] },
      ],
      notes: ["Alternate A and B (ABA, BAB). Run it for up to ~3 months.", "AMRAP: stop 1–2 reps shy of failure.", ...GS_NOTES],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { row: 85, bench: 95, sq: 135, chin: 0, ohp: 65, dl: 155 }), trainingMaxes: {} };
  },
};

// ───────────────────────── Ice Cream Fitness 5×5 ─────────────────────────

export const icf55: ProgramTemplate = {
  id: "icf-5x5",
  name: "Ice Cream Fitness 5×5",
  author: "Jason Blaha",
  source: "Ice Cream Fitness 5×5 Novice (published program, from memory)",
  summary: "StrongLifts-style 5×5 with rows every session and 3×8 bodybuilding accessories for arms, traps and abs.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const m = { increment: UP, fails: 3, deload: 0.1 };
    const acc = (id: string, lift: string, sets = 3, reps = 8) => lin(id, lift, "ACC", sets, reps, { increment: UP });
    return {
      templateId: "icf-5x5",
      name: "Ice Cream Fitness 5×5",
      sessionsPerWeek: 3,
      days: [
        { id: "A", name: "Workout A · Squat / Bench / Row", slots: [
          lin("sq", "squat", "MAIN", 5, 5, m), lin("bench", "bench", "MAIN", 5, 5, m), lin("row", "row", "MAIN", 5, 5, m),
          acc("shrug", "shrug"), acc("skull", "skullcrusher"), acc("curl", "barbellCurl"),
          fixed("hyper", "backExtension", 2, 10), acc("crunch-a", "cableCrunch", 3, 10),
        ] },
        { id: "B", name: "Workout B · Squat / Deadlift / OHP / Row", slots: [
          lin("sq", "squat", "MAIN", 5, 5, m), lin("dl", "deadlift", "MAIN", 1, 5, { ...m, increment: LOW }), lin("ohp", "ohp", "MAIN", 5, 5, m), lin("row", "row", "MAIN", 5, 5, m),
          acc("cg", "cgBench"), acc("curl", "barbellCurl"), acc("crunch-b", "cableCrunch", 3, 10),
        ] },
      ],
      notes: [
        "Alternate A and B. Squat and rows are one progression each across both days.",
        "+5 lb each session (+10 deadlift). Three misses at a weight → -10%.",
        "Accessories: add 5 lb once every set is completed.",
      ],
    };
  },
  defaults(unit) {
    return {
      startWeights: conv(unit, { sq: 135, bench: 95, row: 85, dl: 155, ohp: 65, shrug: 95, skull: 45, curl: 45, hyper: 0, "crunch-a": 50, "crunch-b": 50, cg: 75 }),
      trainingMaxes: {},
    };
  },
};

// ───────────────────────── Fierce 5 ─────────────────────────

export const fierce5: ProgramTemplate = {
  id: "fierce5",
  name: "Fierce 5",
  author: "Fierce 5 (bodybuilding.com forums)",
  source: "fitnessvolt.com Fierce 5 write-up (published program); failure rule approximated",
  summary: "Short A/B full-body novice program: squat, bench and Pendlay rows on A; front squat, press and RDLs on B, with supersetted accessories.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const m = { increment: UP, fails: 3, deload: 0.1 };
    return {
      templateId: "fierce5",
      name: "Fierce 5",
      sessionsPerWeek: 3,
      days: [
        { id: "A", name: "Workout A · Squat / Bench / Pendlay", slots: [
          lin("sq", "squat", "MAIN", 3, 5, m), lin("bench", "bench", "MAIN", 3, 5, m), lin("pendlay", "pendlayRow", "SUPP", 3, 8, m),
          dbl("facepull", "facePull", 3, 10, 15, W(2.5, 2.5)),
          { ...dbl("calf", "calfRaise", 2, 15, 20, W(5, 2.5)), note: "superset with pushdowns" },
          { ...dbl("pushdown", "tricepPushdown", 2, 10, 15, W(2.5, 2.5)), note: "superset with calf raises" },
        ] },
        { id: "B", name: "Workout B · Front squat / OHP / RDL", slots: [
          lin("fsq", "frontSquat", "MAIN", 3, 5, m), lin("ohp", "ohp", "MAIN", 3, 5, m), lin("rdl", "rdl", "SUPP", 3, 8, m),
          dbl("pulldown", "latPulldown", 3, 8, 12, W(5, 2.5)),
          fixed("abs", "cableCrunch", 2, 15, { note: "any ab exercise · superset with curls" }),
          { ...dbl("curl", "barbellCurl", 2, 10, 15), note: "superset with abs" },
        ] },
      ],
      notes: [
        "Alternate A and B, three days a week. Rest 2–3 min on the 3×5s, 60–90 s on the rest.",
        "Add 5 lb when you complete all reps. Stall three sessions → drop 10% and rebuild.",
      ],
    };
  },
  defaults(unit) {
    return {
      startWeights: conv(unit, { sq: 135, bench: 95, pendlay: 85, facepull: 30, calf: 90, pushdown: 30, fsq: 95, ohp: 65, rdl: 115, pulldown: 80, abs: 0, curl: 45 }),
      trainingMaxes: {},
    };
  },
};

// ───────────────────────── AllPro Simple Beginner Routine ─────────────────────────

const ALLPRO_REPS = [8, 9, 10, 11, 12];
const ALLPRO_LIFTS: [string, string][] = [["sq", "squat"], ["bench", "bench"], ["row", "row"], ["ohp", "ohp"], ["sldl", "stiffLegDeadlift"], ["urow", "uprightRow"], ["calf", "calfRaise"]];
/** Week 5 heavy day: 12 on both work sets → +10% for the next cycle; anything less → same weight. */
const ALLPRO_RULE: TmRule = { type: "amrapVsTarget", setIndex: 1, table: [{ diff: -99, pct: 0 }, { diff: 0, pct: 0.1 }] };

export const allpro: ProgramTemplate = {
  id: "allpro",
  name: "AllPro Simple Beginner",
  author: "AllPro (bodybuilding.com)",
  source: "LiftVault: All Pro Simple Beginner Routine spreadsheet (published program)",
  summary: "Same seven lifts three days a week. Reps climb from 8 to 12 over five weeks at a fixed weight; finish 12s on heavy day and the weight goes up 10%.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const day = (id: string, name: string, pct: number, weeks: number[], rule: boolean) => ({
      id, name, weeks,
      slots: ALLPRO_LIFTS.map(([k, lift]): SlotDef =>
        pctSlot(`${id.toLowerCase()}-${k}`, lift, k === "sq" || k === "bench" || k === "row" ? "MAIN" : "ACC",
          ALLPRO_REPS.map((r) => sets(2, pct, r)), lift, rule ? ALLPRO_RULE : undefined,
          k === "sq" || k === "bench" || k === "row" ? "warm up 1 set each at 25% and 50%" : undefined)),
    });
    return {
      templateId: "allpro",
      name: "AllPro Simple Beginner",
      sessionsPerWeek: 3,
      maxLabel: "Working weight (≈10RM)",
      // Week 5's heavy day is its own day so only it can move the weight.
      days: [
        day("H", "Heavy · 100%", 1, [0, 1, 2, 3], false),
        day("H5", "Heavy · 100% (test week)", 1, [4], true),
        day("M", "Medium · 90%", 0.9, [0, 1, 2, 3, 4], false),
        day("L", "Light · 80%", 0.8, [0, 1, 2, 3, 4], false),
      ],
      cycle: { weeks: 5, weekNames: ALLPRO_REPS.map((r) => `${r}s week`) },
      notes: [
        "Two work sets per lift. Reps go 8, 9, 10, 11, 12 across the five weeks at the same weights.",
        "Week 5 heavy day: 12 reps on both sets → +10% for the next cycle. Miss → repeat the cycle at the same weight.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { squat: 135, bench: 115, row: 95, ohp: 65, stiffLegDeadlift: 115, uprightRow: 55, calfRaise: 100 }), startWeights: {} };
  },
};

// ───────────────────────── Madcow 5×5 ─────────────────────────

const MADCOW_WEEKS = 12;
const MADCOW_PR_WEEK = 3; // 0-based: the 5RM you enter is matched in week 4
const madTop = (w: number) => Math.pow(1.025, w - MADCOW_PR_WEEK);
const ramp = (f: number, pcts: number[], reps = 5): PercentSet[] => pcts.map((p) => ({ pct: f * p, reps }));
const madWeeks = (fn: (f: number) => PercentSet[]) => Array.from({ length: MADCOW_WEEKS }, (_, w) => fn(madTop(w)));
const MAD_MON = madWeeks((f) => ramp(f, [0.5, 0.625, 0.75, 0.875, 1]));
const MAD_WED_SQ = madWeeks((f) => ramp(f, [0.5, 0.625, 0.75, 0.75]));
const MAD_WED = madWeeks((f) => ramp(f, [0.625, 0.75, 0.875, 1]));
const MAD_FRI = madWeeks((f) => [...ramp(f, [0.5, 0.625, 0.75, 0.875]), { pct: f * 1.025, reps: 3 }, { pct: f * 0.75, reps: 8 }]);

export const madcow: ProgramTemplate = {
  id: "madcow",
  name: "Madcow 5×5",
  author: "Madcow2 (after Bill Starr)",
  source: "Madcow 5×5 intermediate spreadsheet (from memory; LiftVault overview)",
  summary: "Heavy-light-medium 5×5 with ramping sets. Monday's top set of five and Friday's triple climb 2.5% a week; Wednesday is a light squat day.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: MADCOW_WEEKS,
  options: [
    { key: "wedPress", label: "Wednesday press", default: "ohp", choices: [{ value: "ohp", label: "Overhead press" }, { value: "incline", label: "Incline bench" }] },
  ],
  build(o) {
    const press = (o.wedPress ?? "ohp") === "incline" ? "inclineBench" : "ohp";
    return {
      templateId: "madcow",
      name: "Madcow 5×5",
      sessionsPerWeek: 3,
      maxLabel: "5RM",
      days: [
        { id: "MON", name: "Monday · Heavy 5×5", slots: [
          pctSlot("mon-sq", "squat", "MAIN", MAD_MON), pctSlot("mon-bench", "bench", "MAIN", MAD_MON), pctSlot("mon-row", "row", "MAIN", MAD_MON),
          fixed("mon-hyper", "backExtension", 2, 10, { repsMax: 12, note: "weighted" }), fixed("mon-situp", "sitUp", 4, 10, { note: "weighted" }),
        ] },
        { id: "WED", name: "Wednesday · Light", slots: [
          pctSlot("wed-sq", "squat", "MAIN", MAD_WED_SQ), pctSlot("wed-press", press, "MAIN", MAD_WED), pctSlot("wed-dl", "deadlift", "MAIN", MAD_WED),
          fixed("wed-situp", "sitUp", 3, 10),
        ] },
        { id: "FRI", name: "Friday · Medium + triple", slots: [
          pctSlot("fri-sq", "squat", "MAIN", MAD_FRI), pctSlot("fri-bench", "bench", "MAIN", MAD_FRI), pctSlot("fri-row", "row", "MAIN", MAD_FRI),
          fixed("fri-dip", "dip", 3, 5, { repsMax: 8, note: "weighted" }), fixed("fri-curl", "barbellCurl", 3, 8), fixed("fri-tri", "skullcrusher", 3, 8),
        ] },
      ],
      cycle: { weeks: MADCOW_WEEKS, finite: true, weekNames: Array.from({ length: MADCOW_WEEKS }, (_, w) => (w === MADCOW_PR_WEEK ? `Week ${w + 1} · PR week` : `Week ${w + 1}`)) },
      notes: [
        "Enter your current 5RMs. Weeks 1–3 build up to them; from week 4 every week is a new PR (+2.5%).",
        "Friday: four ramp sets, a triple 2.5% over Monday's top set, then one back-off set of 8.",
        "When you stall, drop back two weeks (Adjustments) and run it again.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { squat: 245, bench: 185, row: 155, ohp: 115, inclineBench: 155, deadlift: 295 }), startWeights: {} };
  },
};

// ───────────────────────── Bill Starr 5×5 ─────────────────────────

const STARR_RAMP = [0.5, 0.625, 0.75, 0.875, 1];
const starr = (f: number) => [ramp(f, STARR_RAMP)];

export const billStarr: ProgramTemplate = {
  id: "bill-starr",
  name: "Bill Starr 5×5",
  author: "Bill Starr",
  source: "The Strongest Shall Survive (1976), via barbend.com and Starting Strength forum summaries; ramps approximated",
  summary: "The original heavy-light-medium Big Three: power clean, bench and squat, ramping five sets of five to a top set that goes up every week.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    return {
      templateId: "bill-starr",
      name: "Bill Starr 5×5",
      sessionsPerWeek: 3,
      maxLabel: "Heavy-day top set (5RM)",
      days: [
        { id: "MON", name: "Monday · Heavy", slots: [pctSlot("mon-pc", "powerClean", "MAIN", starr(1)), pctSlot("mon-bench", "bench", "MAIN", starr(1)), pctSlot("mon-sq", "squat", "MAIN", starr(1))] },
        { id: "WED", name: "Wednesday · Light (80%)", slots: [pctSlot("wed-pc", "powerClean", "MAIN", starr(0.8)), pctSlot("wed-incline", "inclineBench", "MAIN", starr(1)), pctSlot("wed-sq", "squat", "MAIN", starr(0.8))] },
        { id: "FRI", name: "Friday · Medium (90%)", slots: [pctSlot("fri-pc", "powerClean", "MAIN", starr(0.9)), pctSlot("fri-bench", "bench", "MAIN", starr(0.9)), pctSlot("fri-sq", "squat", "MAIN", starr(0.9))] },
      ],
      cycle: { weeks: 1, tmIncrease: { squat: LOW, bench: UP, powerClean: UP, inclineBench: UP } },
      notes: [
        "Five sets of five, each heavier, finishing at the day's top set.",
        "Wednesday works up to ~80% of Monday, Friday to ~90%. Incline press is the light-day press.",
        "Top sets go up each week: +10 lb squat, +5 lb bench, clean and incline.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { powerClean: 135, bench: 165, squat: 225, inclineBench: 135 }), startWeights: {} };
  },
};

// ───────────────────────── Texas Method ─────────────────────────

/** Friday 5RM: get all 5 → TM (next Friday's target) +1 increment; miss → hold. */
const TX_PR: TmRule = { type: "amrapVsTarget", setIndex: 0, table: [{ diff: -99, increments: 0 }, { diff: 0, increments: 1 }] };

export const texasMethod: ProgramTemplate = {
  id: "texas-method",
  name: "Texas Method",
  author: "Mark Rippetoe & Glenn Pendlay",
  source: "Practical Programming for Strength Training, 3rd ed. (published program; light-day press % approximated)",
  summary: "Volume Monday, light Wednesday, PR Friday. Each successful Friday 5RM raises the target and, with it, next week's volume and light days.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [3],
  options: [],
  build() {
    const vol = [sets(5, 0.9, 5)];
    const pr: PercentSet[][] = [[{ pct: 1, reps: 5, target: 5 }]];
    const dl = lin("dl", "deadlift", "MAIN", 1, 5, { increment: LOW, fails: 2, deload: 0.1 });
    const pc = lin("pc", "powerClean", "SUPP", 5, 3, { increment: UP, fails: 2, deload: 0.1 });
    const chins = fixed("chin", "chinUp", 3, 5, { amrapLast: true, note: "bodyweight, to near failure" });
    const ghr = fixed("backext", "backExtension", 5, 10);
    const week = (w: number, main: string, other: string, label: string) => [
      { id: `W${w + 1}MON`, name: `Monday · Volume (${label})`, weeks: [w], slots: [pctSlot(`w${w}-mon-sq`, "squat", "MAIN", vol), pctSlot(`w${w}-mon-${main}`, main, "MAIN", vol), dl] },
      { id: `W${w + 1}WED`, name: "Wednesday · Recovery", weeks: [w], slots: [
        pctSlot(`w${w}-wed-sq`, "squat", "MAIN", [sets(2, 0.72, 5)], "squat", undefined, "80% of Monday"),
        pctSlot(`w${w}-wed-${other}`, other, "MAIN", [sets(3, 0.81, 5)], other, undefined, "~90% of its volume weight"),
        chins, ghr,
      ] },
      { id: `W${w + 1}FRI`, name: `Friday · Intensity (${label})`, weeks: [w], slots: [
        pctSlot(`w${w}-fri-sq`, "squat", "MAIN", pr, "squat", TX_PR, "new 5RM"),
        pctSlot(`w${w}-fri-${main}`, main, "MAIN", pr, main, TX_PR, "new 5RM"),
        pc,
      ] },
    ];
    return {
      templateId: "texas-method",
      name: "Texas Method",
      sessionsPerWeek: 3,
      maxLabel: "Friday 5RM target",
      tmIncrement: { squat: UP, bench: UP, ohp: UP },
      days: [...week(0, "bench", "ohp", "bench"), ...week(1, "ohp", "bench", "press")],
      cycle: { weeks: 2, weekNames: ["Bench week", "Press week"] },
      notes: [
        "Enter the 5RM you'll attempt this Friday. Monday is 5×5 at 90% of it, Wednesday squats 2×5 at 80% of Monday.",
        "Bench and press alternate weeks: volume and PR on one, the other done light on Wednesday.",
        "Hit the Friday 5RM → next week's target +5 lb (and Monday/Wednesday follow). Miss → repeat.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { squat: 275, bench: 205, ohp: 135 }), startWeights: conv(unit, { dl: 315, pc: 155, chin: 0, backext: 0 }) };
  },
};

export const NOVICE_TEMPLATES: ProgramTemplate[] = [stronglifts, startingStrength, greyskull, phrakGslp, redditBbr, icf55, fierce5, allpro, madcow, billStarr, texasMethod];
