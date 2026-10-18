// Stronger By Science (Greg Nuckols) program bundle: Strength RTF, Strength RIR, Hypertrophy,
// and the Novice Hypertrophy program.
//
// Numbers come from the "Quick Setup" tab of the program spreadsheets, cross-checked (2026-10-18)
// against a community extraction of the current bundle's sheets (github.com/borisghidaglia/
// science-based-lifter, skills/sbs-training/references 02, 05, 06, 07, 08, 11) and the official
// overview (strongerbyscience.com/program-bundle):
//   - weekly intensity (% of max) for main lifts and auxiliaries, weeks 1–21
//   - "normal set rep target" and "last set rep target" (RTF / Hypertrophy) or "last set RIR
//     target" (RIR) by intensity, 50–100% in 2.5% steps
//   - max adjustment by reps over/under target: ≤−2 or failed sets → −5%, −1 → −2%, 0, +1 → +0.5%,
//     +2 → +1%, +3 → +1.5%, +4 → +2%, +5+ → +3%
//   - Last Set RIR: failed sets/reps → −5%; sets done but RIR below target → −2% (however far
//     below); RIR above target → the same +0.5% … +3% steps
//   - rounding 2.5 (Strength sheets) / 5 (Hypertrophy sheet); sets 5 (Strength) / 4 (Hypertrophy)
//   - day layouts for 2x–6x (Strength and Hypertrophy share the slot pattern; doc 11)
//
// Strength RTF:   4 sets at the normal rep target + 1 set to failure vs the last-set target.
// Strength RIR:   5 sets at the rep target; rate the RIR of the last one (log its RPE).
// Hypertrophy:    3 sets at the normal rep target + 1 set to failure; lower intensities.
// Auxiliaries run 10% (Strength) / 5% (Hypertrophy) below the main-lift intensity, each off its
// own max, and adjust that max the same way.
//
// Not verifiable from any source, kept as approximations:
//   - Deload weeks 7/14/21 are 60% main / 50% aux (Hypertrophy 55%) with no max change (verified);
//     the 5 reps per deload set come from a community Liftosaur port.
//   - Upper-back work is a free-choice accessory in the sheet (2–3×/week), not programmed here.

import type { PercentSet, ProgramDef, ProgramTemplate, SlotDef, DayDef, Stage, Tier, Weights } from "../program";
import type { Unit } from "../units";

const lbToKg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (o: Record<string, number>, unit: Unit) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, unit === "lb" ? v : lbToKg(v)]));

// ───────── sheet tables (index = (pct − 50) / 2.5, pct 50 … 100) ─────────

/** Strength RTF / RIR: reps per normal set. */
const STR_NORMAL = [8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1];
/** Strength RTF: last set (to failure) rep target. */
const STR_LAST = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1, 1];
/** Strength RIR: last set RIR target. */
const STR_RIR = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0];
/** Hypertrophy: reps per normal set. */
const HYP_NORMAL = [20, 18, 17, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 1, 1];
/** Hypertrophy: last set (to failure) rep target. */
const HYP_LAST = [25, 23, 21, 19, 18, 16, 15, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 2, 1, 1];

/** Main-lift intensity by week (×10 to keep the math exact: 700 = 70.0%). */
const STR_INT = [700, 750, 800, 725, 775, 825, 600, 750, 800, 850, 775, 825, 875, 600, 800, 850, 900, 850, 900, 950, 600];
const HYP_INT = [700, 725, 750, 725, 750, 775, 600, 725, 750, 775, 750, 775, 800, 600, 750, 775, 800, 775, 800, 825, 600];
const DELOAD_WEEKS = [6, 13, 20];
const TRAINING_WEEKS = Array.from({ length: 21 }, (_, w) => w).filter((w) => !DELOAD_WEEKS.includes(w));

const idx = (p10: number) => Math.round((p10 - 500) / 25);

/** "Below target by 2+ … beat by 5+" → % of max. */
const ADJUST = [
  { diff: -2, pct: -0.05 }, { diff: -1, pct: -0.02 }, { diff: 0, pct: 0 }, { diff: 1, pct: 0.005 },
  { diff: 2, pct: 0.01 }, { diff: 3, pct: 0.015 }, { diff: 4, pct: 0.02 }, { diff: 5, pct: 0.03 },
];

type Variant = "rtf" | "rir" | "hyp";

