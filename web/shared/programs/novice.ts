// Novice and early-intermediate programs: StrongLifts 5×5, Starting Strength, GreySkull LP,
// Phrak's GSLP, the r/Fitness Basic Beginner Routine, Ice Cream Fitness 5×5, Fierce 5, AllPro's
// Simple Beginner Routine, Madcow 5×5, Bill Starr 5×5 and the Texas Method.
//
// Sources, re-checked 2026-10-18 (see docs/programs/ACCURACY.md; each template's comment has detail):
//   StrongLifts    stronglifts.com (workout program, failure, progress pages): A squat/bench/row 5×5,
//                  B squat/OHP 5×5 + deadlift 1×5. +5 lb a session (+10 deadlift). Fail the same
//                  weight 3 sessions running → about −10%.
//   Starting Str.  startingstrength.com Programs page (phases 1–3) and "The Reset: Why and How":
//                  second stall in a row → 5% reset.
//   GreySkull LP   Johnny Pain's original forum post (LiftVault quote): presses alternate, squat
//                  Mon/Fri, deadlift Wed; last set under 5 → −10%.
//   Phrak's GSLP   r/Fitness wiki (archived): 3×5+, OHP/chins and bench/rows alternate, squat
//                  Mon/Fri, deadlift Wed; under 15 total reps → −10%; more than 10 on the AMRAP → ×2.
//   Reddit BBR     thefitness.wiki: A row/bench/squat, B chins/OHP/deadlift, all 3×5+, same rules.
//   ICF 5×5        LiftVault's linked ICF 1.0 calculator (community revision of Blaha's sheet).
//   Fierce 5       original bodybuilding.com post (weekly +5 / +10 lb) + fitnessvolt.com lineup.
//   AllPro         LiftVault (All Pro Simple Beginner Routine): 2 work sets, reps 8→12 over a
//                  5-week cycle, Mon 100% / Wed 90% / Fri 80%; 12 on both heavy sets in week 5 → +10%.
//   Madcow         Madcow's original "Linear 5x5" page (2010 archive): 12.5% ramps, +2.5% a week,
//                  hold on a miss, open-ended.
//   Bill Starr     breakingmuscle.com on The Strongest Shall Survive; ramps/increments approximated.
//   Texas Method   startingstrength.com "The Texas Method" (Rippetoe): Mon 5×5 @ 90% of Friday's
//                  5RM, Wed squat 2×5 @ 80% of Monday, Fri new 5RM. Bench and press alternate weeks.

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
  count?: "capped" | "total" | "lastSet";
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
      ...(o.count ? { count: o.count } : {}),
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
  source: "startingstrength.com: Programs (novice phases 1–3) · \"The Reset: Why and How\" (stall and reset rules)",
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
    // startingstrength.com "The Reset: Why and How": a lift that stalls a second session in a row
    // gets a 5% reset (then 5×3 on the next stall; not modelled).
    const r = { fails: 2, deload: 0.05 };
    const sq = lin("sq", "squat", "MAIN", 3, 5, { ...r, increment: UP });
    const press = lin("press", "ohp", "MAIN", 3, 5, { ...r, increment: UP });
    const bench = lin("bench", "bench", "MAIN", 3, 5, { ...r, increment: UP });
    const dl = lin("dl", "deadlift", "MAIN", 1, 5, { ...r, increment: LOW });
    const pc = lin("pc", "powerClean", "MAIN", 5, 3, { ...r, increment: UP });
    const chins = fixed("chin", "chinUp", 3, 5, { amrapLast: true, note: "all three sets to failure; at 3×10 bodyweight, make every other chin day 3×5 weighted" });
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
        "Fail a lift two sessions in a row → reset it 5% and build back. On the next stall, squat/press/bench move to 5×3 (deadlift to fewer, heavier sets); after that, intermediate programming for that lift.",
        "Early on, jump bigger: squat +10 lb for the first few sessions, deadlift +15–20 lb, then settle to +5 / +10 and smaller as needed (use the increment override).",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { sq: 135, press: 65, bench: 95, dl: 155, pc: 75, chin: 0 }), trainingMaxes: {} };
  },
};

// ───────────────────────── GreySkull family ─────────────────────────

type GsOpts = { count: "total" | "lastSet"; bonusAt: number };
const gs = (upper: boolean, o: GsOpts) => ({ increment: upper ? MICRO_UP : MICRO_LOW, deload: 0.1, amrapBonus: { reps: o.bonusAt, increments: 2 }, count: o.count });
const gsMain = (id: string, lift: string, upper: boolean, o: GsOpts, sets3 = true) =>
  lin(id, lift, "MAIN", sets3 ? 3 : 1, 5, { ...gs(upper, o), amrap: true });
