// Single-lift peaking / specialization blocks. All are finite: the engine marks them complete
// after the last week. Each day carries only the specialized lift plus the program's own
// supplemental work.
//
// Smolov Jr (squat or bench), 3 weeks × 4 days, % of 1RM:
//   D1 6×6 @70  D2 7×5 @75  D3 8×4 @80  D4 10×3 @85. Week 2 adds +5–10 lb (2.5–5 kg) to every
//   day, week 3 adds +10–20 lb (5–10 kg) over week 1. Source: LiftVault Smolov page (Smolov Jr
//   section); the table is also the widely published one (liftosaur, M&S).
//   The weekly additions are absolute loads on top of the %, expressed with `PercentSet.add`.
//
// Russian Squat Routine, 6 weeks × 3 days, % of 1RM. Source: LiftVault "Russian Squat Program"
// (original version), cross-checked against StrengthLog's calculator and forum copies:
//   W1 6×2, 6×3, 6×2 @80   W2 6×4, 6×2, 6×5 @80   W3 6×2, 6×6, 6×2 @80
//   W4 5×5 @85, 6×2 @80, 4×4 @90   W5 6×2 @80, 3×3 @95, 6×2 @80   W6 2×2 @100, 6×2 @80, 1×1 @105
//
// Coan–Phillipi deadlift, 10 weeks × 1 day. Heavy and speed pulls are % of the GOAL max;
// power shrugs are % of the CURRENT max. Sources: elitefts "Ed Coan and Mark Phillipi Deadlift
// Routine" (percentages, rest), LiftVault example sheet (410 current / 430 goal: confirms the
// week 5 3×3 and the shrug loads 60/65/70/75/75%), Fitness Volt (assistance sets × reps):
//   wk  heavy        speed           assistance (SLDL, bent row, underhand pulldown, GM)  shrug
//   1   75%×2        60% 8×3         3×8 each, as a circuit                               –
//   2   80%×2        65% 8×3         3×8                                                  –
//   3   85%×2        70% 6×3         3×8                                                  –
//   4   90%×2        75% 5×3         3×8                                                  –
//   5   80% 3×3      65% 3×3         3×5 straight sets                                    3×5 @60
//   6   85%×2        70% 3×3         3×5                                                  3×5 @65
//   7   90%×2        75% 3×3         2×5                                                  2×5 @70
//   8   95%×2        70% 3×3         2×5                                                  2×5 @75
//   9   97.5%×1      70% 2×3         SLDL 2×5 only                                        2×5 @75
//   10  100%×1 (goal) 60% 2×3        –                                                    –
//   The engine has one max per lift, so the shrug % is rescaled onto the goal max using the
//   "goal" option (goal = current × (1 + g)). Assistance loads aren't prescribed: pick a weight.
//
// Full Smolov and Magnusson–Ortmayer live in liftvault.ts. Not included: Bulgarian daily max (no
// concrete template).

import type { DayDef, OptionDef, PercentSet, ProgramTemplate, SlotDef, Tier } from "../program";
import type { Unit } from "../units";

const sets = (n: number, reps: number, pct: number): PercentSet[] => Array.from({ length: n }, () => ({ pct, reps }));
const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const toUnit = (lb: number, unit: Unit) => (unit === "lb" ? lb : kg(lb));
const pctSlot = (id: string, lift: string, tier: Tier, tmLift: string, weeks: PercentSet[][], note?: string, restSeconds?: number): SlotDef => ({
  id, lift, tier, progression: { kind: "percent", tmLift, weeks }, note, restSeconds,
});

// ───────────────────────── Smolov Jr ─────────────────────────

const SMOLOV_JR_DAYS: [number, number, number][] = [[6, 6, 0.7], [7, 5, 0.75], [8, 4, 0.8], [10, 3, 0.85]];
/** Week-2 / week-3 additions over week 1. */
export const SMOLOV_JR_ADD = {
  low: { lb: [5, 10], kg: [2.5, 5] },
  high: { lb: [10, 20], kg: [5, 10] },
} as const;

