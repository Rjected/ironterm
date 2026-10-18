// Stronger By Science (Greg Nuckols) program bundle: Strength RTF, Strength RIR, Hypertrophy,
// and the Novice Hypertrophy program.
//
// Numbers below come from the "Quick Setup" tab of Dan's copies in Drive (the only tab the Drive
// export exposes):
//   - weekly intensity (% of max) for main lifts and auxiliaries, weeks 1–21
//   - "normal set rep target" and "last set rep target" (RTF / Hypertrophy) or "last set RIR
//     target" (RIR) by intensity, 50–100% in 2.5% steps
//   - max adjustment by reps over/under target: ≤−2 → −5%, −1 → −2%, 0, +1 → +0.5%,
//     +2 → +1%, +3 → +1.5%, +4 → +2%, +5+ → +3%
//   - rounding 2.5 (Strength sheets) / 5 (Hypertrophy sheet); sets 5 (Strength) / 4 (Hypertrophy)
//
// Strength RTF:   4 sets at the normal rep target + 1 set to failure vs the last-set target.
// Strength RIR:   5 sets at the rep target, the last one taken to the RIR target.
// Hypertrophy:    3 sets at the normal rep target + 1 set to failure; lower intensities.
// Auxiliaries run 10% (Strength) / 5% (Hypertrophy) below the main-lift intensity, each off its
// own max, and adjust that max the same way.
//
// NOT from the sheet (its 2x–6x day tabs aren't readable through the Drive export):
//   - Day layouts. 4 days follows a community Liftosaur port ("SBS Strength Last Set RTF 4x");
//     2/3/5/6 days spread the same ten lifts (4 main + 6 aux, each once a week) over the days.
//   - Deload weeks 7/14/21: 5×5 @ 60% main, 50% aux (Hypertrophy 4×5 @ 60% / 55%), no max
//     change — the percentages match the sheet's week 7/14/21 intensity, the 5×5 is from the
//     same Liftosaur port.
//   - Novice Hypertrophy days and the double-progression approximation (see sbsNoviceHypertrophy).

import type { PercentSet, ProgramDef, ProgramTemplate, SlotDef, DayDef, Tier, Weights } from "../program";
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
/** Hypertrophy sheet's default auxiliaries. Squat aux 2 is "High Bar Squat" in the sheet; it logs
 *  as plain "Squat (Barbell)" in Hevy, so front squat (the sheet's adjustment table lists it) is used. */
const HYP_AUX = ["pauseSquat", "frontSquat", "pauseBench", "pinPress", "rdl", "dbOhp"];

/** Days → lifts, using placeholders M0–M3 (squat, bench, deadlift, OHP) and A0–A5 (aux order above). */
const LAYOUTS: Record<string, string[][]> = {
  "2": [["M0", "M1", "A4", "A5", "A1"], ["M2", "M3", "A0", "A2", "A3"]],
  "3": [["M0", "A3", "A4"], ["M1", "M3", "A0"], ["M2", "A2", "A5", "A1"]],
  // Liftosaur "SBS Strength Last Set RTF 4x": Squat/Incline/Sumo · Bench/Front/Push press · DL/CG · OHP/Paused
  "4": [["M0", "A3", "A4"], ["M1", "A0", "A5"], ["M2", "A2"], ["M3", "A1"]],
  "5": [["M0", "A3"], ["M1", "A0"], ["M2", "A2"], ["M3", "A1"], ["A4", "A5"]],
  "6": [["M0", "A3"], ["M1", "A4"], ["M2", "A5"], ["M3", "A0"], ["A1"], ["A2"]],
};

const SHORT: Record<string, string> = { squat: "Squat", bench: "Bench", deadlift: "Deadlift", ohp: "OHP" };