/** One training week's sets for a lift `auxDrop` (×10) below the main intensity. */
function weekSets(v: Variant, w: number, auxDrop: number): PercentSet[] {
  const p10 = (v === "hyp" ? HYP_INT : STR_INT)[w] - auxDrop;
  const i = idx(p10);
  const pct = p10 / 1000;
  if (v === "rtf") {
    const n = STR_NORMAL[i], t = STR_LAST[i];
    return [...Array.from({ length: 4 }, () => ({ pct, reps: n })), { pct, reps: t, amrap: true, target: t }];
  }
  if (v === "hyp") {
    const n = HYP_NORMAL[i], t = HYP_LAST[i];
    return [...Array.from({ length: 3 }, () => ({ pct, reps: n })), { pct, reps: t, amrap: true, target: t }];
  }
  // RIR: last set at the same reps, stopped at the RIR target (shown as RPE 10 − RIR).
  const n = STR_NORMAL[i];
  return [...Array.from({ length: 4 }, () => ({ pct, reps: n })), { pct, reps: n, amrap: true, target: n, rpe: 10 - STR_RIR[i] }];
}

/** Full 21-week table (deload weeks empty — they live on separate deload days). */
function trainingTable(v: Variant, auxDrop: number): PercentSet[][] {
  return Array.from({ length: 21 }, (_, w) => (DELOAD_WEEKS.includes(w) ? [] : weekSets(v, w, auxDrop)));
}

function deloadTable(v: Variant, aux: boolean): PercentSet[][] {
  const pct = aux ? (v === "hyp" ? 0.55 : 0.5) : 0.6;
  const sets = Array.from({ length: v === "hyp" ? 4 : 5 }, () => ({ pct, reps: 5 }));
  return Array.from({ length: 21 }, (_, w) => (DELOAD_WEEKS.includes(w) ? sets : []));
}

// ───────── lifts and day layouts ─────────

const STR_MAIN = ["squat", "bench", "deadlift", "ohp"];
/** Strength sheets' default auxiliaries: squat aux 1/2, bench aux 1/2, deadlift aux, OHP aux. */
const STR_AUX = ["frontSquat", "pauseSquat", "cgBench", "inclineBench", "sumoDeadlift", "pushPress"];
/** Hypertrophy sheet's default mains (block pulls log as rack pulls) and auxiliaries, same slot order. */
const HYP_MAIN = ["squat", "bench", "rackPull", "ohp"];
const HYP_AUX = ["legPress", "hackSquat", "inclineBench", "dbBench", "rdl", "dbOhp"];

/** Days → lifts, using placeholders M0–M3 (squat, bench, deadlift, OHP) and A0–A5 (aux order
 *  above), in the sheet's exercise order. The 2x layout drops two aux slots (8 lifts). */
const LAYOUTS: Record<string, string[][]> = {
  "2": [["M0", "M1", "A4", "A5"], ["M2", "M3", "A0", "A2"]],
  "3": [["M0", "A4", "A3"], ["M1", "M3", "A0"], ["M2", "A2", "A1", "A5"]],
  "4": [["M0", "A3", "A4"], ["M1", "A0", "A5"], ["M2", "A2"], ["M3", "A1"]],
  "5": [["M0", "A5"], ["M1", "A0"], ["M2", "A2"], ["M3", "A1"], ["A3", "A4"]],
  "6": [["M0", "A2"], ["A5", "A4"], ["M1", "A0"], ["A3", "A1"], ["M2"], ["M3"]],
};

const SHORT: Record<string, string> = { squat: "Squat", bench: "Bench", deadlift: "Deadlift", ohp: "OHP", rackPull: "Block pull" };