export const smolovJr: ProgramTemplate = {
  id: "smolov-jr",
  name: "Smolov Jr",
  author: "Sergey Smolov (base mesocycle, condensed)",
  source: "smolovjr.com: Smolov Jr · LiftVault Smolov Jr sheet",
  summary: "Three brutal weeks of one lift four days a week (6×6, 7×5, 8×4, 10×3 at 70–85%), adding weight each week.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 3,
  options: [
    { key: "lift", label: "Lift", default: "squat", choices: [{ value: "squat", label: "Squat" }, { value: "bench", label: "Bench press" }] },
    { key: "add", label: "Weekly increase", default: "high", choices: [
      { value: "low", label: "+5 / +10 lb (2.5 / 5 kg)" },
      { value: "high", label: "+10 / +20 lb (5 / 10 kg)" },
    ] },
  ],
  build(o) {
    const opts = { lift: "squat", add: "high", ...o };
    const lift = opts.lift === "bench" ? "bench" : "squat";
    const add = SMOLOV_JR_ADD[opts.add === "low" ? "low" : "high"];
    const days: DayDef[] = SMOLOV_JR_DAYS.map(([n, r, pct], d) => ({
      id: `D${d + 1}`,
      name: `Day ${d + 1} · ${n}×${r} @ ${Math.round(pct * 100)}%`,
      slots: [pctSlot(`sjr-d${d + 1}`, lift, "MAIN", lift, [
        sets(n, r, pct),
        sets(n, r, pct).map((x) => ({ ...x, add: { lb: add.lb[0], kg: add.kg[0] } })),
        sets(n, r, pct).map((x) => ({ ...x, add: { lb: add.lb[1], kg: add.kg[1] } })),
      ], undefined, d === 3 ? 300 : 180)],
    }));
    return {
      templateId: "smolov-jr",
      name: `Smolov Jr · ${lift === "bench" ? "Bench" : "Squat"}`,
      sessionsPerWeek: 4,
      days,
      cycle: { weeks: 3, finite: true, weekNames: ["Week 1", `Week 2 (+${add.lb[0]} lb / +${add.kg[0]} kg)`, `Week 3 (+${add.lb[1]} lb / +${add.kg[1]} kg)`] },
      maxLabel: "1RM",
      notes: [
        "Enter a true (recent) 1RM. Typical schedule: Mon, Wed, Fri, Sat.",
        `Week 2 adds ${add.lb[0]} lb (${add.kg[0]} kg) to every day's week-1 load; week 3 adds ${add.lb[1]} lb (${add.kg[1]} kg). Loads shown include it.`,
        "Rest a week, then test a new 1RM.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { squat: toUnit(315, unit), bench: toUnit(225, unit) }, startWeights: {} };
  },
};

// ───────────────────────── Russian Squat Routine ─────────────────────────

/** [day][week] */
const RSR: PercentSet[][][] = [
  [sets(6, 2, 0.8), sets(6, 4, 0.8), sets(6, 2, 0.8), sets(5, 5, 0.85), sets(6, 2, 0.8), sets(2, 2, 1.0)],
  [sets(6, 3, 0.8), sets(6, 2, 0.8), sets(6, 6, 0.8), sets(6, 2, 0.8), sets(3, 3, 0.95), sets(6, 2, 0.8)],
  [sets(6, 2, 0.8), sets(6, 5, 0.8), sets(6, 2, 0.8), sets(4, 4, 0.9), sets(6, 2, 0.8), [{ pct: 1.05, reps: 1 }]],
];

export const russianSquat: ProgramTemplate = {
  id: "russian-squat",
  name: "Russian Squat Routine",
  author: "Soviet sports science (popularized by Pavel Tsatsouline)",
  source: "StrengthLog: Russian (\"Old School\") Squat Routine · LiftVault Russian Squat Program",
  summary: "Six weeks of squatting three times a week: steady 6×2 @ 80% days alternate with volume ramps to 6×6, then intensity ramps to a 105% single.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 6,
  options: [],
  build() {
    return {
      templateId: "russian-squat",
      name: "Russian Squat Routine",
      sessionsPerWeek: 3,
      days: RSR.map((weeks, d) => ({ id: `D${d + 1}`, name: `Day ${d + 1}`, slots: [pctSlot(`rsr-d${d + 1}`, "squat", "MAIN", "squat", weeks)] })),
      cycle: { weeks: 6, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4 · intensity", "Week 5", "Week 6 · test"] },
      maxLabel: "1RM",
      notes: [
        "Percentages are of your current 1RM. Squat three non-consecutive days a week.",
        "The final day is a 105% single — a new max. Go higher if it moves well.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { squat: toUnit(315, unit) }, startWeights: {} };
  },
};

// ───────────────────────── Coan–Phillipi deadlift ─────────────────────────

const COAN_HEAVY: PercentSet[][] = [
  [{ pct: 0.75, reps: 2 }], [{ pct: 0.8, reps: 2 }], [{ pct: 0.85, reps: 2 }], [{ pct: 0.9, reps: 2 }],
  sets(3, 3, 0.8), [{ pct: 0.85, reps: 2 }], [{ pct: 0.9, reps: 2 }], [{ pct: 0.95, reps: 2 }],
  [{ pct: 0.975, reps: 1 }], [{ pct: 1.0, reps: 1 }],
];
const COAN_SPEED: PercentSet[][] = [
  sets(8, 3, 0.6), sets(8, 3, 0.65), sets(6, 3, 0.7), sets(5, 3, 0.75),
  sets(3, 3, 0.65), sets(3, 3, 0.7), sets(3, 3, 0.75), sets(3, 3, 0.7),
  sets(2, 3, 0.7), sets(2, 3, 0.6),
];
/** Power shrugs: [sets, reps, % of CURRENT max] by week; null = none. */
const COAN_SHRUG: ([number, number, number] | null)[] = [null, null, null, null, [3, 5, 0.6], [3, 5, 0.65], [2, 5, 0.7], [2, 5, 0.75], [2, 5, 0.75], null];

const COAN_GOAL: Record<string, number> = { "2.5": 0.025, "5": 0.05, "7.5": 0.075, "10": 0.1 };

const coanOptions: OptionDef[] = [
  { key: "goal", label: "Goal over current max", default: "5", choices: [
    { value: "2.5", label: "+2.5%" }, { value: "5", label: "+5%" }, { value: "7.5", label: "+7.5%" }, { value: "10", label: "+10%" },
  ] },
];

export const coanPhillipi: ProgramTemplate = {
  id: "coan-phillipi",
  name: "Coan–Phillipi Deadlift",
  author: "Ed Coan & Mark Phillipi",
  source: "published program: elitefts (Coan/Phillipi routine), LiftVault example sheet, Fitness Volt (assistance)",
  summary: "Ten weeks, one deadlift day a week: a heavy double or single climbing to your goal max, speed triples, and hard back assistance.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [1],
  weeks: 10,
  options: coanOptions,
  build(o) {
    const opts = { goal: "5", ...o };
    const g = COAN_GOAL[opts.goal] ?? 0.05;
    const shrugWeeks: PercentSet[][] = COAN_SHRUG.map((s) => (s ? sets(s[0], s[1], Math.round((s[2] / (1 + g)) * 10000) / 10000) : []));
    const main = (p: string, rest: number, restNote: string): SlotDef[] => [
      pctSlot(`coan-${p}-heavy`, "deadlift", "MAIN", "deadlift", COAN_HEAVY, undefined, 300),
      pctSlot(`coan-${p}-speed`, "deadlift", "SUPP", "deadlift", COAN_SPEED, `speed pulls, explosive · rest ${restNote}`, rest),
    ];
    const acc = (p: string, lift: string, n: number, r: number, note?: string): SlotDef => ({
      id: `coan-${p}-${lift}`, lift, tier: "ACC", progression: { kind: "fixed", sets: n, reps: r, note }, restSeconds: 90,
    });
    const shrug = (p: string): SlotDef => pctSlot(`coan-${p}-shrug`, "shrug", "ACC", "deadlift", shrugWeeks, `power shrugs: % of current max (goal = current +${Math.round(g * 1000) / 10}%)`, 120);
    const four = (p: string, n: number, r: number, note?: string) => [
      acc(p, "stiffLegDeadlift", n, r, note), acc(p, "row", n, r, note), acc(p, "latPulldown", n, r, note ? `${note}, underhand grip` : "underhand grip"), acc(p, "goodMorning", n, r, note ? `${note}, arched back` : "arched back"),
    ];
    const days: DayDef[] = [
      { id: "P1", name: "Weeks 1–4", weeks: [0, 1, 2, 3], slots: [...main("p1", 90, "90 s (90–120 s in wk 3–4)"), ...four("p1", 3, 8, "circuit")] },
      { id: "P2", name: "Weeks 5–6", weeks: [4, 5], slots: [...main("p2", 120, "120 s"), shrug("p2"), ...four("p2", 3, 5)] },
      { id: "P3", name: "Weeks 7–8", weeks: [6, 7], slots: [...main("p3", 120, "120 s"), shrug("p3"), ...four("p3", 2, 5)] },
      { id: "P4", name: "Week 9", weeks: [8], slots: [...main("p4", 180, "as needed"), shrug("p4"), acc("p4", "stiffLegDeadlift", 2, 5)] },
      { id: "P5", name: "Week 10 · goal max", weeks: [9], slots: main("p5", 180, "as needed") },
    ];
    return {
      templateId: "coan-phillipi",
      name: "Coan–Phillipi Deadlift",
      sessionsPerWeek: 1,
      days,
      cycle: { weeks: 10, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Week 9", "Week 10 · goal"] },
      maxLabel: "Goal 1RM",
      notes: [
        "Enter your GOAL max (usually ~5% over your current best). Every deadlift is a % of it; week 10 pulls it.",
        "Log the heavy set(s) and the speed triples as two separate Deadlift exercises in Hevy, heavy first.",
        "Speed rest: 90 s (wk 1–2), 90–120 s (wk 3–4), 120 s (wk 5–8), as needed (wk 9–10).",
        "Assistance loads aren't prescribed — keep them heavy but strict. Weeks 1–4 are a circuit, 90 s between exercises.",
        "Power shrugs are % of your current max; set the goal option to how far your goal is above it.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { deadlift: toUnit(430, unit) }, startWeights: {} };
  },
};

export const SPECIALIZATION_TEMPLATES = [smolovJr, russianSquat, coanPhillipi];
