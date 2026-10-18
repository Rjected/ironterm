// Old-school and bodyweight classics.
//
// Sources:
//   Reg Park 5×5     Phase I as listed by thebarbell.com / mirafit / breakingmuscle write-ups of Park's
//                    Strength & Bulk Training: back extension 3×10, squat, bench and deadlift 5×5
//                    (two progressively heavier sets, then three at the working weight), three days a
//                    week. Add weight once all three work sets get 5. Phases II–III differ between
//                    sources, so only Phase I is here.
//   Super Squats     Randall Strossen's 6-week 20-rep squat program as laid out by LiftVault: press
//                    3×12, bench 3×12, row 3×15, breathing squat 1×20 straight into a light pullover
//                    1×20, stiff-legged deadlift 1×15, curl 2×15, calf raise 3×20. Squat +5 lb every
//                    session (repeat the weight after a miss); others go up when every rep is made.
//   Hepburn          LiftVault "Doug Hepburn Method" Program A: squat + bench one day, deadlift +
//                    press the next, four days a week. Power 8×2 at ~80% building one rep a session to
//                    8×3, pump 3×6 at ~60% building to 3×8; then +5–10 lb and back to the bottom.
//                    That's double progression (8×2–3, 3×6–8).
//   Golden Six       Arnold Schwarzenegger's early routine as widely published: squat 4×10, wide-grip
//                    bench 3×10, chin-ups 3×max, behind-the-neck press 4×10, curl 3×10, sit-ups
//                    3–4×max, three days a week. Weight goes up when every set gets 10.
//   BWF RR           r/bodyweightfitness Recommended Routine (wiki; Liftosaur's write-up of the 2018
//                    version): three pairs (pull-up + squat, dip + hinge, row + push-up) at 3×5–8 on the
//                    hardest progression you can do, graduating at 3×8, plus a core triplet at 3×8–12.

import type { DayDef, ProgramTemplate, SlotDef, Stage, Tier, Weights } from "../program";
import type { Unit } from "../units";

const kg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (unit: Unit, rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));
const UP: Weights = { lb: 5, kg: 2.5 };
const LOW: Weights = { lb: 10, kg: 5 };
const st = (sets: number, reps: number): Stage => ({ sets, reps, amrap: false });

/** Add weight when every rep is made; a miss repeats the weight. */
const lin = (id: string, lift: string, tier: Tier, sets: number, reps: number, increment: Weights, note?: string): SlotDef => ({
  id, lift, tier, note, progression: { kind: "stages", stages: [st(sets, reps)], advance: { type: "baseVolume" }, onFinalFail: { type: "hold" }, increment },
});
const dbl = (id: string, lift: string, tier: Tier, sets: number, lo: number, hi: number, increment: Weights, note?: string): SlotDef => ({
  id, lift, tier, note, progression: { kind: "double", sets, reps: [lo, hi], increment },
});
const fixed = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string, tier: Tier = "ACC"): SlotDef => ({
  id, lift, tier, progression: { kind: "fixed", sets, reps, repsMax, note },
});

// ───────────────────────── Reg Park 5×5 ─────────────────────────

export const regPark: ProgramTemplate = {
  id: "reg-park-5x5",
  name: "Reg Park 5×5 (Phase I)",
  author: "Reg Park",
  source: "Strength & Bulk Training for Weight Lifters & Body Builders (1960), Phase I as summarised by thebarbell.com and breakingmuscle.com",
  summary: "The 5×5 that taught Arnold: back extensions, then squat, bench and deadlift for two ramp-up fives and three heavy fives, three days a week.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  then: { when: "Park ran each phase for about three months before moving on to heavier, more varied work; when Phase I stalls, a weekly-progression 5×5 such as Madcow is the natural next step.", id: "madcow" },
  options: [],
  build() {
    const ramp = "two warm-up sets of 5 first, building to the working weight";
    return {
      templateId: "reg-park-5x5",
      name: "Reg Park 5×5",
      sessionsPerWeek: 3,
      days: [{ id: "A", name: "Workout · Squat / Bench / Deadlift", slots: [
        fixed("rp-bx", "backExtension", 3, 10, undefined, "warm-up for the back"),
        lin("rp-sq", "squat", "MAIN", 3, 5, LOW, ramp),
        lin("rp-bp", "bench", "MAIN", 3, 5, UP, ramp),
        lin("rp-dl", "deadlift", "MAIN", 3, 5, LOW, ramp),
      ] }],
      notes: [
        "Each lift is 5×5: the first two sets are progressively heavier warm-ups, the last three are at your working weight. Only those three count.",
        "All three work sets for 5 → add weight next session (+10 lb squat/deadlift, +5 lb bench). Miss → stay there.",
        "Three non-consecutive days a week; rest 3–5 minutes between the heavy sets.",
      ],
    };
  },
  defaults: (unit) => ({ startWeights: conv(unit, { "rp-bx": 0, "rp-sq": 155, "rp-bp": 115, "rp-dl": 185 }), trainingMaxes: {} }),
};