/** Chin-ups as 3×5+ with added weight (start at 0 = bodyweight). */
const gsChins = (id: string, o: GsOpts) => lin(id, "chinUp", "MAIN", 3, 5, { ...gs(true, o), amrap: true, note: "weight = added load; bodyweight is 0" });

/** Squat, deadlift, squat each week while the upper-body pair alternates every session:
 *  a 6-session rotation (ABA / BAB with the lower lift on its own Mon-Wed-Fri cycle). */
const sixSessions = (a: SlotDef[], b: SlotDef[], sq: SlotDef, dl: SlotDef, na: string, nb: string) => [
  { id: "1", name: `Mon · ${na} / Squat`, slots: [...a, sq] },
  { id: "2", name: `Wed · ${nb} / Deadlift`, slots: [...b, dl] },
  { id: "3", name: `Fri · ${na} / Squat`, slots: [...a, sq] },
  { id: "4", name: `Mon · ${nb} / Squat`, slots: [...b, sq] },
  { id: "5", name: `Wed · ${na} / Deadlift`, slots: [...a, dl] },
  { id: "6", name: `Fri · ${nb} / Squat`, slots: [...b, sq] },
];

// GreySkull: Johnny Pain's original forum post (quoted on LiftVault's GreySkull page). Bench or
// press alternating, 2×5 + 1×5+; squat Mon/Fri 2×5 + 1×5+, deadlift Wed 1×5+; curls 2×10–15 on
// bench days, weighted chins 2×6–8 on press days; bodyweight chins every day. +2.5 lb presses and
// curls, +5 lb squat/deadlift; "when reps on the last set fall below 5" → −10%.
const GS: GsOpts = { count: "lastSet", bonusAt: 10 };
// r/Fitness wiki (Phrak's GSLP, Basic Beginner Routine): "more than 10 reps on your AMRAP set → double",
// "fail to perform at least 15 reps combined across all sets → deload 10%".
const RF: GsOpts = { count: "total", bonusAt: 11 };

export const greyskull: ProgramTemplate = {
  id: "greyskull",
  name: "GreySkull LP",
  author: "John Sheaffer",
  source: "Johnny Pain's original GreySkull LP forum post (quoted on LiftVault's GreySkull page); 10+ double jump from the e-book summaries (fitnessvolt.com)",
  summary: "Alternate bench and overhead press, 2×5 then an AMRAP set; squat twice a week, deadlift once. Big AMRAPs earn double jumps; a last set under five resets that lift 10%.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [
    { key: "arms", label: "Curls & chins", default: "on", choices: [{ value: "on", label: "Curls on bench days, weighted chins on press days" }, { value: "off", label: "Main lifts only" }] },
  ],
  build(o) {
    const arms = (o.arms ?? "on") === "on";
    const bench: SlotDef[] = [gsMain("bench", "bench", true, GS)];
    const press: SlotDef[] = [gsMain("ohp", "ohp", true, GS)];
    if (arms) {
      bench.push(dbl("curl", "barbellCurl", 2, 10, 15, MICRO_UP));
      press.push({ ...dbl("chin", "chinUp", 2, 6, 8, MICRO_UP), note: "weighted, once you can do 6–8 at bodyweight; weight = added load" });
    }
    return {
      templateId: "greyskull",
      name: "GreySkull LP",
      sessionsPerWeek: 3,
      microplates: true,
      days: sixSessions(bench, press, gsMain("sq", "squat", false, GS), gsMain("dl", "deadlift", false, GS, false), "Bench", "Press"),
      notes: [
        "Shown as 3×5+: two sets of five, then the AMRAP. Deadlift is a single AMRAP set (1×5+).",
        "Bench and press alternate every session; squat Monday and Friday, deadlift Wednesday.",
        "Last set 5+ → +2.5 lb upper, +5 lb lower next time; 10+ → double the jump.",
        "Last set under 5 → take 10% off that lift and go for an AMRAP rep PR on the way back up.",
        "Bodyweight chin-ups every session as well (not tracked).",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { bench: 95, sq: 135, ohp: 65, chin: 0, dl: 155, curl: 45 }), trainingMaxes: {} };
  },
};

