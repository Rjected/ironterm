// Hypertrophy / upper-lower programs: Reddit PPL, PHUL, PHAT, Lyle McDonald's Generic Bulking
// Routine, Ivysaur 4-4-8 and the Candito Linear Program.
//
// None of these are in Dan's Drive. Sources are published write-ups (original pages were often
// blocked, so most numbers come from faithful secondary copies, cross-checked):
//   Reddit PPL   /u/Metallicadpa's r/Fitness post, via LiftVault, Liftosaur and Boostcamp copies.
//                Pull: deadlift 1×5+ / barbell row 4×5,1×5+ (alternating), pulldown 3×8–12, cable
//                row 3×8–12, face pull 5×15–20, hammer + DB curl 4×8–12. Push: bench 4×5,1×5+ /
//                OHP 4×5,1×5+ (alternating, the other one 3×8–12), incline DB 3×8–12, pushdown
//                3×8–12 + lateral raise 3×15–20, OH extension 3×8–12 + lateral raise 3×15–20.
//                Legs: squat 2×5,1×5+, RDL, leg press, leg curl 3×8–12, calf raise 5×8–12.
//                +5 lb (2.5 kg) a session, +10 lb (5 kg) deadlift; three misses in a row → -10%.
//                Accessories: hit the top of the range on every set → add weight.
//   PHUL         Brandon Campbell, muscleandstrength.com (via Liftosaur / Boostcamp copies).
//                3–4 sets is written as 3 here (the low end); do more if you like.
//   PHAT         Layne Norton, simplyshredded.com 2011 (via LiftVault, a Starting Strength forum
//                transcription and memory). Speed work is 6×3 at 65–70% of that week's power-day
//                weight; 70% is used here.
//   Lyle GBR     bodyrecomposition.com forum sticky, via JCDFitness' write-up. Thursday's
//                deadlift / leg press day and Friday's incline-and-pulldown-first day are Lyle's
//                suggested variations ("repeat" option runs the same two days twice).
//   Ivysaur      r/Fitness post by /u/ivysaur via Liftosaur's script and drworkout.fitness.
//                Weights are a "4-rep weight" per lift; 4×8 work is at 90% of it.
//   Candito LP   CanditoTrainingHQ free PDF via LiftVault and physiqz.com. Heavy days and the
//                Strength/Control days are as published. The Strength/Hypertrophy variation days
//                are APPROXIMATED (5×8 squat / DB bench / row, 3×8 SLDL) from LiftVault's and
//                MyWorkouts' summaries; check them against the PDF before relying on them.

import { LIFTS } from "../lifts";
import type { DayDef, PercentSet, ProgramDef, ProgramTemplate, SlotDef, Stage, Tier, TmRule, Weights } from "../program";
import { loadStep, roundTo, type Unit } from "../units";

// ───────────────────────── helpers ─────────────────────────

const kg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (unit: Unit, rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));
const W = (lb: number, kgs: number): Weights => ({ lb, kg: kgs });
const UP = W(5, 2.5);
const LOW = W(10, 5);
const DB = W(5, 2);


const BIG_LOWER = new Set(["squat", "deadlift", "frontSquat", "legPress", "hackSquat", "rdl", "stiffLegDeadlift", "pauseSquat", "pauseDeadlift"]);
/** Default jump: dumbbells 5 lb / 2 kg, big lower-body lifts 10 lb / 5 kg, everything else 5 lb / 2.5 kg. */
const incFor = (lift: string): Weights => (LIFTS[lift]?.kind === "dumbbell" ? DB : BIG_LOWER.has(lift) ? LOW : UP);

const st = (sets: number, reps: number, amrap = false): Stage => ({ sets, reps, amrap });

/** Double progression in a rep range. */
const dbl = (id: string, lift: string, sets: number, lo: number, hi: number, o: { tier?: Tier; note?: string; rest?: number; increment?: Weights } = {}): SlotDef => ({
  id, lift, tier: o.tier ?? "ACC", note: o.note, restSeconds: o.rest,
  progression: { kind: "double", sets, reps: [lo, hi], increment: o.increment ?? incFor(lift) },
});