// ───────────────────────── Super Squats ─────────────────────────

export const superSquats: ProgramTemplate = {
  id: "super-squats",
  name: "Super Squats (20-Rep Squats)",
  author: "Randall Strossen (after J.C. Hise and Peary Rader)",
  source: "Super Squats (IronMind, 1989), program as laid out by LiftVault \"Super Squats\"",
  summary: "Six weeks built on one brutal set: 20 breathing squats with your 10-rep max, +5 lb every session, then a light pullover to stretch the ribcage.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 6,
  then: { when: "After six weeks, take an easy week, then go back to a normal program; most people don't repeat it straight away." },
  options: [],
  build() {
    const small: Weights = { lb: 5, kg: 2.5 };
    const slots: SlotDef[] = [
      lin("ss-press", "ohp", "ACC", 3, 12, small, "behind the neck or in front"),
      lin("ss-bench", "bench", "ACC", 3, 12, small),
      lin("ss-row", "row", "ACC", 3, 15, small),
      lin("ss-squat", "squat", "MAIN", 1, 20, { lb: 5, kg: 2.5 }, "breathing squat: steady to 8–10, then 2–3 deep breaths before every rep. Don't rack it until 20."),
      fixed("ss-pullover", "pullover", 1, 20, undefined, "light, straight after the squat, breathing deep", "SUPP"),
      lin("ss-sldl", "stiffLegDeadlift", "ACC", 1, 15, small),
      lin("ss-curl", "barbellCurl", "ACC", 2, 15, small),
      lin("ss-calf", "calfRaise", "ACC", 3, 20, small),
    ];
    const days: DayDef[] = ["Monday", "Wednesday", "Friday"].map((d, i) => ({ id: "MWF"[i], name: d, slots }));
    return {
      templateId: "super-squats",
      name: "Super Squats",
      sessionsPerWeek: 3,
      days,
      cycle: { weeks: 6, finite: true },
      notes: [
        "Start the squat with a weight you'd normally do for 10, and do 20 with it. Make all 20 → +5 lb next session; miss → repeat it.",
        "Eat big: the program assumes a large calorie surplus and plenty of milk or protein.",
        "Every other exercise: when every rep is made, add a little weight.",
      ],
    };
  },
  defaults: (unit) => ({ startWeights: conv(unit, { "ss-press": 65, "ss-bench": 95, "ss-row": 85, "ss-squat": 155, "ss-pullover": 20, "ss-sldl": 95, "ss-curl": 45, "ss-calf": 90 }), trainingMaxes: {} }),
};

// ───────────────────────── Hepburn ─────────────────────────

export const hepburn: ProgramTemplate = {
  id: "hepburn",
  name: "Doug Hepburn Method",
  author: "Doug Hepburn",
  source: "LiftVault \"Doug Hepburn Method Powerbuilding Program\" (Program A)",
  summary: "Power and pump on every lift: 8 doubles that become 8 triples, then 3×6 that becomes 3×8, a rep at a time. Then add weight and start over.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [],
  build() {
    const lift = (pre: string, l: string, inc: Weights): SlotDef[] => [
      dbl(`${pre}-power`, l, "MAIN", 8, 2, 3, inc, "power: add one rep to one set each session"),
      dbl(`${pre}-pump`, l, "SUPP", 3, 6, 8, inc, "pump: add one rep to one set each session"),
    ];
    return {
      templateId: "hepburn",
      name: "Hepburn Method",
      sessionsPerWeek: 4,
      days: [
        { id: "A", name: "Day A · Squat / Bench", slots: [...lift("hb-sq", "squat", LOW), ...lift("hb-bp", "bench", UP)] },
        { id: "B", name: "Day B · Deadlift / Press", slots: [...lift("hb-dl", "deadlift", LOW), ...lift("hb-ohp", "ohp", UP)] },
      ],
      notes: [
        "Power: start at about 80% of your 1RM for 8 sets of 2. Same weight each session, add a rep to one set until you get 8 sets of 3, then add 5–10 lb and go back to 8×2.",
        "Pump: start at about 60% of your 1RM for 3 sets of 6, build to 3 sets of 8 the same way, then add weight.",
        "Optional extras: heavy rows, chins and dips. Move from doubles to singles (Program B) once doubles feel easy.",
      ],
    };
  },
  defaults: (unit) => {
    const orm = { sq: 315, bp: 225, dl: 385, ohp: 145 };
    const r = (v: number, p: number) => Math.round((v * p) / 5) * 5;
    return { startWeights: conv(unit, Object.fromEntries(Object.entries(orm).flatMap(([k, v]) => [[`hb-${k}-power`, r(v, 0.8)], [`hb-${k}-pump`, r(v, 0.6)]]))), trainingMaxes: {} };
  },
};