export const phrakGslp: ProgramTemplate = {
  id: "phrak-gslp",
  name: "Phrak's GSLP",
  author: "/u/phrakture (after John Sheaffer)",
  source: "r/Fitness wiki: Phrak's Greyskull LP variant (archived 2018 copy)",
  summary: "The r/Fitness take on GreySkull: OHP with chins and bench with rows alternate every session, squat twice a week and deadlift once, every lift 3×5+.",
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
      days: sixSessions([gsMain("ohp", "ohp", true, RF), gsChins("chin", RF)], [gsMain("bench", "bench", true, RF), gsMain("row", "row", true, RF)],
        gsMain("sq", "squat", false, RF), gsMain("dl", "deadlift", false, RF, false), "OHP / Chin-up", "Bench / Row"),
      notes: [
        "OHP + chin-ups and bench + rows alternate every session; squat Monday and Friday, deadlift Wednesday.",
        "3×5+: the last set is AMRAP. At least 15 reps in total (5 on the deadlift) → +2.5 lb upper, +5 lb lower next time; more than 10 on the AMRAP → double it.",
        "Fewer than 15 total reps → drop that lift 10%. Rest 2–3 minutes; run it for up to three months.",
      ],
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
  source: "thefitness.wiki: r/Fitness Basic Beginner Routine",
  summary: "The r/Fitness starter program: row, bench, squat on A; chin-up, OHP, deadlift on B. Every lift is 3×5+ with the last set AMRAP.",
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
        { id: "A", name: "Workout A · Row / Bench / Squat", slots: [gsMain("row", "row", true, RF), gsMain("bench", "bench", true, RF), gsMain("sq", "squat", false, RF)] },
        { id: "B", name: "Workout B · Chin-up / OHP / Deadlift", slots: [gsChins("chin", RF), gsMain("ohp", "ohp", true, RF), gsMain("dl", "deadlift", false, RF)] },
      ],
      notes: [
        "Alternate A and B (ABA, BAB). Run it for up to three months, then GZCLP or 5/3/1 for Beginners.",
        "AMRAP: stop 1–2 reps shy of failure. At least 15 reps in total → +2.5 lb upper, +5 lb lower next time; more than 10 on the AMRAP → +5 / +10 instead.",
        "Fewer than 15 total reps → deload that lift 10%. Do cardio at least twice a week.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: conv(unit, { row: 85, bench: 95, sq: 135, chin: 0, ohp: 65, dl: 135 }), trainingMaxes: {} };
  },
};

// ───────────────────────── Ice Cream Fitness 5×5 ─────────────────────────

// ICF 5×5 1.0 calculator (LiftVault's linked sheet, a community revision of Blaha's): squat +5 lb a
// session, bench and the A-day row +5 lb, deadlift +5 lb, OHP +2.5 lb, the B-day row its own lighter
// progression; accessories +2.5 lb (shrugs +5) every other session of that workout. The sheet has no
// failure rule ("% to reset", 5–15% is common); 3 strikes → −10% here, as in StrongLifts.
export const icf55: ProgramTemplate = {
  id: "icf-5x5",
  name: "Ice Cream Fitness 5×5",
  author: "Jason Blaha",
  source: "LiftVault: Ice Cream Fitness 5×5 page and its linked 1.0 calculator sheet (community revision); failure rule approximated",
  summary: "StrongLifts-style 5×5 with rows every session and 3×8 bodybuilding accessories for arms, traps and abs.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const m = { increment: UP, fails: 3, deload: 0.1 };
    const acc = (id: string, lift: string, sets = 3, reps = 8, increment = MICRO_UP) => lin(id, lift, "ACC", sets, reps, { increment, note: "the sheet adds weight every other session" });
    return {
      templateId: "icf-5x5",
      name: "Ice Cream Fitness 5×5",
      sessionsPerWeek: 3,
      microplates: true,
      days: [
        { id: "A", name: "Workout A · Squat / Bench / Row", slots: [
          lin("sq", "squat", "MAIN", 5, 5, m), lin("bench", "bench", "MAIN", 5, 5, m), lin("row", "row", "MAIN", 5, 5, m),
          acc("shrug", "shrug", 3, 8, UP), acc("skull", "skullcrusher"), acc("curl", "barbellCurl"),
          acc("hyper", "backExtension", 2, 10), acc("crunch-a", "cableCrunch", 3, 10),
        ] },
        { id: "B", name: "Workout B · Squat / Deadlift / OHP / Row", slots: [
          lin("sq", "squat", "MAIN", 5, 5, m), lin("dl", "deadlift", "MAIN", 1, 5, { ...m, increment: MICRO_LOW }), lin("ohp", "ohp", "MAIN", 5, 5, { ...m, increment: MICRO_UP }),
          lin("row-b", "row", "MAIN", 5, 5, { ...m, note: "lighter than A-day rows (about 10%)" }),
          acc("cg", "cgBench"), acc("curl", "barbellCurl"), acc("crunch-b", "cableCrunch", 3, 10),
        ] },
      ],
      notes: [
        "Alternate A and B. Squat is one progression across both days; B-day rows run about 10% lighter than A-day rows.",
        "+5 lb each session on squat, bench, rows and deadlift; +2.5 lb on OHP. Three misses at a weight → -10%.",
        "Accessories: +2.5 lb (shrugs +5) once you complete every set; the sheet only adds every other session, so hold a session if you like.",
      ],
    };
  },
  defaults(unit) {
    return {
      startWeights: conv(unit, { sq: 135, bench: 95, row: 85, "row-b": 75, dl: 155, ohp: 65, shrug: 95, skull: 45, curl: 45, hyper: 0, "crunch-a": 50, "crunch-b": 50, cg: 75 }),
      trainingMaxes: {},
    };
  },
};