function buildStrength(v: Variant, o: Record<string, string>, templateId: string, name: string): ProgramDef {
  const days = o.days ?? "4";
  const layout = LAYOUTS[days] ?? LAYOUTS["4"];
  const aux = v === "hyp" ? HYP_AUX : STR_AUX;
  const drop = v === "hyp" ? 50 : 100;
  const liftOf = (code: string) => (code[0] === "M" ? STR_MAIN : aux)[Number(code.slice(1))];
  const rule = { type: "amrapVsTarget" as const, setIndex: v === "hyp" ? 3 : 4, table: ADJUST };

  const out: DayDef[] = [];
  layout.forEach((codes, d) => {
    const lifts = codes.map(liftOf);
    const title = lifts.filter((l) => SHORT[l]).map((l) => SHORT[l]).join(" / ") || "Auxiliaries";
    const slots = (deload: boolean): SlotDef[] =>
      codes.map((c, k) => {
        const lift = liftOf(c);
        const isAux = c[0] === "A";
        const tier: Tier = isAux ? "SUPP" : "MAIN";
        return deload
          ? { id: `dl${d + 1}-${lift}`, lift, tier, progression: { kind: "percent", tmLift: lift, weeks: deloadTable(v, isAux) } }
          : { id: `d${d + 1}-${lift}`, lift, tier, progression: { kind: "percent", tmLift: lift, weeks: trainingTable(v, isAux ? drop : 0), tmRule: rule } };
      });
    out.push({ id: `D${d + 1}`, name: `Day ${d + 1} · ${title}`, slots: slots(false), weeks: TRAINING_WEEKS });
    out.push({ id: `DL${d + 1}`, name: `Deload Day ${d + 1} · ${title}`, slots: slots(true), weeks: DELOAD_WEEKS });
  });

  const weekNames = Array.from({ length: 21 }, (_, w) => (DELOAD_WEEKS.includes(w) ? `Block ${Math.floor(w / 7) + 1} · Deload` : `Block ${Math.floor(w / 7) + 1} · Week ${(w % 7) + 1}`));
  const inc: Weights = { lb: 5, kg: 2.5 };
  const lastSet =
    v === "rir"
      ? "Last set: keep going past the listed reps until you're at the RIR target (shown as RPE). Log every rep; each rep beyond the listed number counts as 1 RIR above target."
      : "Last set: to failure. Each rep over the target raises that lift's max (+0.5%/rep, +3% at 5+); 1 short −2%, 2+ short −5%.";
  return {
    templateId,
    name: `${name} · ${days}x`,
    sessionsPerWeek: Number(days),
    days: out,
    cycle: { weeks: 21, weekNames, finite: true },
    tmIncrement: Object.fromEntries([...STR_MAIN, ...aux].map((l) => [l, inc])),
    maxLabel: "Max",
    microplates: v !== "hyp", // Strength sheets round to 2.5, Hypertrophy to 5
    notes: [
      "Enter a max for every main and auxiliary lift (a true or estimated 1RM; estimate low when unsure).",
      lastSet,
      "Weeks 7, 14 and 21 are deloads: 5×5 (hypertrophy 4×5), maxes don't move.",
    ],
  };
}

const daysOption = (dflt: string) => ({
  key: "days", label: "Days per week", default: dflt,
  choices: ["2", "3", "4", "5", "6"].map((d) => ({ value: d, label: `${d} days` })),
});

const STR_DEFAULTS_LB = { squat: 315, bench: 225, deadlift: 385, ohp: 145, frontSquat: 265, pauseSquat: 285, cgBench: 205, inclineBench: 190, sumoDeadlift: 365, pushPress: 175 };
const HYP_DEFAULTS_LB = { squat: 315, bench: 225, deadlift: 385, ohp: 145, pauseSquat: 285, frontSquat: 265, pauseBench: 215, pinPress: 195, rdl: 315, dbOhp: 60 };