function buildStrength(v: Variant, o: Record<string, string>, templateId: string, name: string): ProgramDef {
  const days = o.days ?? "4";
  const layout = LAYOUTS[days] ?? LAYOUTS["4"];
  const aux = v === "hyp" ? HYP_AUX : STR_AUX;
  const mains = v === "hyp" ? HYP_MAIN : STR_MAIN;
  const drop = v === "hyp" ? 50 : 100;
  const liftOf = (code: string) => (code[0] === "M" ? mains : aux)[Number(code.slice(1))];
  const rule = { type: "amrapVsTarget" as const, setIndex: v === "hyp" ? 3 : 4, table: ADJUST, penalizeMissingSets: true, ...(v === "rir" ? { rir: true } : {}) };

  const out: DayDef[] = [];
  layout.forEach((codes, d) => {
    const lifts = codes.map(liftOf);
    const title = lifts.filter((l) => SHORT[l]).map((l) => SHORT[l]).join(" / ") || "Auxiliaries";
    const slots = (deload: boolean): SlotDef[] =>
      codes.map((c, k) => {
        const lift = liftOf(c);
        const isAux = c[0] === "A";
        const tier: Tier = isAux ? "SUPP" : "MAIN";
        const note = lift === "rackPull" ? "block pulls" : undefined;
        return deload
          ? { id: `dl${d + 1}-${lift}`, lift, tier, note, progression: { kind: "percent", tmLift: lift, weeks: deloadTable(v, isAux) } }
          : { id: `d${d + 1}-${lift}`, lift, tier, note, progression: { kind: "percent", tmLift: lift, weeks: trainingTable(v, isAux ? drop : 0), tmRule: rule } };
      });
    out.push({ id: `D${d + 1}`, name: `Day ${d + 1} · ${title}`, slots: slots(false), weeks: TRAINING_WEEKS });
    out.push({ id: `DL${d + 1}`, name: `Deload Day ${d + 1} · ${title}`, slots: slots(true), weeks: DELOAD_WEEKS });
  });

  const weekNames = Array.from({ length: 21 }, (_, w) => (DELOAD_WEEKS.includes(w) ? `Block ${Math.floor(w / 7) + 1} · Deload` : `Block ${Math.floor(w / 7) + 1} · Week ${(w % 7) + 1}`));
  const inc: Weights = { lb: 5, kg: 2.5 };
  const lastSet =
    v === "rir"
      ? "Last set: log its RPE (RIR = 10 − RPE) against the RIR target shown as RPE. Not sure? Keep going past the listed reps until you are; each extra rep counts as 1 more RIR. RIR over target raises the max (+0.5%/rep, +3% at 5+); under target −2%; missed reps or sets −5%."
      : "Last set: to failure. Each rep over the target raises that lift's max (+0.5%/rep, +3% at 5+); 1 short −2%, 2+ short or a missed set −5%.";
  return {
    templateId,
    name: `${name} · ${days}x`,
    sessionsPerWeek: Number(days),
    days: out,
    cycle: { weeks: 21, weekNames, finite: true },
    tmIncrement: Object.fromEntries([...mains, ...aux].map((l) => [l, inc])),
    maxLabel: "Max",
    microplates: v !== "hyp", // Strength sheets round to 2.5, Hypertrophy to 5
    notes: [
      "Enter a max for every main and auxiliary lift (a true or estimated 1RM; estimate low when unsure).",
      lastSet,
      "Weeks 7, 14 and 21 are deloads: 5×5 (hypertrophy 4×5), maxes don't move.",
      "Add upper-back work (rows, pull-ups or pull-downs) 2–3 times a week as an accessory.",
      "After week 21 (or at the start of week 22), test your 1RMs. If week 20's heavy singles feel too heavy, go off-script and treat them as practice.",
    ],
  };
}

const daysOption = (dflt: string) => ({
  key: "days", label: "Days per week", default: dflt,
  choices: ["2", "3", "4", "5", "6"].map((d) => ({ value: d, label: `${d} days` })),
});

const STR_DEFAULTS_LB = { squat: 315, bench: 225, deadlift: 385, ohp: 145, frontSquat: 265, pauseSquat: 285, cgBench: 205, inclineBench: 190, sumoDeadlift: 365, pushPress: 175 };
const HYP_DEFAULTS_LB = { squat: 315, bench: 225, rackPull: 435, ohp: 145, legPress: 540, hackSquat: 315, inclineBench: 190, dbBench: 85, rdl: 315, dbOhp: 60 };

export const sbsRtf: ProgramTemplate = {
  id: "sbsRtf",
  name: "SBS Strength (Reps to Failure)",
  author: "Greg Nuckols (Stronger By Science)",
  source: "SBS Strength Program reps to failure (Quick Setup tab); day layouts from the bundle's 2x–6x tabs (community extraction)",
  summary: "21 weeks in three 7-week blocks. Four sets at a weekly % and rep target, then one set to failure; beating or missing the target nudges that lift's max.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [2, 3, 4, 5, 6],
  weeks: 21,
  options: [daysOption("4")],
  build: (o) => buildStrength("rtf", o, "sbsRtf", "SBS Strength RTF"),
  defaults: (unit) => ({ trainingMaxes: conv(STR_DEFAULTS_LB, unit), startWeights: {} }),
};