// ───────────────────────── Fierce 5 ─────────────────────────

// Original bodybuilding.com post (2014 repost, forum.lowyat.net) and fitnessvolt.com's write-up
// (whose lineup is used): "Each week you'll add 5 lbs to all of your upper body lifts and 10lbs to
// all of your lower body lifts." The week alternates ABA / BAB, so the main lifts run off a weekly
// working weight that goes up every week. No failure rule in the source (FitnessVolt: stalled for a
// few weeks → back off 10–15% and rebuild, or move on).
const F5_MAIN = (n: number, reps: number): PercentSet[][] => [Array.from({ length: n }, () => ({ pct: 1, reps }))];

export const fierce5: ProgramTemplate = {
  id: "fierce5",
  name: "Fierce 5",
  author: "Fierce 5 (bodybuilding.com forums)",
  source: "Original bodybuilding.com post (2014 repost) for the weekly progression · fitnessvolt.com Fierce 5 write-up for the exercises",
  summary: "Short A/B full-body novice program: squat, bench and Pendlay rows on A; front squat, press and RDLs on B, with supersetted accessories. Weights go up every week.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const main = (id: string, lift: string, tier: Tier, sets: number, reps: number) => pctSlot(id, lift, tier, F5_MAIN(sets, reps));
    const A: SlotDef[] = [
      main("sq", "squat", "MAIN", 3, 5), main("bench", "bench", "MAIN", 3, 5), main("pendlay", "pendlayRow", "SUPP", 3, 8),
      dbl("facepull", "facePull", 3, 10, 15, W(2.5, 2.5)),
      { ...dbl("calf", "calfRaise", 2, 15, 20, W(5, 2.5)), note: "superset with pushdowns" },
      { ...dbl("pushdown", "tricepPushdown", 2, 10, 15, W(2.5, 2.5)), note: "superset with calf raises" },
    ];
    const B: SlotDef[] = [
      main("fsq", "frontSquat", "MAIN", 3, 5), main("ohp", "ohp", "MAIN", 3, 5), main("rdl", "rdl", "SUPP", 3, 8),
      dbl("pulldown", "latPulldown", 3, 8, 12, W(5, 2.5)),
      fixed("abs", "cableCrunch", 2, 15, { note: "any ab exercise · superset with curls" }),
      { ...dbl("curl", "barbellCurl", 2, 10, 15), note: "superset with abs" },
    ];
    return {
      templateId: "fierce5",
      name: "Fierce 5",
      sessionsPerWeek: 3,
      maxLabel: "Working weight",
      // Week 1: A B A, week 2: B A B.
      days: [
        { id: "A1", name: "Workout A", weeks: [0], slots: A },
        { id: "B", name: "Workout B", slots: B },
        { id: "A", name: "Workout A", slots: A },
        { id: "B2", name: "Workout B", weeks: [1], slots: B },
      ],
      cycle: { weeks: 2, weekNames: ["Week A·B·A", "Week B·A·B"], tmIncrease: { squat: LOW, frontSquat: LOW, rdl: LOW, bench: UP, ohp: UP, pendlayRow: UP }, tmIncreaseEvery: 1 },
      notes: [
        "Alternate A and B, three days a week (ABA, then BAB). Rest 2–3 min on the 3×5s, 60–90 s on the rest.",
        "Main lifts go up every week: +5 lb upper body, +10 lb lower body.",
        "Stalled for a few weeks? Back off 10–15% and build up again (an Adjustment), or move to an intermediate program.",
      ],
    };
  },
  defaults(unit) {
    return {
      startWeights: conv(unit, { facepull: 30, calf: 90, pushdown: 30, pulldown: 80, abs: 0, curl: 45 }),
      trainingMaxes: conv(unit, { squat: 135, bench: 95, pendlayRow: 85, frontSquat: 95, ohp: 65, rdl: 115 }),
    };
  },
};