export const sbsRtf: ProgramTemplate = {
  id: "sbsRtf",
  name: "SBS Strength (Reps to Failure)",
  author: "Greg Nuckols (Stronger By Science)",
  source: "Dan's Drive: SBS Strength Program reps to failure (Quick Setup tab); day layout from a community port",
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
  source: "Dan's Drive: SBS Strength Program last set RIR (Quick Setup tab); day layout from a community port",
  summary: "21 weeks in three 7-week blocks. Five sets at a weekly % and rep target, the last stopped at a reps-in-reserve target; how much you had left moves that lift's max.",
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
  source: "Dan's Drive: SBS Hypertrophy Template (Quick Setup tab); day layout reconstructed",
  summary: "21-week hypertrophy version: three sets of 6–12ish reps at 70–82.5%, then a set to failure that adjusts the max.",
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
// Sheet (Quick Setup): 22 lifts in pairs per movement category, rounding 5, "set increase then rep
// increase" from 3 sets to 5 sets and 8 reps to 12 reps (+1 set, +2 reps per set), then +10%
// weight. The engine has no "add a set" progression, so each lift runs as 3×8–12 double
// progression (add weight once every set hits 12) with a fixed jump instead of 10%. Days: A uses
// the first lift of each pair, B the second, alternating.

const nov = (id: string, lift: string, tier: Tier, upper = true): SlotDef => ({
  id, lift, tier,
  progression: { kind: "double", sets: 3, reps: [8, 12], increment: upper ? { lb: 5, kg: 2.5 } : { lb: 10, kg: 5 } },
});

export const sbsNoviceHypertrophy: ProgramTemplate = {
  id: "sbsNoviceHypertrophy",
  name: "SBS Novice Hypertrophy",
  author: "Greg Nuckols (Stronger By Science)",
  source: "Dan's Drive: SBS Novice hypertrophy program (Quick Setup tab: lifts and progression); A/B days reconstructed",
  summary: "Beginner full-body hypertrophy: compound lifts plus accessories for 3×8–12, adding weight once every set reaches 12.",
  category: "hypertrophy",
  level: "beginner",
  daysPerWeek: [2, 3, 4],
  options: [{ key: "days", label: "Days per week", default: "3", choices: ["2", "3", "4"].map((d) => ({ value: d, label: `${d} days (A/B alternating)` })) }],
  build(o) {
    const days = Number(o.days ?? "3");
    return {
      templateId: "sbsNoviceHypertrophy",
      name: "SBS Novice Hypertrophy",
      sessionsPerWeek: days,
      days: [
        {
          id: "A", name: "Day A",
          slots: [
            nov("a-squat", "squat", "MAIN", false), nov("a-dbbench", "dbBench", "MAIN"), nov("a-tbar", "tBarRow", "MAIN"),
            nov("a-dbohp", "dbOhp", "SUPP"), nov("a-pullup", "pullUp", "SUPP"), nov("a-rdl", "rdl", "SUPP", false),
            nov("a-legcurl", "legCurl", "ACC", false), nov("a-calf", "calfRaise", "ACC", false),
            nov("a-preacher", "preacherCurl", "ACC"), nov("a-skull", "skullcrusher", "ACC"), nov("a-reardelt", "rearDeltFly", "ACC"),
          ],
        },
        {
          id: "B", name: "Day B",
          slots: [
            nov("b-legpress", "legPress", "MAIN", false), nov("b-incline", "dbInclineBench", "MAIN"), nov("b-cablerow", "cableRow", "MAIN"),
            nov("b-machohp", "machineShoulderPress", "SUPP"), nov("b-pulldown", "latPulldown", "SUPP"), nov("b-ghr", "gluteHamRaise", "SUPP", false),
            nov("b-split", "splitSquat", "ACC", false), nov("b-seatcalf", "seatedCalfRaise", "ACC", false),
            nov("b-shrug", "shrug", "ACC"), nov("b-fly", "chestFly", "ACC"), nov("b-lateral", "lateralRaise", "ACC"),
          ],
        },
      ],
      notes: [
        "The original adds sets (3→5) and reps (8→12) before adding ~10% weight; here every lift is 3×8–12 and goes up once all three sets hit 12.",
        "Neutral-grip pull-ups and glute-ham raises are bodyweight: start at 0 and add load when you reach 3×12.",
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