export const sbsRir: ProgramTemplate = {
  id: "sbsRir",
  name: "SBS Strength (Last Set RIR)",
  author: "Greg Nuckols (Stronger By Science)",
  source: "SBS Strength Program last set RIR (Quick Setup tab); day layouts from the bundle's 2x–6x tabs (community extraction)",
  summary: "21 weeks in three 7-week blocks. Five sets at a weekly % and rep target; rate the reps in reserve on the last one against a target, and that moves the lift's max.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [2, 3, 4, 5, 6],
  weeks: 21,
  options: [daysOption("4")],
  build: (o) => buildStrength("rir", o, "sbsRir", "SBS Strength RIR"),
  defaults: (unit) => ({ trainingMaxes: conv(STR_DEFAULTS_LB, unit), startWeights: {} }),
};

export const sbsHypertrophy: ProgramTemplate = {
  id: "sbsHypertrophy",
  name: "SBS Hypertrophy",
  author: "Greg Nuckols (Stronger By Science)",
  source: "SBS Hypertrophy Template (current bundle defaults: block pulls, leg press, hack squat, incline, DB bench, RDL, DB OHP); day layouts from the bundle's 2x–6x tabs (community extraction)",
  summary: "21-week hypertrophy version: three sets of 5–10 reps (aux 7–12) at 70–82.5%, then a set to failure that adjusts the max.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [2, 3, 4, 5, 6],
  weeks: 21,
  options: [daysOption("4")],
  build: (o) => buildStrength("hyp", o, "sbsHypertrophy", "SBS Hypertrophy"),
  defaults: (unit) => ({ trainingMaxes: conv(HYP_DEFAULTS_LB, unit), startWeights: {} }),
};

// ───────── Novice Hypertrophy ─────────
//
// Sheet (Quick Setup + 3x/4x/5x tabs): 22 lifts, a body-part split with each lift once a week.
// Weighted lifts: 3×8 → 4×8 → 5×8 → 3×10 → … → 5×12 (one step per successful week), then +10%
// load back at 3×8; a failed week repeats the same prescription. Bodyweight lifts (neutral-grip
// pull-up, glute-ham raise): 3 → 5 sets, then +1 rep per set at 3 sets. Rounding 5.

const WEIGHTED: Stage[] = [8, 10, 12].flatMap((reps) => [3, 4, 5].map((sets) => ({ sets, reps, amrap: false })));
/** Bodyweight ladder from 3×5 up to 5×15; pick the starting step in setup. */
const BODYWEIGHT: Stage[] = Array.from({ length: 11 }, (_, r) => r + 5).flatMap((reps) => [3, 4, 5].map((sets) => ({ sets, reps, amrap: false })));

const nov = (id: string, lift: string, tier: Tier, note?: string, bodyweight = false): SlotDef => ({
  id, lift, tier, note,
  progression: {
    kind: "stages", stages: bodyweight ? BODYWEIGHT : WEIGHTED, advance: { type: "baseVolume" }, onFinalFail: { type: "hold" },
    increment: { lb: 0, kg: 0 }, climb: { loadPct: bodyweight ? 0 : 0.1 },
  },
});

const NOV: Record<string, SlotDef> = {
  dbBench: nov("a-dbbench", "dbBench", "MAIN"),
  tBar: nov("a-tbar", "tBarRow", "MAIN"),
  machOhp: nov("b-machohp", "machineShoulderPress", "MAIN"),
  pulldown: nov("b-pulldown", "latPulldown", "MAIN", "reverse grip"),
  incline: nov("b-incline", "dbInclineBench", "MAIN"),
  cableRow: nov("b-cablerow", "cableRow", "MAIN"),
  preacher: nov("a-preacher", "preacherCurl", "ACC"),
  skull: nov("a-skull", "skullcrusher", "ACC"),
  squat: nov("a-squat", "squat", "MAIN"),
  rdl: nov("a-rdl", "rdl", "MAIN"),
  legPress: nov("b-legpress", "legPress", "MAIN"),
  ghr: nov("b-ghr", "gluteHamRaise", "MAIN", "bodyweight", true),
  split: nov("b-split", "splitSquat", "ACC"),
  calf: nov("a-calf", "calfRaise", "ACC", "on the leg press"),
  rearDelt: nov("a-reardelt", "rearDeltFly", "ACC", "dumbbell"),
  dbOhp: nov("a-dbohp", "dbOhp", "MAIN", "seated"),
  pullUp: nov("a-pullup", "pullUp", "MAIN", "neutral grip, bodyweight", true),
  legCurl: nov("a-legcurl", "legCurl", "ACC", "seated"),
  seatCalf: nov("b-seatcalf", "seatedCalfRaise", "ACC"),
  shrug: nov("b-shrug", "shrug", "ACC", "trap bar"),
  fly: nov("b-fly", "chestFly", "ACC", "dumbbell"),
  lateral: nov("b-lateral", "lateralRaise", "ACC", "dumbbell"),
};