// ───────────────────────── AllPro Simple Beginner Routine ─────────────────────────

const ALLPRO_REPS = [8, 9, 10, 11, 12];
const ALLPRO_LIFTS: [string, string][] = [["sq", "squat"], ["bench", "bench"], ["row", "row"], ["ohp", "ohp"], ["sldl", "stiffLegDeadlift"], ["urow", "uprightRow"], ["calf", "calfRaise"]];
/** Week 5 heavy day: 12 on both work sets → +10% for the next cycle; anything less → same weight. */
const ALLPRO_RULE: TmRule = { type: "amrapVsTarget", setIndex: 1, allSets: true, table: [{ diff: -99, pct: 0 }, { diff: 0, pct: 0.1 }] };

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

// Madcow's original page ("Linear 5x5", stronglifts.com/madcow, 2010 archive): Monday ramps to a
// top set of 5 in 12.5% steps; Wednesday squat repeats Monday's 3rd set, press and deadlift ramp to
// their own top set; Friday is Monday's first four sets, a triple 2.5% over Monday's top set, then
// 1×8 at the 3rd set's weight. Top sets go up 2.5% a week; the 5RM you enter is hit in week 4
// (weeks 1–3 are 0.975 / 0.9506 / 0.9269 of it, here 1/1.025³ ≈ 0.929 at the start). "If you miss
// reps, keep the weight constant the next week." Not a fixed-length program: run it until it stalls.
const MAD_START = Math.pow(1.025, -3);
const ramp = (f: number, pcts: number[], reps = 5): PercentSet[] => pcts.map((p) => ({ pct: f * p, reps }));
const MAD_MON = [ramp(MAD_START, [0.5, 0.625, 0.75, 0.875, 1])];
const MAD_WED_SQ = [ramp(MAD_START, [0.5, 0.625, 0.75, 0.75])];
const MAD_WED = [ramp(MAD_START, [0.625, 0.75, 0.875, 1])];
const MAD_FRI = [[...ramp(MAD_START, [0.5, 0.625, 0.75, 0.875]), { pct: MAD_START * 1.025, reps: 3 }, { pct: MAD_START * 0.75, reps: 8 }]];
/** Top set of 5 made → the lift's 5RM target (and every set) +2.5% next week; missed → same weights. */
const MAD_RULE = (setIndex: number): TmRule => ({ type: "amrapVsTarget", setIndex, table: [{ diff: -99, pct: 0 }, { diff: 0, pct: 0.025 }], applyAt: "weekEnd" });