// ───────────────────────── Golden Six ─────────────────────────

export const goldenSix: ProgramTemplate = {
  id: "golden-six",
  name: "Arnold's Golden Six",
  author: "Arnold Schwarzenegger",
  source: "Arnold's early full-body routine, as widely published (e.g. Muscle & Strength, T-Nation)",
  summary: "Six exercises, three days a week: squat, wide-grip bench, chins, behind-the-neck press, curls and sit-ups. Add weight when you hit every rep.",
  category: "hypertrophy",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    return {
      templateId: "golden-six",
      name: "Golden Six",
      sessionsPerWeek: 3,
      days: [{ id: "A", name: "Workout · Full body", slots: [
        lin("g6-sq", "squat", "MAIN", 4, 10, LOW),
        lin("g6-bp", "wideBench", "MAIN", 3, 10, UP),
        { id: "g6-chin", lift: "chinUp", tier: "MAIN", progression: { kind: "fixed", sets: 3, reps: 1, amrapLast: true, note: "every set as many as you can" } },
        lin("g6-ohp", "ohp", "MAIN", 4, 10, UP, "behind the neck in the original; in front is fine"),
        lin("g6-curl", "barbellCurl", "ACC", 3, 10, UP),
        { id: "g6-situp", lift: "sitUp", tier: "ACC", progression: { kind: "fixed", sets: 3, reps: 1, amrapLast: true, note: "bent-knee, every set as many as you can (3–4 sets)" } },
      ] }],
      notes: [
        "Three non-consecutive days a week. Rest about 90 seconds between sets.",
        "When you get every rep of every set, add weight next time. Chins and sit-ups: beat last time's reps.",
      ],
    };
  },
  defaults: (unit) => ({ startWeights: conv(unit, { "g6-sq": 135, "g6-bp": 115, "g6-chin": 0, "g6-ohp": 75, "g6-curl": 55, "g6-situp": 0 }), trainingMaxes: {} }),
};

// ───────────────────────── r/bodyweightfitness Recommended Routine ─────────────────────────

export const bwfRR: ProgramTemplate = {
  id: "bwf-rr",
  name: "Bodyweight Fitness Recommended Routine",
  author: "r/bodyweightfitness",
  source: "r/bodyweightfitness wiki: Recommended Routine (2018 version, as written up by Liftosaur)",
  summary: "The internet's standard bodyweight program: pull-up/squat, dip/hinge and row/push-up pairs at 3×5–8, moving up a progression at 3×8, plus a core triplet.",
  category: "bodyweight",
  level: "beginner",
  daysPerWeek: [3],
  then: { when: "It doesn't end: keep climbing each progression. At the top of a ladder, add weight (vest or belt), or move to the skill-focused routines in the r/bodyweightfitness wiki." },
  options: [],
  build() {
    const main = (id: string, lift: string, ladder: string) => fixed(id, lift, 3, 5, 8, `${ladder}. At 3×8, move to the next one`, "MAIN");
    const core = (id: string, lift: string, ladder: string) => fixed(id, lift, 3, 8, 12, `${ladder}. At 3×12, move to the next one`);
    return {
      templateId: "bwf-rr",
      name: "BWF Recommended Routine",
      sessionsPerWeek: 3,
      days: [{ id: "A", name: "Workout · Full body", slots: [
        main("rr-pull", "pullUp", "scapular pull-up → arch hang → negative → pull-up"),
        main("rr-squat", "bulgarianSplitSquat", "assisted squat → squat → split squat → Bulgarian split squat → shrimp squat"),
        main("rr-dip", "dip", "support hold → negative dip → dip"),
        main("rr-hinge", "nordicCurl", "bodyweight RDL → single-leg RDL → banded Nordic → Nordic curl"),
        main("rr-row", "invertedRow", "vertical row → incline row → inverted row → wide row"),
        main("rr-push", "pushUp", "wall → incline → push-up → diamond → pseudo-planche push-up"),
        core("rr-antiext", "abWheel", "plank → kneeling ab rollout → ab rollout"),
        core("rr-antirot", "pallofPress", "banded Pallof press"),
        core("rr-ext", "backExtension", "reverse hyperextension or back extension"),
      ] }],
      notes: [
        "Do the pairs as supersets: pull-up + squat, dip + hinge, row + push-up, 90 seconds between them. Then the core triplet, 60 seconds rest.",
        "Pick the hardest step of each progression you can do for 3×5 with clean form. Add reps each session; at 3×8 move to the next step and start again at 3×5.",
        "Timed holds (arch hang, support hold, plank): add 5 seconds a session; move on at 30 seconds (60 for the support hold).",
        "Warm up first (5–10 minutes). Stop each set a rep short of failure.",
      ],
    };
  },
  defaults: () => ({ startWeights: {}, trainingMaxes: {} }),
};

export const CLASSIC_TEMPLATES = [regPark, superSquats, hepburn, goldenSix, bwfRR];