/** Linear per-session progression. */
function lin(id: string, lift: string, tier: Tier, stage: Stage, o: { increment?: Weights; fails?: number; deload?: number; dropBy?: Weights; note?: string; rest?: number } = {}): SlotDef {
  return {
    id, lift, tier, note: o.note, restSeconds: o.rest,
    progression: {
      kind: "stages", stages: [stage], advance: { type: "baseVolume" },
      onFinalFail: o.dropBy ? { type: "deloadBy", amount: o.dropBy } : o.deload ? { type: "deload", pct: o.deload } : { type: "hold" },
      increment: o.increment ?? incFor(lift), failsBeforeAction: o.fails,
    },
  };
}

const fixed = (id: string, lift: string, sets: number, reps: number, note?: string, tier: Tier = "ACC"): SlotDef => ({
  id, lift, tier, progression: { kind: "fixed", sets, reps, note },
});

const pct = (id: string, lift: string, tier: Tier, table: PercentSet[], o: { tmLift?: string; tmRule?: TmRule; note?: string; rest?: number } = {}): SlotDef => ({
  id, lift, tier, note: o.note, restSeconds: o.rest,
  progression: { kind: "percent", tmLift: o.tmLift ?? lift, weeks: [table], tmRule: o.tmRule },
});

const rep = (n: number, s: PercentSet): PercentSet[] => Array.from({ length: n }, () => ({ ...s }));

// Typical working weights (lb) for an intermediate male lifter at ~10 reps. Starting weights for
// heavier rep ranges are scaled up from these.
const BASE: Record<string, number> = {
  squat: 225, bench: 165, deadlift: 275, ohp: 105, row: 145, frontSquat: 165, inclineBench: 135,
  pauseSquat: 185, pauseDeadlift: 225, spotoPress: 145, stiffLegDeadlift: 185, rdl: 185,
  dbBench: 60, dbInclineBench: 55, dbOhp: 45, dbRow: 65, chestSupportedRow: 45, lunge: 40,
  latPulldown: 130, cableRow: 130, facePull: 40, machineChestPress: 140, chestFly: 30, inclineFly: 25,
  hammerCurl: 30, bicepCurl: 25, barbellCurl: 65, inclineCurl: 25, preacherCurl: 60, concentrationCurl: 25,
  spiderCurl: 20, tricepPushdown: 50, overheadTricep: 45, skullcrusher: 65, tricepKickback: 20,
  lateralRaise: 20, uprightRow: 75, legPress: 360, legCurl: 90, legExtension: 110, hackSquat: 200,
  calfRaise: 180, seatedCalfRaise: 90, bulgarianSplitSquat: 35, backExtension: 25,
};

/** Starting weight for every non-percent slot, scaled from BASE by the slot's rep target. */
function startWeights(def: ProgramDef, unit: Unit, over: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of def.days.flatMap((d) => d.slots)) {
    const p = s.progression;
    if (p.kind === "percent") continue;
    const reps = p.kind === "stages" ? p.stages[0].reps : p.kind === "double" ? p.reps[0] : p.reps;
    const lb = over[s.id] ?? (BASE[s.lift] ?? 0) * (reps <= 5 ? 1.15 : reps <= 8 ? 1.08 : reps >= 15 ? 0.85 : 1);
    const step = loadStep(LIFTS[s.lift]?.kind ?? "barbell", "lb");
    out[s.id] = unit === "lb" ? roundTo(lb, step) : kg(lb);
  }
  return out;
}

const pick = (o: Record<string, string>, defaults: Record<string, string>) => ({ ...defaults, ...o });

// ───────────────────────── Reddit PPL ─────────────────────────