export const madcow: ProgramTemplate = {
  id: "madcow",
  name: "Madcow 5×5",
  author: "Madcow2 (after Bill Starr)",
  source: "Madcow's original \"Linear 5x5\" page (stronglifts.com/madcow, 2010 archive) · LiftVault Madcow overview",
  summary: "Heavy-light-medium 5×5 with ramping sets. Monday's top set of five and Friday's triple climb 2.5% a week; Wednesday is a light squat day. Miss and the weights hold.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [3],
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
          pctSlot("mon-sq", "squat", "MAIN", MAD_MON, "squat", MAD_RULE(4)), pctSlot("mon-bench", "bench", "MAIN", MAD_MON, "bench", MAD_RULE(4)), pctSlot("mon-row", "row", "MAIN", MAD_MON, "row", MAD_RULE(4)),
          fixed("mon-hyper", "backExtension", 2, 10, { repsMax: 12, note: "weighted" }), fixed("mon-situp", "sitUp", 4, 10, { note: "weighted" }),
        ] },
        { id: "WED", name: "Wednesday · Light", slots: [
          pctSlot("wed-sq", "squat", "MAIN", MAD_WED_SQ), pctSlot("wed-press", press, "MAIN", MAD_WED, press, MAD_RULE(3)), pctSlot("wed-dl", "deadlift", "MAIN", MAD_WED, "deadlift", MAD_RULE(3)),
          fixed("wed-situp", "sitUp", 3, 10),
        ] },
        { id: "FRI", name: "Friday · Medium + triple", slots: [
          pctSlot("fri-sq", "squat", "MAIN", MAD_FRI), pctSlot("fri-bench", "bench", "MAIN", MAD_FRI), pctSlot("fri-row", "row", "MAIN", MAD_FRI),
          fixed("fri-dip", "dip", 3, 5, { repsMax: 8, note: "weighted" }), fixed("fri-curl", "barbellCurl", 3, 8), fixed("fri-tri", "skullcrusher", 3, 8),
        ] },
      ],
      notes: [
        "Enter your current 5RMs. The first three weeks build up to them (week 1 ≈ 93%); from week 4 every week is a new PR.",
        "Make the top set of 5 (Monday: squat, bench, row; Wednesday: press, deadlift) and that lift goes up 2.5% next week. Miss reps and the weights stay the same.",
        "Friday: four ramp sets, a triple 2.5% over Monday's top set, then one back-off set of 8 at the 3rd set's weight.",
        "Run it until most lifts stall, then reset (an Adjustment) and build back up over about four weeks.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { squat: 245, bench: 185, row: 155, ohp: 115, inclineBench: 155, deadlift: 295 }), startWeights: {} };
  },
};

// ───────────────────────── Bill Starr 5×5 ─────────────────────────

// The Strongest Shall Survive (1976), as summarised by breakingmuscle.com "5×5 Workout Explained":
// power clean, bench and squat, five ramped sets of five done as a circuit; heavy, light (80%) and
// medium (90%) days; once a week the overhead press replaces the bench. Ramp spacing (12.5%) and
// weekly jumps (+10 lb squat, +5 lb others) are LiftVault's settings. Miss the top set → same weight.
const STARR_RAMP = [0.5, 0.625, 0.75, 0.875, 1];
const starr = (f: number) => [ramp(f, STARR_RAMP)];
const STARR_RULE: TmRule = { type: "amrapVsTarget", setIndex: 4, table: [{ diff: -99, increments: 0 }, { diff: 0, increments: 1 }], applyAt: "weekEnd" };

export const billStarr: ProgramTemplate = {
  id: "bill-starr",
  name: "Bill Starr 5×5",
  author: "Bill Starr",
  source: "The Strongest Shall Survive (1976), via breakingmuscle.com; ramp spacing and increments from LiftVault (approximation)",
  summary: "The original heavy-light-medium Big Three: power clean, bench and squat, ramping five sets of five to a top set that goes up every week you make it.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const heavy = (id: string, lift: string) => pctSlot(id, lift, "MAIN", starr(1), lift, STARR_RULE);
    return {
      templateId: "bill-starr",
      name: "Bill Starr 5×5",
      sessionsPerWeek: 3,
      maxLabel: "Heavy-day top set (5RM)",
      tmIncrement: { squat: LOW, bench: UP, powerClean: UP, ohp: UP },
      days: [
        { id: "MON", name: "Monday · Heavy", slots: [heavy("mon-pc", "powerClean"), heavy("mon-bench", "bench"), heavy("mon-sq", "squat")] },
        { id: "WED", name: "Wednesday · Light (80%)", slots: [pctSlot("wed-pc", "powerClean", "MAIN", starr(0.8)), heavy("wed-ohp", "ohp"), pctSlot("wed-sq", "squat", "MAIN", starr(0.8))] },
        { id: "FRI", name: "Friday · Medium (90%)", slots: [pctSlot("fri-pc", "powerClean", "MAIN", starr(0.9)), pctSlot("fri-bench", "bench", "MAIN", starr(0.9)), pctSlot("fri-sq", "squat", "MAIN", starr(0.9))] },
      ],
      notes: [
        "Five sets of five, each heavier, finishing at the day's top set. Do the three lifts as a circuit if you like.",
        "Wednesday works up to ~80% of Monday, Friday to ~90%. The overhead press replaces the bench on Wednesday.",
        "Make the heavy top set and it goes up next week: +10 lb squat, +5 lb clean, bench and press. Miss → same weight.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { powerClean: 135, bench: 165, squat: 225, ohp: 105 }), startWeights: {} };
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
    const chins = fixed("chin", "chinUp", 3, 5, { amrapLast: true, note: "bodyweight, all three sets to failure, 5 min rest" });
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