const NOV_LAYOUTS: Record<string, [string, (keyof typeof NOV)[]][]> = {
  "3": [
    ["Chest / Back / Arms", ["dbBench", "tBar", "machOhp", "pulldown", "incline", "cableRow", "preacher", "skull"]],
    ["Legs", ["squat", "rdl", "legPress", "ghr", "split", "calf", "rearDelt"]],
    ["Shoulders / Back / Accessories", ["dbOhp", "pullUp", "legCurl", "seatCalf", "shrug", "fly", "lateral"]],
  ],
  "4": [
    ["Upper A", ["dbBench", "tBar", "machOhp", "pulldown", "preacher", "skull"]],
    ["Lower A", ["squat", "ghr", "split", "calf", "rearDelt"]],
    ["Upper B", ["dbOhp", "pullUp", "incline", "cableRow", "shrug", "fly"]],
    ["Lower B", ["rdl", "legPress", "legCurl", "seatCalf", "lateral"]],
  ],
  "5": [
    ["Upper A", ["dbBench", "tBar", "machOhp", "pulldown"]],
    ["Lower A", ["squat", "ghr", "split", "calf"]],
    ["Upper B", ["dbOhp", "pullUp", "incline", "cableRow"]],
    ["Lower B", ["rdl", "legPress", "legCurl", "seatCalf"]],
    ["Arms / Delts", ["preacher", "skull", "rearDelt", "shrug", "fly", "lateral"]],
  ],
};

export const sbsNoviceHypertrophy: ProgramTemplate = {
  id: "sbsNoviceHypertrophy",
  name: "SBS Novice Hypertrophy",
  author: "Greg Nuckols (Stronger By Science)",
  source: "SBS Novice hypertrophy program (Quick Setup tab: lifts and progression; 3x/4x/5x day tabs via the community extraction)",
  summary: "Beginner body-part split, every lift once a week. Add a set each successful week (3 → 5), then 2 reps a set (8 → 12), then 10% more weight.",
  category: "hypertrophy",
  level: "beginner",
  daysPerWeek: [3, 4, 5],
  options: [{ key: "days", label: "Days per week", default: "3", choices: ["3", "4", "5"].map((d) => ({ value: d, label: `${d} days` })) }],
  build(o) {
    const n = NOV_LAYOUTS[o.days ?? "3"] ? (o.days ?? "3") : "3";
    return {
      templateId: "sbsNoviceHypertrophy",
      name: `SBS Novice Hypertrophy · ${n}x`,
      sessionsPerWeek: Number(n),
      days: NOV_LAYOUTS[n].map(([title, lifts], d) => ({ id: `D${d + 1}`, name: `Day ${d + 1} · ${title}`, slots: lifts.map((k) => NOV[k]) })),
      notes: [
        "Each lift: 3×8, 4×8, 5×8, 3×10, 4×10, 5×10, 3×12, 4×12, 5×12, one step per week you complete every set and rep. After 5×12, add 10% and start again at 3×8.",
        "Miss any rep → repeat the same sets, reps and weight next week.",
        "Neutral-grip pull-ups and glute-ham raises are bodyweight: 3 → 5 sets, then one more rep per set. Pick the starting step in setup (default 3×5).",
      ],
    };
  },
  defaults(unit) {
    const lb: Record<string, number> = {
      "a-squat": 185, "a-dbbench": 50, "a-tbar": 90, "a-dbohp": 35, "a-pullup": 0, "a-rdl": 155, "a-legcurl": 70, "a-calf": 140,
      "a-preacher": 40, "a-skull": 50, "a-reardelt": 15,
      "b-legpress": 270, "b-incline": 45, "b-cablerow": 110, "b-machohp": 70, "b-pulldown": 110, "b-ghr": 0, "b-split": 30,
      "b-seatcalf": 90, "b-shrug": 185, "b-fly": 25, "b-lateral": 15,
    };
    return { startWeights: conv(lb, unit), trainingMaxes: {} };
  },
};