export const redditPpl: ProgramTemplate = {
  id: "reddit-ppl",
  name: "Reddit PPL",
  author: "/u/Metallicadpa",
  source: "r/Fitness post 'A Linear Progression Based PPL Program for Beginners' (2015), via LiftVault / Liftosaur / Boostcamp copies",
  summary: "Six-day push/pull/legs. Main lifts add weight every session with an AMRAP last set; accessories use double progression in 8–12 and 15–20 rep ranges.",
  category: "hypertrophy",
  level: "beginner",
  daysPerWeek: [6],
  options: [],
  build() {
    const main = { increment: UP, fails: 3, deload: 0.1 };
    // Shared slot ids on repeated days so each lift has one progression (squat goes up twice a week).
    const pullAcc = [
      dbl("pull-pd", "latPulldown", 3, 8, 12, { note: "or pull-ups / chin-ups" }),
      dbl("pull-crow", "cableRow", 3, 8, 12, { note: "or chest-supported rows" }),
      dbl("pull-fp", "facePull", 5, 15, 20),
      dbl("pull-hc", "hammerCurl", 4, 8, 12),
      dbl("pull-curl", "bicepCurl", 4, 8, 12),
    ];
    const pushAcc = [
      dbl("push-incl", "dbInclineBench", 3, 8, 12),
      dbl("push-pd", "tricepPushdown", 3, 8, 12, { note: "superset with lateral raises" }),
      dbl("push-lr1", "lateralRaise", 3, 15, 20),
      dbl("push-ohe", "overheadTricep", 3, 8, 12, { note: "superset with lateral raises" }),
      dbl("push-lr2", "lateralRaise", 3, 15, 20),
    ];
    const legs = [
      lin("legs-sq", "squat", "MAIN", st(3, 5, true), { ...main, note: "2×5, 1×5+" }),
      dbl("legs-rdl", "rdl", 3, 8, 12),
      dbl("legs-lp", "legPress", 3, 8, 12),
      dbl("legs-lc", "legCurl", 3, 8, 12),
      dbl("legs-calf", "calfRaise", 5, 8, 12),
    ];
    const dl = lin("pull-dl", "deadlift", "MAIN", st(1, 5, true), { ...main, increment: LOW, note: "1×5+" });
    return {
      templateId: "reddit-ppl",
      name: "Reddit PPL",
      sessionsPerWeek: 6,
      days: [
        { id: "PULL1", name: "Pull · Deadlift", slots: [dl, ...pullAcc] },
        { id: "PUSH1", name: "Push · Bench", slots: [lin("push-bench", "bench", "MAIN", st(5, 5, true), { ...main, note: "4×5, 1×5+" }), dbl("push-ohp-acc", "ohp", 3, 8, 12, { tier: "SUPP" }), ...pushAcc] },
        { id: "LEGS1", name: "Legs", slots: legs },
        { id: "PULL2", name: "Pull · Row", slots: [lin("pull-row", "row", "MAIN", st(5, 5, true), { ...main, note: "4×5, 1×5+" }), ...pullAcc] },
        { id: "PUSH2", name: "Push · OHP", slots: [lin("push-ohp", "ohp", "MAIN", st(5, 5, true), { ...main, note: "4×5, 1×5+" }), dbl("push-bench-acc", "bench", 3, 8, 12, { tier: "SUPP" }), ...pushAcc] },
        { id: "LEGS2", name: "Legs", slots: legs },
      ],
      notes: [
        "Pull, push, legs, pull, push, legs, rest (PPLRPPL also works).",
        "Main lifts: last set is AMRAP. Complete all reps → +5 lb next time (+10 lb deadlift).",
        "Miss reps three sessions in a row on a lift → drop it 10%.",
        "Accessories: once every set hits the top of the range, add weight and go back to the bottom.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: startWeights(redditPpl.build({}), unit, { "pull-dl": 275, "pull-row": 135, "push-bench": 165, "push-ohp": 105, "legs-sq": 225 }), trainingMaxes: {} };
  },
};

// ───────────────────────── PHUL ─────────────────────────

export const phul: ProgramTemplate = {
  id: "phul",
  name: "PHUL",
  author: "Brandon Campbell",
  source: "muscleandstrength.com 'PHUL Workout' (published program), via Liftosaur / Boostcamp copies",
  summary: "Power Hypertrophy Upper Lower: two heavy 3–5 rep days and two 8–12 rep pump days a week, all on double progression.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [4],
  options: [],
  build() {
    const M = { tier: "MAIN" as Tier, rest: 180 };
    return {
      templateId: "phul",
      name: "PHUL",
      sessionsPerWeek: 4,
      days: [
        { id: "UP", name: "Upper Power", slots: [
          dbl("up-bench", "bench", 3, 3, 5, M), dbl("up-incl", "dbInclineBench", 3, 6, 10), dbl("up-row", "row", 3, 3, 5, M),
          dbl("up-pd", "latPulldown", 3, 6, 10), dbl("up-ohp", "ohp", 2, 5, 8, { tier: "SUPP" }), dbl("up-curl", "barbellCurl", 2, 6, 10), dbl("up-skull", "skullcrusher", 2, 6, 10),
        ] },
        { id: "LP", name: "Lower Power", slots: [
          dbl("lp-sq", "squat", 3, 3, 5, M), dbl("lp-dl", "deadlift", 3, 3, 5, M), dbl("lp-lp", "legPress", 3, 10, 15),
          dbl("lp-lc", "legCurl", 3, 6, 10), dbl("lp-calf", "calfRaise", 4, 6, 10),
        ] },
        { id: "UH", name: "Upper Hypertrophy", slots: [
          dbl("uh-incl", "inclineBench", 3, 8, 12, { tier: "SUPP" }), dbl("uh-fly", "chestFly", 3, 8, 12), dbl("uh-crow", "cableRow", 3, 8, 12),
          dbl("uh-dbrow", "dbRow", 3, 8, 12), dbl("uh-lr", "lateralRaise", 3, 8, 12), dbl("uh-icurl", "inclineCurl", 3, 8, 12), dbl("uh-tri", "overheadTricep", 3, 8, 12, { note: "cable extension" }),
        ] },
        { id: "LH", name: "Lower Hypertrophy", slots: [
          dbl("lh-fs", "frontSquat", 3, 8, 12, { tier: "SUPP" }), dbl("lh-lunge", "lunge", 3, 8, 12, { note: "barbell lunge" }), dbl("lh-le", "legExtension", 3, 10, 15),
          dbl("lh-lc", "legCurl", 3, 10, 15), dbl("lh-scalf", "seatedCalfRaise", 3, 8, 12), dbl("lh-calf", "calfRaise", 3, 8, 12, { note: "calf press on leg press" }),
        ] },
      ],
      notes: [
        "Mon Upper Power, Tue Lower Power, Thu Upper Hypertrophy, Fri Lower Hypertrophy.",
        "Most exercises are written 3–4 sets (2–3 for OHP and arms on power day); 3 is shown.",
        "Hit the top of the rep range on every set → add weight next time.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: startWeights(phul.build({}), unit), trainingMaxes: {} };
  },
};

// ───────────────────────── PHAT ─────────────────────────

// Power lifts are driven by a "power-day weight" (TM) so the hypertrophy-day speed work can be a
// percentage of it. Get 5 reps on every 3–5 set → the power-day weight goes up.
const POWER: PercentSet[] = rep(3, { pct: 1, reps: 3, repsMax: 5, target: 5 });
const SPEED: PercentSet[] = rep(6, { pct: 0.7, reps: 3 });
const POWER_RULE: TmRule = { type: "amrapVsTarget", setIndex: 2, allSets: true, table: [{ diff: -99, increments: 0 }, { diff: 0, increments: 1 }] };

export const phat: ProgramTemplate = {
  id: "phat",
  name: "PHAT",
  author: "Layne Norton",
  source: "simplyshredded.com 'Layne Norton Training Series: Full Power/Hypertrophy Routine' (2011), via LiftVault, a Starting Strength forum transcription and memory",
  summary: "Power Hypertrophy Adaptive Training: two heavy upper/lower power days, then three body-part hypertrophy days that open with 6×3 speed work at 70% of the power-day weight.",
  category: "hypertrophy",
  level: "advanced",
  daysPerWeek: [5],
  options: [],
  build() {
    const power = (id: string, lift: string) => pct(id, lift, "MAIN", POWER, { tmRule: POWER_RULE, rest: 180 });
    const speed = (id: string, lift: string) => pct(id, lift, "SUPP", SPEED, { note: "speed work: move it fast, 65–70% of power-day weight", rest: 90 });
    return {
      templateId: "phat",
      name: "PHAT",
      sessionsPerWeek: 5,
      maxLabel: "Power-day weight (3–5RM)",
      tmIncrement: { row: UP, squat: LOW, dbBench: DB },
      days: [
        { id: "UP", name: "Day 1 · Upper Power", slots: [
          power("up-row", "row"), dbl("up-pu", "pullUp", 2, 6, 10, { note: "weighted" }), dbl("up-chin", "chinUp", 2, 6, 10, { note: "rack chins" }),
          power("up-dbb", "dbBench"), dbl("up-dip", "dip", 2, 6, 10, { note: "weighted" }), dbl("up-dbohp", "dbOhp", 3, 6, 10),
          dbl("up-curl", "barbellCurl", 3, 6, 10, { note: "cambered bar" }), dbl("up-skull", "skullcrusher", 3, 6, 10),
        ] },
        { id: "LP", name: "Day 2 · Lower Power", slots: [
          power("lp-sq", "squat"), dbl("lp-hack", "hackSquat", 2, 6, 10), dbl("lp-le", "legExtension", 2, 6, 10),
          dbl("lp-sldl", "stiffLegDeadlift", 3, 5, 8), dbl("lp-lc", "legCurl", 2, 6, 10, { note: "or glute-ham raises" }),
          dbl("lp-calf", "calfRaise", 3, 6, 10), dbl("lp-scalf", "seatedCalfRaise", 2, 6, 10),
        ] },
        { id: "BS", name: "Day 4 · Back & Shoulders Hypertrophy", slots: [
          speed("bs-row", "row"), dbl("bs-chin", "chinUp", 3, 8, 12, { note: "rack chins" }), dbl("bs-crow", "cableRow", 3, 8, 12),
          dbl("bs-csrow", "chestSupportedRow", 2, 12, 15, { note: "or shrugs, chest braced on an incline bench" }), dbl("bs-pd", "latPulldown", 2, 15, 20, { note: "close grip" }),
          dbl("bs-dbohp", "dbOhp", 3, 8, 12), dbl("bs-ur", "uprightRow", 2, 12, 15), dbl("bs-lr", "lateralRaise", 3, 12, 20),
        ] },
        { id: "LH", name: "Day 5 · Lower Hypertrophy", slots: [
          speed("lh-sq", "squat"), dbl("lh-hack", "hackSquat", 3, 8, 12), dbl("lh-lp", "legPress", 2, 12, 15), dbl("lh-le", "legExtension", 3, 15, 20),
          dbl("lh-rdl", "rdl", 3, 8, 12), dbl("lh-lc", "legCurl", 2, 12, 15, { note: "lying" }), dbl("lh-slc", "legCurl", 2, 15, 20, { note: "seated" }),
          dbl("lh-calf", "calfRaise", 4, 10, 15, { note: "donkey calf raises" }), dbl("lh-scalf", "seatedCalfRaise", 3, 15, 20),
        ] },
        { id: "CA", name: "Day 6 · Chest & Arms Hypertrophy", slots: [
          speed("ca-dbb-speed", "dbBench"), dbl("ca-dbb", "dbBench", 3, 8, 12), dbl("ca-incl", "dbInclineBench", 3, 8, 12),
          dbl("ca-press", "machineChestPress", 3, 12, 15, { note: "Hammer Strength press" }), dbl("ca-fly", "inclineFly", 2, 15, 20, { note: "incline cable flyes" }),
          dbl("ca-preacher", "preacherCurl", 3, 8, 12, { note: "cambered bar" }), dbl("ca-conc", "concentrationCurl", 2, 12, 15), dbl("ca-spider", "spiderCurl", 2, 15, 20),
          dbl("ca-ohe", "overheadTricep", 3, 8, 12, { note: "seated, cambered bar" }), dbl("ca-pd", "tricepPushdown", 2, 12, 15, { note: "rope" }), dbl("ca-kick", "tricepKickback", 2, 15, 20, { note: "cable" }),
        ] },
      ],
      notes: [
        "Mon Upper Power, Tue Lower Power, Wed off, Thu Back & Shoulders, Fri Lower, Sat Chest & Arms, Sun off.",
        "Power days: 3–5 reps. Get 5 on every set and the power-day weight goes up (it also sets the speed work).",
        "Speed work: 6×3 at 65–70% of this week's power-day weight, short rests, bar moving fast.",
        "Hypertrophy work: double progression in the listed rep ranges.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: startWeights(phat.build({}), unit), trainingMaxes: conv(unit, { row: 185, squat: 285, dbBench: 80 }) };
  },
};

// ───────────────────────── Lyle McDonald's Generic Bulking Routine ─────────────────────────

export const lyleGbr: ProgramTemplate = {
  id: "lyle-gbr",
  name: "Lyle's Generic Bulking Routine",
  author: "Lyle McDonald",
  source: "bodyrecomposition.com forum 'Generic Bulking Routine', via JCDFitness write-up (published program)",
  summary: "Four-day upper/lower: heavy 6–8 rep compounds then 10–12 rep work, each body part twice a week. Hit the top of the range, add weight.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [4],
  options: [
    { key: "volume", label: "Volume", default: "low", choices: [{ value: "low", label: "Low end (3 / 2 / 1 sets)" }, { value: "high", label: "High end (4 / 3 / 2 sets)" }] },
    { key: "days", label: "Thu / Fri", default: "vary", choices: [{ value: "vary", label: "Deadlift day + incline-first upper" }, { value: "repeat", label: "Repeat Mon / Tue" }] },
  ],
  build(o) {
    const opts = pick(o, { volume: "low", days: "vary" });
    const hi = opts.volume === "high";
    const heavy = hi ? 4 : 3, mid = hi ? 3 : 2, arms = hi ? 2 : 1;
    const H = { rest: 180 }, Mi = { rest: 120 }, A = { rest: 90 };
    const lowerA: DayDef = { id: "L1", name: "Mon · Lower", slots: [
      dbl("l1-sq", "squat", heavy, 6, 8, { ...H, tier: "MAIN" }), dbl("l1-sldl", "stiffLegDeadlift", heavy, 6, 8, { ...H, note: "or leg curl" }),
      dbl("l1-lp", "legPress", mid, 10, 12, Mi), dbl("l1-lc", "legCurl", mid, 10, 12, Mi),
      dbl("l1-calf", "calfRaise", heavy, 6, 8, H), dbl("l1-scalf", "seatedCalfRaise", mid, 10, 12, Mi),
    ] };
    const upperA: DayDef = { id: "U1", name: "Tue · Upper", slots: [
      dbl("u1-bench", "bench", heavy, 6, 8, { ...H, tier: "MAIN" }), dbl("u1-row", "row", heavy, 6, 8, { ...H, tier: "MAIN" }),
      dbl("u1-incl", "inclineBench", mid, 10, 12, { ...Mi, note: "or shoulder press" }), dbl("u1-pd", "latPulldown", mid, 10, 12, { ...Mi, note: "or chins" }),
      dbl("u1-tri", "tricepPushdown", arms, 12, 15, A), dbl("u1-curl", "bicepCurl", arms, 12, 15, A),
    ] };
    const days: DayDef[] = opts.days === "repeat"
      ? [lowerA, upperA, { ...lowerA, id: "L2", name: "Thu · Lower" }, { ...upperA, id: "U2", name: "Fri · Upper" }]
      : [lowerA, upperA,
        { id: "L2", name: "Thu · Lower (deadlift)", slots: [
          dbl("l2-dl", "deadlift", heavy, 6, 8, { ...H, tier: "MAIN" }), dbl("l2-lp", "legPress", mid, 10, 12, Mi), dbl("l2-lc", "legCurl", mid, 10, 12, Mi),
          dbl("l2-calf", "calfRaise", heavy, 6, 8, H), dbl("l2-scalf", "seatedCalfRaise", mid, 10, 12, Mi),
        ] },
        { id: "U2", name: "Fri · Upper (incline first)", slots: [
          dbl("u2-incl", "inclineBench", heavy, 6, 8, { ...H, tier: "MAIN" }), dbl("u2-pd", "latPulldown", heavy, 6, 8, { ...H, note: "or chins" }),
          dbl("u2-bench", "bench", mid, 10, 12, { ...Mi, note: "or dips" }), dbl("u2-row", "cableRow", mid, 10, 12, Mi),
          dbl("u2-tri", "tricepPushdown", arms, 12, 15, A), dbl("u2-curl", "bicepCurl", arms, 12, 15, A),
        ] }];
    return {
      templateId: "lyle-gbr",
      name: "Lyle's GBR",
      sessionsPerWeek: 4,
      days,
      notes: [
        "Mon lower, Tue upper, Thu lower, Fri upper. Stop about a rep short of failure.",
        "Hit the top of the rep range on every set → add weight next time.",
        "Start at the low end of the volume ranges and add sets as work capacity improves.",
      ],
    };
  },
  defaults(unit) {
    const sw = { ...startWeights(lyleGbr.build({ days: "vary" }), unit), ...startWeights(lyleGbr.build({ days: "repeat" }), unit) };
    return { startWeights: sw, trainingMaxes: {} };
  },
};

// ───────────────────────── Ivysaur 4-4-8 ─────────────────────────

// TM = the lift's 4-rep weight. 4×4 at 100%, 4×8 at 90%. The AMRAP set (at least 4 reps) moves the
// 4-rep weight once per two-week cycle: +1 increment, +2 for 8+ reps, under 4 → -10%.
const FOURS: PercentSet[] = rep(4, { pct: 1, reps: 4 });
const EIGHTS: PercentSet[] = rep(4, { pct: 0.9, reps: 8 });
const FOURS_AMRAP: PercentSet[] = [...rep(3, { pct: 1, reps: 4 }), { pct: 1, reps: 4, amrap: true, target: 4 }];
const IVY_RULE: TmRule = { type: "amrapVsTarget", setIndex: 3, useLast: true, table: [{ diff: -99, pct: -0.1 }, { diff: 0, increments: 1 }, { diff: 4, increments: 2 }] };

export const ivysaur448: ProgramTemplate = {
  id: "ivysaur-448",
  name: "Ivysaur 4-4-8",
  author: "/u/ivysaur",
  source: "r/Fitness post, via Liftosaur's program script and drworkout.fitness / LiftVault summaries",
  summary: "Three full-body days alternating 4×4 and 4×8 (at 90%) across two weekly templates. An AMRAP every other week decides each lift's next jump.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const p4 = (id: string, lift: string) => pct(id, lift, "MAIN", FOURS);
    const p8 = (id: string, lift: string) => pct(id, lift, "SUPP", EIGHTS);
    const pA = (id: string, lift: string) => pct(id, lift, "MAIN", FOURS_AMRAP, { tmRule: IVY_RULE });
    const chin = (id: string, reps: number) => fixed(id, "chinUp", 4, reps, "add weight once the reps are easy");
    return {
      templateId: "ivysaur-448",
      name: "Ivysaur 4-4-8",
      sessionsPerWeek: 3,
      maxLabel: "4-rep weight",
      tmIncrement: { squat: W(15, 7.5), deadlift: W(15, 7.5), bench: W(10, 5), ohp: W(5, 2.5) },
      cycle: { weeks: 2, weekNames: ["Week A", "Week B"], tmIncrease: { row: W(10, 5) } },
      days: [
        { id: "A1", name: "Week A · Day 1", weeks: [0], slots: [p4("a1-bench", "bench"), p8("a1-sq", "squat"), p8("a1-ohp", "ohp"), chin("a1-chin", 8)] },
        { id: "A2", name: "Week A · Day 2", weeks: [0], slots: [p8("a2-bench", "bench"), p4("a2-dl", "deadlift"), p4("a2-ohp", "ohp"), p8("a2-row", "row")] },
        { id: "A3", name: "Week A · Day 3", weeks: [0], slots: [pA("a3-bench", "bench"), pA("a3-sq", "squat"), p8("a3-ohp", "ohp"), chin("a3-chin", 4)] },
        { id: "B1", name: "Week B · Day 1", weeks: [1], slots: [p8("b1-bench", "bench"), p8("b1-dl", "deadlift"), p4("b1-ohp", "ohp"), p4("b1-row", "row")] },
        { id: "B2", name: "Week B · Day 2", weeks: [1], slots: [p4("b2-bench", "bench"), p8("b2-sq", "squat"), p8("b2-ohp", "ohp"), chin("b2-chin", 8)] },
        { id: "B3", name: "Week B · Day 3", weeks: [1], slots: [p8("b3-bench", "bench"), pA("b3-dl", "deadlift"), pA("b3-ohp", "ohp"), p8("b3-row", "row")] },
      ],
      notes: [
        "Mon / Wed / Fri, alternating Week A and Week B. 8-rep sets are 90% of the 4-rep weight.",
        "AMRAP sets (bench + squat in Week A, deadlift + OHP in Week B): 4+ reps → +15 lb squat/deadlift, +10 lb bench, +5 lb OHP; 8+ doubles it; fewer than 4 → -10%.",
        "Rows go up 10 lb every two weeks. Chin-ups: add weight once you beat the reps.",
      ],
    };
  },
  defaults(unit) {
    return { startWeights: startWeights(ivysaur448.build({}), unit), trainingMaxes: conv(unit, { squat: 275, bench: 205, deadlift: 335, ohp: 135, row: 175 }) };
  },
};

// ───────────────────────── Candito Linear Program ─────────────────────────

export const canditoLinear: ProgramTemplate = {
  id: "candito-linear",
  name: "Candito Linear Program",
  author: "Jonnie Candito",
  source: "CanditoTrainingHQ free Linear Program PDF, via LiftVault and physiqz.com summaries (hypertrophy days approximated)",
  summary: "Four-day upper/lower: heavy 3×6 days plus control (paused 6×4) or hypertrophy days. Add weight weekly; miss a lift and drop it about 15 lb.",
  category: "strength",
  level: "beginner",
  daysPerWeek: [4],
  options: [
    { key: "variant", label: "Template", default: "control", choices: [{ value: "control", label: "Strength / Control" }, { value: "hypertrophy", label: "Strength / Hypertrophy (approx.)" }] },
  ],
  build(o) {
    const opts = pick(o, { variant: "control" });
    // Weekly +5 lb. A missed lift drops 15 lb next week.
    const wk = { increment: UP, dropBy: { lb: 15, kg: 7.5 } };
    const opt = (id: string, lift: string) => dbl(id, lift, 3, 8, 12, { note: "optional" });
    const every3 = "add weight every 3 weeks";
    const heavy: DayDef[] = [
      { id: "HL", name: "Mon · Heavy Lower", slots: [lin("hl-sq", "squat", "MAIN", st(3, 6), wk), lin("hl-dl", "deadlift", "MAIN", st(2, 6), wk), opt("hl-opt1", "legPress"), opt("hl-opt2", "legCurl")] },
      { id: "HU", name: "Tue · Heavy Upper", slots: [
        lin("hu-bench", "bench", "MAIN", st(3, 6), wk), lin("hu-row", "row", "SUPP", st(3, 6), { ...wk, note: "upper back 1 (horizontal pull)" }),
        fixed("hu-sh", "ohp", 1, 6, every3), fixed("hu-pu", "pullUp", 1, 6, `weighted · ${every3}`), opt("hu-opt", "barbellCurl"),
      ] },
    ];
    const control: DayDef[] = [
      { id: "CL", name: "Thu · Control Lower", slots: [lin("cl-psq", "pauseSquat", "SUPP", st(6, 4), wk), lin("cl-pdl", "pauseDeadlift", "SUPP", st(3, 4), wk), opt("cl-opt1", "bulgarianSplitSquat"), opt("cl-opt2", "backExtension")] },
      { id: "CU", name: "Fri · Control Upper", slots: [
        lin("cu-spoto", "spotoPress", "SUPP", st(6, 4), wk), lin("cu-row", "row", "SUPP", st(6, 4), { ...wk, note: "paused" }),
        fixed("cu-sh", "ohp", 1, 10, every3), fixed("cu-pu", "pullUp", 1, 10, `no pause · ${every3}`), opt("cu-opt", "lateralRaise"),
      ] },
    ];
    const hyper: DayDef[] = [
      { id: "YL", name: "Thu · Hypertrophy Lower", slots: [lin("yl-sq", "squat", "SUPP", st(5, 8), wk), lin("yl-sldl", "stiffLegDeadlift", "SUPP", st(3, 8), { ...wk, note: "or deficit / snatch-grip deadlift" }), opt("yl-opt1", "legPress"), opt("yl-opt2", "legCurl")] },
      { id: "YU", name: "Fri · Hypertrophy Upper", slots: [
        lin("yu-dbb", "dbBench", "SUPP", st(5, 8), wk), lin("yu-row", "row", "SUPP", st(5, 8), wk),
        fixed("yu-sh", "ohp", 1, 10, every3), fixed("yu-pu", "pullUp", 1, 10, every3), opt("yu-opt", "bicepCurl"),
      ] },
    ];
    return {
      templateId: "candito-linear",
      name: `Candito Linear · ${opts.variant === "hypertrophy" ? "Hypertrophy" : "Control"}`,
      sessionsPerWeek: 4,
      days: [...heavy, ...(opts.variant === "hypertrophy" ? hyper : control)],
      notes: [
        "Start the 3×6 lifts around 75–80% of your 1RM. Add 0–10 lb a week (5 lb is the goal).",
        "Miss a lift → drop it about 15 lb next week; other lifts keep progressing.",
        "After 3 resets on a lift, progress it every 2 weeks instead.",
        "Shoulder and vertical-pull work: add weight every 3 weeks.",
      ],
    };
  },
  defaults(unit) {
    const over = { "hl-sq": 245, "hl-dl": 295, "hu-bench": 185, "hu-row": 155, "cl-psq": 195, "cl-pdl": 225, "cu-spoto": 155, "cu-row": 135, "yl-sq": 205, "yu-dbb": 60, "yu-row": 135, "hu-pu": 0, "cu-pu": 0, "yu-pu": 0 };
    const sw = { ...startWeights(canditoLinear.build({ variant: "control" }), unit, over), ...startWeights(canditoLinear.build({ variant: "hypertrophy" }), unit, over) };
    return { startWeights: sw, trainingMaxes: {} };
  },
};

export const HYPERTROPHY_TEMPLATES: ProgramTemplate[] = [redditPpl, phul, phat, lyleGbr, ivysaur448, canditoLinear];

/** Lift keys used here that aren't in shared/lifts.ts yet. */
export const NEW_LIFTS = ["concentrationCurl", "spiderCurl", "tricepKickback", "pauseDeadlift", "spotoPress"];
