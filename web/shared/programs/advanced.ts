// Advanced powerlifting blocks: Juggernaut Method 2.0, Calgary Barbell 8 week, RTS
// Generalized Intermediate. Each program week has its own days (`weeks: [w]`), as in Candito.
//
// Juggernaut 2.0 (Chad Wesley Smith). Source: LiftVault "Juggernaut Method Base Template" sheet
// (formulas read cell by cell). TM = 90% of 1RM. Four 4-week waves (10s, 8s, 5s, 3s), each
// accumulation / intensification / realization / deload. The realization AMRAP moves the TM by
// (reps − rep standard) × 5 lb lower / 2.5 lb upper, counting at most 10 extra reps.
// Accessories are left to the lifter (the book doesn't prescribe them).
//
// Calgary Barbell 8 week (Bryce Krawczyk). Source: Calgary Barbell's own sheets as hosted by
// LiftVault ("8 Week" and "16 Week (original)"), exported tab by tab: exact sets, reps, %1RM /
// RPE, rest and accessories. The 8 week is the 16 week's weeks 5–8 and 12–15 plus the taper
// (checked row by row), so the 16-week data is kept here as the source table. (The 16 week
// itself is `complete16` in sheet-blocks.ts.) In weeks 5–8 the back-off sets are "% of E1RM" from
// that day's RPE top set (`ofTop` sets); an e1rm rule also resets the 1RM from that top set so
// later % work (the taper) runs off the latest e1RM.
// The sheets write "1+2F" / "1+2R" (top set + 2 more sets) without defining F and R.
//
// RTS Generalized Intermediate (Mike Tuchscherer). Source: the author's article on
// reactivetrainingsystems.com (Dec 2015). Every lift is "work up to xN @RPE", then fatigue
// percents: Load Drop (drop the bar 4–6% / 6–9% and do sets of N until the RPE is back at
// target) or Repeat (repeat the top set until RPE climbs). For squat / bench / deadlift the
// back-offs are `ofTop` sets at RTS chart % × (1 − fatigue) of today's top-set e1RM (= the top
// load minus the fatigue %), and the comp-style top set resets the 1RM through an e1rm rule
// (used by week 9's 92% single). The number of fatigue sets is open-ended in the
// original; 2–4 are prescribed here. Week 9 is the author's taper and 1RM test.
//
// e1RMs use the standard RTS RPE chart (from memory; it matches the published chart's familiar
// values: 1@10 100, 1@9 95.5, 5@8 81.1). The engine's e1rm is Epley without RPE, so each
// e1rm rule's pct converts that to the chart's e1RM for the prescribed reps @ RPE.

import type { DayDef, PercentSet, ProgramDef, ProgramTemplate, SlotDef, Tier, TmRule } from "../program";
import type { Unit } from "../units";

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const maxes = (unit: Unit, lb: Record<string, number>) => Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));

// RTS RPE chart: %1RM for reps @ RPE. One rep = two half-RPE steps.
const RPE_CHART = [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6];
export function rpePct(reps: number, rpe: number): number {
  const i = Math.round((10 - rpe) * 2) + (reps - 1) * 2;
  return RPE_CHART[Math.min(Math.max(i, 0), RPE_CHART.length - 1)] / 100;
}
/** pct for an e1rm rule so the engine's Epley e1RM becomes the RTS-chart e1RM for reps @ rpe. */
export const e1rmPct = (reps: number, rpe: number) => 1 / (rpePct(reps, rpe) * (reps <= 1 ? 1 : 1 + reps / 30));

const rep = (n: number, s: PercentSet): PercentSet[] => Array.from({ length: n }, () => ({ ...s }));

// ───────────────────────── Juggernaut 2.0 ─────────────────────────

type Wave = { name: string; std: number; accum: number; accumSets: number; intens: number; ramp: [number, number]; rampReps: number; realRamp: [number, number][]; real: number };

const WAVES: Wave[] = [
  { name: "10s", std: 10, accum: 0.6, accumSets: 5, intens: 0.675, ramp: [0.55, 0.625], rampReps: 5, realRamp: [[0.5, 5], [0.6, 3], [0.7, 1]], real: 0.75 },
  { name: "8s", std: 8, accum: 0.65, accumSets: 5, intens: 0.725, ramp: [0.6, 0.675], rampReps: 3, realRamp: [[0.5, 5], [0.6, 3], [0.7, 2], [0.75, 1]], real: 0.8 },
  { name: "5s", std: 5, accum: 0.7, accumSets: 6, intens: 0.775, ramp: [0.65, 0.725], rampReps: 2, realRamp: [[0.5, 5], [0.6, 3], [0.7, 2], [0.75, 1], [0.8, 1]], real: 0.85 },
  { name: "3s", std: 3, accum: 0.75, accumSets: 7, intens: 0.825, ramp: [0.7, 0.775], rampReps: 1, realRamp: [[0.5, 5], [0.6, 3], [0.7, 2], [0.75, 1], [0.8, 1], [0.85, 1]], real: 0.9 },
];

/** The four weekly tables of a wave: accumulation, intensification, realization, deload. */
export function juggernautWave(w: Wave): PercentSet[][] {
  const amrapLast = (sets: PercentSet[]) => sets.map((s, i) => (i === sets.length - 1 ? { ...s, amrap: true } : s));
  return [
    amrapLast(rep(w.accumSets, { pct: w.accum, reps: w.std })),
    [{ pct: w.ramp[0], reps: w.rampReps }, { pct: w.ramp[1], reps: w.rampReps }, ...amrapLast(rep(3, { pct: w.intens, reps: w.std }))],
    [...w.realRamp.map(([pct, reps]) => ({ pct, reps })), { pct: w.real, reps: w.std, amrap: true, target: w.std }],
    [{ pct: 0.4, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.6, reps: 5 }],
  ];
}

// reps beyond the standard → that many increments, capped at 10; below the standard holds
const JUGG_TABLE = Array.from({ length: 11 }, (_, d) => ({ diff: d, increments: d }));
const PHASES = ["Accumulation", "Intensification", "Realization", "Deload"];

export const juggernaut: ProgramTemplate = {
  id: "juggernaut",
  name: "Juggernaut Method 2.0",
  author: "Chad Wesley Smith",
  source: "The Juggernaut Method 2.0 · LiftVault Juggernaut Method Base Template sheet (percentages from its formulas)",
  summary: "Four 4-week waves of 10s, 8s, 5s and 3s. Each wave climbs from volume to a realization AMRAP, and the reps you beat the standard by raise the training max.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 16,
  options: [],
  build(): ProgramDef {
    const lifts: [string, string][] = [["squat", "Squat"], ["bench", "Bench"], ["deadlift", "Deadlift"], ["ohp", "Press"]];
    const days: DayDef[] = [];
    WAVES.forEach((wave, wi) => {
      const tables = juggernautWave(wave);
      tables.forEach((table, phase) => {
        const week = wi * 4 + phase;
        lifts.forEach(([lift, label], d) => {
          const tmRule: TmRule | undefined = phase === 2 ? { type: "amrapVsTarget", setIndex: table.length - 1, table: JUGG_TABLE } : undefined;
          days.push({
            id: `W${week + 1}D${d + 1}`,
            name: `${wave.name} ${PHASES[phase]} · ${label}`,
            weeks: [week],
            slots: [{ id: `w${week + 1}d${d + 1}-${lift}`, lift, tier: "MAIN", progression: { kind: "percent", tmLift: lift, weeks: [table], tmRule } }],
          });
        });
      });
    });
    return {
      templateId: "juggernaut",
      name: "Juggernaut Method 2.0",
      sessionsPerWeek: 4,
      days,
      maxLabel: "Training max (90% of 1RM)",
      tmIncrement: { squat: { lb: 5, kg: 2.5 }, deadlift: { lb: 5, kg: 2.5 }, bench: { lb: 2.5, kg: 1.25 }, ohp: { lb: 2.5, kg: 1.25 } },
      cycle: { weeks: 16, finite: true, weekNames: WAVES.flatMap((w) => PHASES.map((p) => `${w.name} · ${p}`)) },
      notes: [
        "Training max = 90% of your 1RM. Stop working sets 1–3 reps shy of failure; the last set marked + is for max reps.",
        "Realization week: the last set is an all-out AMRAP. Each rep over the standard (10/8/5/3) adds 5 lb (squat, deadlift) or 2.5 lb (bench, press) to the TM, up to 10 reps.",
        "Add accessories of your choice.",
      ],
    };
  },
  defaults(unit: Unit) {
    // 1RMs 315 / 225 / 405 / 145 → TM 90%
    return { trainingMaxes: maxes(unit, { squat: 285, bench: 205, deadlift: 365, ohp: 130 }), startWeights: {} };
  },
};

// ───────────────────────── Calgary Barbell ─────────────────────────

/** [exercise as written in the sheet, sets ("3" or "1+2F"), reps ("x" = timed), intensity ("80%" | "8RPE" | "30s" | "Opener" | ""), rest s] */
type Row = [string, string, string, string, number];

type Base = "squat" | "bench" | "deadlift";
// Sheet exercise → lift key, whose 1RM its percentages use. Variations whose name says more
// than the lift (tempo, grip) keep the sheet's name as the slot note.
const CB_LIFTS: Record<string, [string, Base]> = {
  "Competition Squat": ["squat", "squat"],
  "Competition Squat (% of E1RM)": ["squat", "squat"],
  "High Bar Squat": ["squat", "squat"],
  "Paused Bench": ["bench", "bench"],
  "Competition Pause Bench": ["bench", "bench"],
  "Competition Pause Bench (% of E1RM)": ["bench", "bench"],
  "Touch and Go Bench": ["bench", "bench"],
  "Rep Bench (Touch and Go)": ["bench", "bench"],
  "Bench +mini bands": ["bench", "bench"],
  "Competition Deadlift": ["deadlift", "deadlift"],
  "Competition Deadlift (% of E1RM)": ["deadlift", "deadlift"],
  "2ct Pause Squat": ["pauseSquat", "squat"],
  "2ct Pause Squats": ["pauseSquat", "squat"],
  "SSB or Front or High Bar Pause Squat": ["pauseSquat", "squat"],
  "Pin Squat": ["pinSquat", "squat"],
  "Pin Squat (pins set for full depth)": ["pinSquat", "squat"],
  "2ct Pause Bench": ["pauseBench", "bench"],
  "3ct Pause Bench": ["pauseBench", "bench"],
  "Feet Up Bench": ["feetUpBench", "bench"],
  "Close Grip Bench": ["cgBench", "bench"],
  "Close Grip Bench Press": ["cgBench", "bench"],
  "Close Grip Incline Press": ["inclineBench", "bench"],
  "2Board Press": ["boardPress", "bench"],
  "Pin Press (chest level)": ["pinPress", "bench"],
  "Overhead Press": ["ohp", "bench"],
  "Barbell Overhead Press": ["ohp", "bench"],
  "Tricep movement of choice": ["tricepPushdown", "bench"],
  "2ct Pause Deadlift (pause barely off floor)": ["pauseDeadlift", "deadlift"],
  "2ct Pause Deadlifts (pause barely off the floor)": ["pauseDeadlift", "deadlift"],
  "2ct Pause Deadlifts (just off floor)": ["pauseDeadlift", "deadlift"],
  "2ct Pause Deadlifts": ["pauseDeadlift", "deadlift"],
  "SLDL": ["stiffLegDeadlift", "deadlift"],
  "Bent Over Row": ["row", "deadlift"],
  "1-Arm DB Rows": ["dbRow", "deadlift"],
  "Wide Grip Seated Row (mimic bench movement)": ["cableRow", "deadlift"],
  "Wide Grip Seated Row (cable - mimic bench grip and movement)": ["cableRow", "deadlift"],
  "Vertical Pull of choice": ["latPulldown", "deadlift"],
  "GHR Back Extensions": ["backExtension", "deadlift"],
  "Birddogs (reps per side)": ["birdDog", "squat"],
  "Side Planks (seconds per side)": ["sidePlank", "squat"],
  "Rolling Planks (total reps, not per side)": ["plank", "squat"],
};

const COMP = /^(Competition |Paused Bench)/;

/** One sheet row → sets. "1+2F 6 9RPE" = top set + 2 more sets of 6 @9. */
function cbSets(r: Row): { sets: PercentSet[]; note?: string } {
  const [, setsS, repsS, inten] = r;
  const m = /^(\d+)(?:\+(\d+)([FR]))?$/.exec(setsS);
  if (!m) throw new Error(`bad sets ${setsS}`);
  const n = Number(m[1]) + Number(m[2] ?? 0);
  const timed = repsS === "x";
  const reps = timed ? parseInt(inten, 10) : Number(repsS);
  const s: PercentSet = { reps };
  if (inten.endsWith("%")) s.pct = Number(inten.slice(0, -1)) / 100;
  else if (inten.endsWith("RPE")) s.rpe = Number(inten.slice(0, -3));
  const notes = [m[2] ? `${setsS}: top set, then ${m[2]} more` : "", timed ? "reps = seconds" : "", inten === "Opener" ? "single at your planned opener" : ""].filter(Boolean);
  return { sets: rep(n, s), note: notes.join(", ") || undefined };
}

function calgaryDays(weeks: Row[][][], taper: boolean): DayDef[] {
  const days: DayDef[] = [];
  const taperNames = ["5 days out", "4 days out", "3 days out", "2 days out"];
  weeks.forEach((wk, w) => {
    const isTaper = taper && w === weeks.length - 1;
    wk.forEach((rows, d) => {
      // consecutive rows of the same lift (top set + back-offs, "" = continuation) form one slot
      const groups: { name: string; rows: Row[] }[] = [];
      for (const r of rows) {
        const prev = groups[groups.length - 1];
        if (prev && (r[0] === "" || CB_LIFTS[r[0]][0] === CB_LIFTS[prev.name][0])) prev.rows.push(r);
        else groups.push({ name: r[0], rows: [r] });
      }
      const used = new Map<string, number>();
      const slots = groups.map(({ name, rows: g }): SlotDef => {
        const [lift, base] = CB_LIFTS[name];
        const parts = g.map(cbSets);
        const sets = parts.flatMap((p) => p.sets);
        const top = sets[0];
        // RPE top set followed by % back-offs: the % is of today's e1RM
        const tmRule: TmRule | undefined = top.rpe != null && top.pct == null && sets.slice(1).some((s) => s.pct != null) ? { type: "e1rm", setIndex: 0, pct: e1rmPct(top.reps, top.rpe) } : undefined;
        const finalSets = tmRule ? sets.map((s, i) => (i > 0 && s.pct != null ? { ...s, ofTop: true } : s)) : sets;
        const intense = sets.some((s) => s.pct != null || s.rpe != null);
        const tier: Tier = COMP.test(name) ? "MAIN" : intense ? "SUPP" : "ACC";
        const k = used.get(lift) ?? 0;
        used.set(lift, k + 1);
        const note = [COMP.test(name) ? "" : name, tmRule ? "back-offs are % of the e1RM of today's top set" : "", ...parts.map((p) => p.note)].filter(Boolean).join(" · ");
        return {
          id: `w${w + 1}d${d + 1}-${lift}${k ? k + 1 : ""}`, lift, tier, restSeconds: g[0][4] || undefined, note: note || undefined,
          progression: { kind: "percent", tmLift: base, weeks: [finalSets], tmRule },
        };
      });
      days.push({ id: `W${w + 1}D${d + 1}`, name: isTaper ? `Taper · ${taperNames[d]}` : `Week ${w + 1} · Day ${d + 1}`, weeks: [w], slots });
    });
  });
  return days;
}

function calgary(id: string, name: string, weeksOf: () => Row[][][], summary: string, runWeeks: number): ProgramTemplate {
  return {
    id, name,
    author: "Bryce Krawczyk (Calgary Barbell)",
    source: "Calgary Barbell's free program sheets, as hosted by LiftVault (exported tab by tab)",
    summary,
    category: "powerlifting",
    level: "intermediate",
    daysPerWeek: [4],
    weeks: runWeeks,
    options: [{ key: "taper", label: "Taper week", default: "on", choices: [{ value: "on", label: "Include meet taper" }, { value: "off", label: "Skip (no meet)" }] }],
    build(o): ProgramDef {
      const taper = (o.taper ?? "on") === "on";
      const all = weeksOf();
      const weeks = taper ? all : all.slice(0, -1);
      return {
        templateId: id, name, sessionsPerWeek: 4,
        days: calgaryDays(weeks, taper),
        maxLabel: "1RM",
        cycle: { weeks: weeks.length, finite: true, weekNames: weeks.map((_, i) => (taper && i === weeks.length - 1 ? "Taper" : `Week ${i + 1}`)) },
        notes: [
          "Percentages are of your 1RM. RPE sets: pick the load that hits the target RPE.",
          "Top set + back-off weeks: work up to the RPE top set; the back-offs are a % of that set's e1RM.",
          "Pin squat can be swapped for pause or box squat.",
        ],
      };
    },
    defaults(unit: Unit) {
      return { trainingMaxes: maxes(unit, { squat: 315, bench: 225, deadlift: 405 }), startWeights: {} };
    },
  };
}

export const calgary8 = calgary(
  "calgary-8", "Calgary Barbell 8 Week", () => [...CB16.slice(4, 8), ...CB16.slice(11, 15), CB16[15]],
  "The 16 week program's weeks 5–8 and 12–15: four weeks of percentage work, four of RPE top sets with e1RM back-offs, plus an optional taper week.",
  9,
);

// ───────────────────────── RTS Generalized Intermediate ─────────────────────────

type Method = "D" | "R"; // Load Drop | Repeat
/** [lift, as written, reps, RPE, method, TM use: 2 = updates the max, 1 = back-offs % of max, 0 = RPE only] */
type RtsRow = [string, string, number, number, Method, 0 | 1 | 2];
type Fatigue = "none" | "4-6" | "6-9";

const SQ = (r: number): RtsRow => ["squat", "Squat w/belt", r, 9, "D", 2];
const BP = (r: number): RtsRow => ["bench", "Competition Raw Bench", r, 9, "D", 2];
const DL = (r: number): RtsRow => ["deadlift", "Deadlift w/belt", r, 9, "D", 2];
const TNG = (r: number, rpe = 9): RtsRow => ["bench", "Bench (touch and go)", r, rpe, "D", 1];
const WRAPS = (r: number): RtsRow => ["squat", "Squat w/belt, wraps", r, 9, "D", 1];
const V = (lift: string, label: string, r: number, rpe = 9, m: Method = "D"): RtsRow => [lift, label, r, rpe, m, 0];

const RTS_A = (r: [number, number, number, number, number, number, number, number, number, number, number, number]): RtsRow[][] => [
  [SQ(r[0]), BP(r[1]), V("pauseBench", "3ct Pause Bench", r[2])],
  [DL(r[3]), V("floorPress", "Floor Press", r[4]), V("frontSquat", "Front Squat", r[5])],
  [V("pinSquat", "Pin Squat", r[6]), TNG(r[7], r[7] >= 6 ? 10 : 9), V("pushPress", "Push Press", r[8])],
  [V("deficitDeadlift", '2" Deficit Deadlift', r[9]), V("cgBench", "Close Grip Bench", r[10]), V("stiffLegDeadlift", "Snatch Grip SLDL", r[11])],
];
const RTS_B = (r: number[]): RtsRow[][] => [
  [SQ(r[0]), BP(r[1]), V("pauseBench", "2ct Pause Bench", r[2])],
  [DL(r[3]), V("pinPress", "Pin Press (mid range)", r[4]), V("squat", "303 Tempo Squat", r[5])],
  [WRAPS(r[6]), TNG(r[7]), V("inclineBench", "Close Grip Incline", r[8])],
  [V("rackPull", "Rack Pull (below knee)", r[9]), V("jmPress", "J.M. Press", r[10]), V("cableRow", "Lever Rows", r[11])],
];
const RTS_C = (r: number[]): RtsRow[][] => [
  [SQ(r[0]), TNG(r[1], r[1] >= 6 ? 10 : 9), V("cgBench", "Close Grip Bench", r[2], 8, "R")],
  [BP(r[3]), DL(r[4]), V("pushPress", "Push Press", r[5], 8, "R"), V("frontSquat", "Front Squat", r[6], 8, "R")],
  [V("pauseSquat", "2ct Pause Squat", r[7]), V("pinPress", "Pin Press (chest level)", r[8]), V("stiffLegDeadlift", "Snatch Grip SLDL", r[9], 8, "R")],
];
const RTS_D = (r: number[]): RtsRow[][] => [
  [SQ(r[0]), TNG(r[1]), V("floorPress", "Close Grip Floor Press", r[2], 8, "R")],
  [BP(r[3]), DL(r[4]), V("ohp", "Military", r[5], 8, "R"), V("pauseSquat", "2ct Pause Squat", r[6], 8, "R")],
  [WRAPS(r[7]), V("pauseBench", "2ct Pause Bench", r[8]), V("pendlayRow", "Pendlay Rows", r[9], 8, "R")],
];

const RTS_WEEKS: { fatigue: Fatigue; days: RtsRow[][] }[] = [
  { fatigue: "none", days: RTS_A([4, 4, 5, 4, 4, 6, 5, 6, 6, 5, 6, 6]) },
  { fatigue: "4-6", days: RTS_B([5, 5, 4, 5, 3, 7, 4, 5, 7, 4, 7, 7]) },
  { fatigue: "6-9", days: RTS_A([3, 3, 5, 3, 4, 5, 5, 8, 5, 5, 5, 5]) },
  { fatigue: "4-6", days: RTS_B([4, 4, 3, 4, 2, 6, 3, 4, 6, 3, 6, 6]) },
  { fatigue: "4-6", days: RTS_C([3, 7, 5, 3, 3, 5, 5, 4, 4, 5]) },
  { fatigue: "6-9", days: RTS_D([4, 3, 6, 4, 4, 6, 6, 2, 2, 6]) },
  { fatigue: "4-6", days: RTS_C([2, 6, 4, 2, 2, 4, 4, 3, 3, 4]) },
  { fatigue: "4-6", days: RTS_D([3, 2, 5, 3, 3, 5, 5, 2, 2, 5]) },
];

/** Load-drop sets drop the bar by the fatigue % (midpoint) and repeat until RPE is back at target. */
function rtsSets([, , reps, rpe, method, tm]: RtsRow, fatigue: Fatigue): { sets: PercentSet[]; note: string } {
  const top: PercentSet = { rpe, reps };
  if (fatigue === "none") return { sets: [top], note: `work up to x${reps} @${rpe}, no fatigue sets` };
  const drop = fatigue === "4-6" ? 0.05 : 0.075;
  const n = method === "D" ? (fatigue === "4-6" ? 3 : 4) : fatigue === "4-6" ? 2 : 3;
  // squat / bench / deadlift: the drop as a % of today's top-set e1RM (top load = chart % of it)
  const back: PercentSet = tm ? { pct: Math.round(rpePct(reps, rpe) * (method === "D" ? 1 - drop : 1) * 1000) / 1000, reps, ofTop: true } : method === "R" ? { rpe, reps } : { reps };
  const how = method === "D" ? `load drop ${fatigue}%: top-set weight −${drop * 100}%, sets of ${reps} until @${rpe} again` : `repeats ${fatigue}%: repeat the top set until RPE climbs`;
  return { sets: [top, ...rep(n, back)], note: `${how} (~${n})` };
}

export const rtsGeneralized: ProgramTemplate = {
  id: "rts-generalized",
  name: "RTS Generalized Intermediate",
  author: "Mike Tuchscherer (Reactive Training Systems)",
  source: "\"The RTS Generalized Intermediate Program\", reactivetrainingsystems.com (2015)",
  summary: "Nine weeks of RPE top sets with fatigue-percent back-offs: four days a week for weeks 1–4, three for weeks 5–8, then a taper and 1RM test.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3, 4],
  weeks: 9,
  options: [],
  build(): ProgramDef {
    const days: DayDef[] = [];
    const dayNames4 = ["Monday", "Tuesday", "Thursday", "Friday"], dayNames3 = ["Monday", "Wednesday", "Friday"];
    RTS_WEEKS.forEach(({ fatigue, days: wk }, w) => {
      wk.forEach((rows, d) => {
        const used = new Map<string, number>();
        const slots = rows.map((row): SlotDef => {
          const [lift, label, reps, rpe, , tm] = row;
          const { sets, note } = rtsSets(row, fatigue);
          const base = lift === "bench" || lift === "squat" || lift === "deadlift" ? lift : ["pauseBench", "floorPress", "pushPress", "cgBench", "pinPress", "inclineBench", "jmPress", "ohp", "cableRow", "pendlayRow"].includes(lift) ? "bench" : lift === "deficitDeadlift" || lift === "rackPull" || lift === "stiffLegDeadlift" ? "deadlift" : "squat";
          const k = used.get(lift) ?? 0;
          used.set(lift, k + 1);
          return {
            id: `w${w + 1}d${d + 1}-${lift}${k ? k + 1 : ""}`, lift, tier: tm ? "MAIN" : "SUPP", note: `${label} · ${note}`,
            progression: { kind: "percent", tmLift: base, weeks: [sets], tmRule: tm === 2 ? { type: "e1rm", setIndex: 0, pct: e1rmPct(reps, rpe) } : undefined },
          };
        });
        days.push({ id: `W${w + 1}D${d + 1}`, name: `Week ${w + 1} · ${(wk.length === 4 ? dayNames4 : dayNames3)[d]}`, weeks: [w], slots });
      });
    });
    // Week 9: single at 92% of your previous 1RM, warm-ups only, then test.
    const w9: [string, string, PercentSet, string, TmRule?][] = [
      ["W9D1", "Week 9 · Monday", { pct: 0.92, reps: 1 }, "work up to 92% of previous 1RM for one single"],
      ["W9D2", "Week 9 · Wednesday", { pct: 0.8, reps: 1 }, "warm-up routine only, nothing heavier than 80%"],
      ["W9D3", "Week 9 · Practice meet", { rpe: 10, reps: 1 }, "test your 1RM", { type: "e1rm", setIndex: 0, pct: 1 }],
    ];
    for (const [id, name, set, note, tmRule] of w9) {
      days.push({ id, name, weeks: [8], slots: (["squat", "bench", "deadlift"] as const).map((lift) => ({ id: `${id.toLowerCase()}-${lift}`, lift, tier: "MAIN", note, progression: { kind: "percent", tmLift: lift, weeks: [[set]], tmRule } })) });
    }
    return {
      templateId: "rts-generalized",
      name: "RTS Generalized Intermediate",
      sessionsPerWeek: 4,
      days,
      maxLabel: "1RM (e1RM, updated from your top sets)",
      cycle: { weeks: 9, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Taper / test"] },
      notes: [
        "Work up to the top set at the prescribed reps @ RPE, then do the fatigue sets: Load Drop = drop the bar by the fatigue % and do sets of the same reps until you're back at that RPE; Repeat = repeat the top-set weight until RPE climbs.",
        "Squat, bench and deadlift back-offs are shown as a % of today's top-set e1RM (RTS RPE chart); competition-style top sets also update your 1RM for the week 9 single. Variations are RPE only.",
      ],
    };
  },
  defaults(unit: Unit) {
    return { trainingMaxes: maxes(unit, { squat: 315, bench: 225, deadlift: 405 }), startWeights: {} };
  },
};

// Calgary Barbell 16 Week (original), exported from the sheet: weeks 1–15 then the taper (5/4/3/2 days out).
const CB16: Row[][][] = [
  // week 1
  [
    [
      ["Competition Squat", "4", "7", "67%", 180],
      ["Paused Bench", "4", "7", "67%", 180],
      ["Overhead Press", "3", "8", "", 120],
      ["Bent Over Row", "3", "12", "", 90],
      ["GHR Back Extensions", "4", "12", "", 60],
    ],
    [
      ["Competition Deadlift", "4", "7", "67%", 180],
      ["3ct Pause Bench", "3", "5", "60%", 180],
      ["SSB or Front or High Bar Pause Squat", "3", "5", "8RPE", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "5", "8", "", 90],
    ],
    [
      ["Pin Squat (pins set for full depth)", "3", "6", "65%", 120],
      ["2Board Press", "3", "6", "8RPE", 60],
      ["1-Arm DB Rows", "5", "10", "", 90],
      ["Birddogs (reps per side)", "3", "6", "", 90],
    ],
    [
      ["2ct Pause Deadlift (pause barely off floor)", "3", "6", "63%", 120],
      ["Rep Bench (Touch and Go)", "4", "10", "63%", 120],
      ["SLDL", "3", "8", "40%", 180],
      ["Vertical Pull of choice", "4", "10", "", 90],
      ["Tricep movement of choice", "4", "10", "", 90],
    ],
  ],
  // week 2
  [
    [
      ["Competition Squat", "4", "6", "70%", 180],
      ["Paused Bench", "4", "6", "70%", 180],
      ["Overhead Press", "3", "8", "", 120],
      ["Bent Over Row", "3", "12", "", 90],
      ["GHR Back Extensions", "4", "12", "", 60],
    ],
    [
      ["Competition Deadlift", "4", "6", "70%", 180],
      ["3ct Pause Bench", "3", "6", "60%", 180],
      ["SSB or Front or High Bar Pause Squat", "3", "6", "8RPE", 45],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "5", "8", "", 90],
    ],
    [
      ["Pin Squat (pins set for full depth)", "3", "5", "70%", 120],
      ["2Board Press", "3", "5", "8RPE", 60],
      ["1-Arm DB Rows", "5", "10", "", 90],
      ["Birddogs (reps per side)", "3", "6", "", 90],
    ],
    [
      ["2ct Pause Deadlift (pause barely off floor)", "3", "5", "65%", 120],
      ["Rep Bench (Touch and Go)", "4", "10", "65%", 120],
      ["SLDL", "3", "8", "43%", 180],
      ["Vertical Pull of choice", "4", "10", "", 90],
      ["Tricep movement of choice", "4", "10", "", 90],
    ],
  ],
  // week 3
  [
    [
      ["Competition Squat", "4", "6", "73%", 180],
      ["Paused Bench", "4", "6", "73%", 180],
      ["Overhead Press", "3", "7", "", 120],
      ["Bent Over Row", "3", "8", "", 90],
      ["GHR Back Extensions", "5", "10", "", 60],
    ],
    [
      ["Competition Deadlift", "4", "6", "73%", 180],
      ["3ct Pause Bench", "3", "4", "65%", 180],
      ["SSB or Front or High Bar Pause Squat", "3", "4", "8RPE", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "5", "8", "", 90],
    ],
    [
      ["Pin Squat (pins set for full depth)", "3", "6", "68%", 120],
      ["2Board Press", "3", "4", "8RPE", 60],
      ["1-Arm DB Rows", "5", "8", "", 90],
      ["Birddogs (reps per side)", "3", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlift (pause barely off floor)", "3", "6", "68%", 120],
      ["Rep Bench (Touch and Go)", "4", "10", "68%", 120],
      ["SLDL", "3", "6", "45%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
      ["Tricep movement of choice", "4", "8", "", 90],
    ],
  ],
  // week 4
  [
    [
      ["Competition Squat", "5", "5", "75%", 180],
      ["Paused Bench", "5", "5", "75%", 180],
      ["Overhead Press", "3", "7", "", 120],
      ["Bent Over Row", "3", "8", "", 90],
      ["GHR Back Extensions", "5", "10", "", 60],
    ],
    [
      ["Competition Deadlift", "5", "5", "75%", 180],
      ["3ct Pause Bench", "3", "3", "70%", 180],
      ["SSB or Front or High Bar Pause Squat", "3", "5", "8RPE", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "4", "8", "", 90],
    ],
    [
      ["Pin Squat (pins set for full depth)", "3", "5", "73%", 120],
      ["2Board Press", "3", "6", "8RPE", 60],
      ["1-Arm DB Rows", "5", "8", "", 90],
      ["Birddogs (reps per side)", "4", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlift (pause barely off floor)", "3", "5", "73%", 120],
      ["Rep Bench (Touch and Go)", "4", "8", "70%", 120],
      ["SLDL", "3", "6", "48%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
      ["Tricep movement of choice", "4", "8", "", 90],
    ],
  ],
  // week 5
  [
    [
      ["Competition Squat", "3", "3", "80%", 180],
      ["Competition Squat", "2", "5", "68%", 180],
      ["Competition Pause Bench", "4", "3", "80%", 180],
      ["Competition Pause Bench", "2", "5", "68%", 180],
      ["SLDL", "4", "9", "8RPE", 90],
      ["Side Planks (seconds per side)", "3", "x", "30s", 60],
    ],
    [
      ["Competition Deadlift", "3", "3", "80%", 180],
      ["Competition Deadlift", "2", "5", "68%", 180],
      ["2ct Pause Bench", "3", "4", "8RPE", 180],
      ["Competition Squat", "2", "5", "65%", 180],
      ["Wide Grip Seated Row (mimic bench movement)", "4", "10", "", 60],
    ],
    [
      ["2ct Pause Squat", "4", "4", "8RPE", 180],
      ["Competition Pause Bench", "6", "5", "70%", 180],
      ["Feet Up Bench", "4", "5", "8RPE", 180],
      ["Competition Deadlift", "2", "5", "65%", 180],
      ["Vertical Pull of choice", "4", "10", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (pause barely off the floor)", "4", "4", "8RPE", 180],
      ["Touch and Go Bench", "3", "6", "9RPE", 180],
      ["Close Grip Incline Press", "4", "8", "", 120],
      ["1-Arm DB Rows", "6", "10", "", 60],
    ],
  ],
  // week 6
  [
    [
      ["Competition Squat", "4", "3", "82%", 180],
      ["Competition Squat", "2", "5", "70%", 180],
      ["Competition Pause Bench", "5", "3", "82%", 180],
      ["Competition Pause Bench", "3", "5", "70%", 180],
      ["SLDL", "4", "8", "8RPE", 90],
      ["Side Planks (seconds per side)", "4", "x", "30s", 60],
    ],
    [
      ["Competition Deadlift", "4", "3", "82%", 180],
      ["Competition Deadlift", "2", "5", "70%", 180],
      ["2ct Pause Bench", "4", "3", "8RPE", 180],
      ["Competition Squat", "3", "5", "68%", 180],
      ["Wide Grip Seated Row (mimic bench movement)", "4", "10", "", 60],
    ],
    [
      ["2ct Pause Squat", "5", "3", "8RPE", 180],
      ["Competition Pause Bench", "6", "4", "73%", 180],
      ["Feet Up Bench", "3", "4", "8RPE", 120],
      ["Competition Deadlift", "3", "5", "68%", 180],
      ["Vertical Pull of choice", "4", "10", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (pause barely off the floor)", "5", "3", "8RPE", 180],
      ["Touch and Go Bench", "3", "12", "10RPE", 180],
      ["Close Grip Incline Press", "4", "7", "", 120],
      ["1-Arm DB Rows", "6", "10", "", 60],
    ],
  ],
  // week 7
  [
    [
      ["Competition Squat", "5", "2", "86%", 180],
      ["Competition Squat", "2", "4", "72%", 180],
      ["Competition Pause Bench", "5", "2", "86%", 180],
      ["Competition Pause Bench", "2", "4", "72%", 180],
      ["SLDL", "4", "8", "8RPE", 90],
      ["Side Planks (seconds per side)", "4", "x", "45s", 60],
    ],
    [
      ["Competition Deadlift", "5", "2", "86%", 180],
      ["Competition Deadlift", "2", "4", "72%", 180],
      ["2ct Pause Bench", "3", "3", "8RPE", 180],
      ["Competition Squat", "2", "5", "71%", 180],
      ["Wide Grip Seated Row (mimic bench movement)", "4", "8", "", 60],
    ],
    [
      ["2ct Pause Squat", "4", "5", "9RPE", 180],
      ["Competition Pause Bench", "6", "3", "75%", 180],
      ["Feet Up Bench", "4", "3", "8RPE", 120],
      ["Competition Deadlift", "2", "5", "71%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (pause barely off the floor)", "4", "5", "8RPE", 180],
      ["Touch and Go Bench", "4", "7", "8RPE", 180],
      ["Close Grip Incline Press", "5", "6", "", 120],
      ["1-Arm DB Rows", "6", "8", "", 60],
    ],
  ],
  // week 8
  [
    [
      ["Competition Squat", "4", "3", "85%", 180],
      ["Competition Squat", "3", "4", "75%", 180],
      ["Competition Pause Bench", "5", "3", "85%", 180],
      ["Competition Pause Bench", "3", "4", "75%", 180],
      ["SLDL", "4", "7", "8RPE", 90],
      ["Side Planks (seconds per side)", "4", "x", "45s", 60],
    ],
    [
      ["Competition Deadlift", "4", "3", "85%", 180],
      ["Competition Deadlift", "3", "4", "75%", 180],
      ["2ct Pause Bench", "4", "4", "8RPE", 180],
      ["Competition Squat", "2", "4", "74%", 180],
      ["Wide Grip Seated Row (mimic bench movement)", "4", "8", "", 60],
    ],
    [
      ["2ct Pause Squat", "4", "2", "9RPE", 180],
      ["Competition Pause Bench", "6", "5", "68%", 180],
      ["Feet Up Bench", "4", "4", "8RPE", 120],
      ["Competition Deadlift", "2", "4", "74%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (pause barely off the floor)", "4", "2", "9RPE", 180],
      ["Touch and Go Bench", "4", "5", "8RPE", 180],
      ["Close Grip Incline Press", "4", "10", "", 120],
      ["1-Arm DB Rows", "6", "8", "", 60],
    ],
  ],
  // week 9
  [
    [
      ["Competition Squat", "5", "4", "82%", 180],
      ["Competition Squat", "2", "4", "71%", 180],
      ["Competition Pause Bench", "6", "4", "82%", 180],
      ["Competition Pause Bench", "2", "4", "71%", 180],
      ["Bent Over Row", "4", "8", "8RPE", 90],
      ["Rolling Planks (total reps, not per side)", "3", "20", "", 60],
    ],
    [
      ["Competition Deadlift", "4", "4", "82%", 180],
      ["Competition Deadlift", "2", "4", "71%", 180],
      ["Pin Press (chest level)", "4", "4", "8RPE", 180],
      ["Competition Squat", "3", "5", "68%", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "4", "8", "", 60],
    ],
    [
      ["2ct Pause Squats", "1+2F", "4", "9RPE", 180],
      ["Competition Pause Bench", "6", "5", "72%", 180],
      ["Close Grip Bench Press", "1+2R", "4", "8RPE", 180],
      ["Competition Deadlift", "2", "5", "68%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (just off floor)", "1+2F", "4", "9RPE", 180],
      ["Bench +mini bands", "1+1F", "8", "9RPE", 180],
      ["Barbell Overhead Press", "1+3R", "7", "8RPE", 120],
      ["1-Arm DB Rows", "5", "8", "", 60],
    ],
  ],
  // week 10
  [
    [
      ["Competition Squat", "6", "3", "85%", 180],
      ["Competition Squat", "2", "4", "74%", 180],
      ["Competition Pause Bench", "7", "4", "85%", 180],
      ["Competition Pause Bench", "2", "4", "74%", 180],
      ["Bent Over Row", "4", "6", "8RPE", 90],
      ["Rolling Planks (total reps, not per side)", "4", "20", "", 60],
    ],
    [
      ["Competition Deadlift", "5", "3", "85%", 180],
      ["Competition Deadlift", "2", "4", "74%", 180],
      ["Pin Press (chest level)", "4", "5", "8RPE", 180],
      ["Competition Squat", "3", "5", "71%", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "4", "8", "", 60],
    ],
    [
      ["2ct Pause Squats", "1+3F", "2", "9RPE", 180],
      ["Competition Pause Bench", "6", "4", "75%", 180],
      ["Close Grip Bench Press", "1+1F", "3", "9RPE", 120],
      ["Competition Deadlift", "3", "5", "71%", 180],
      ["Vertical Pull of choice", "4", "8", "", 90],
    ],
    [
      ["2ct Pause Deadlifts (just off floor)", "1+3F", "2", "9RPE", 180],
      ["Bench +mini bands", "1+1F", "7", "9RPE", 180],
      ["Barbell Overhead Press", "1+2R", "8", "8RPE", 120],
      ["1-Arm DB Rows", "5", "8", "", 60],
    ],
  ],
  // week 11
  [
    [
      ["Competition Squat", "3", "3", "83%", 180],
      ["Competition Squat", "2", "4", "76%", 180],
      ["Competition Pause Bench", "3", "3", "83%", 180],
      ["Competition Pause Bench", "2", "4", "76%", 180],
      ["Bent Over Row", "4", "5", "8RPE", 90],
      ["Rolling Planks (total reps, not per side)", "4", "24", "", 60],
    ],
    [
      ["Competition Deadlift", "3", "3", "83%", 180],
      ["Competition Deadlift", "2", "4", "76%", 180],
      ["Pin Press (chest level)", "4", "3", "8RPE", 180],
      ["Competition Squat", "3", "4", "74%", 180],
      ["Wide Grip Seated Row (cable - mimic bench grip and movement)", "4", "8", "", 60],
    ],
    [
      ["2ct Pause Squats", "1+1R", "3", "8RPE", 180],
      ["Competition Pause Bench", "5", "3", "78%", 180],
      ["Close Grip Bench Press", "1+1R", "2", "8RPE", 180],
      ["Competition Deadlift", "3", "4", "74%", 180],
      ["Vertical Pull of choice", "4", "8", "", 180],
    ],
    [
      ["2ct Pause Deadlifts (just off floor)", "1+1R", "3", "8RPE", 180],
      ["Bench +mini bands", "1+1F", "6", "9RPE", 180],
      ["Barbell Overhead Press", "1+1R", "5", "8RPE", 180],
      ["1-Arm DB Rows", "5", "8", "", 60],
    ],
  ],
  // week 12
  [
    [
      ["Competition Squat", "1", "3", "8RPE", 180],
      ["Competition Squat (% of E1RM)", "6", "5", "65%", 180],
      ["Competition Pause Bench", "1", "3", "8RPE", 180],
      ["Competition Pause Bench (% of E1RM)", "7", "5", "65%", 180],
      ["Overhead Press", "1+2F", "6", "9RPE", 120],
    ],
    [
      ["Competition Deadlift", "1", "3", "8RPE", 180],
      ["Competition Deadlift (% of E1RM)", "6", "5", "65%", 180],
      ["2ct Pause Bench", "1+2F", "4", "9RPE", 180],
      ["High Bar Squat", "1+2R", "4", "8RPE", 180],
    ],
    [
      ["Pin Squat", "1", "3", "8RPE", 180],
      ["Pin Squat", "1+1F", "4", "9RPE", 180],
      ["Close Grip Bench", "1+2F", "3", "9RPE", 180],
      ["Feet Up Bench", "1+1F", "5", "9RPE", 180],
    ],
    [
      ["2ct Pause Deadlifts", "1", "3", "8RPE", 180],
      ["2ct Pause Deadlifts", "1+2F", "5", "9RPE", 180],
      ["Touch and Go Bench", "1+3R", "5", "8RPE", 180],
    ],
  ],
  // week 13
  [
    [
      ["Competition Squat", "1", "2", "8RPE", 180],
      ["Competition Squat (% of E1RM)", "6", "5", "68%", 180],
      ["Competition Pause Bench", "1", "2", "8RPE", 180],
      ["Competition Pause Bench (% of E1RM)", "7", "5", "68%", 180],
      ["Overhead Press", "1+1F", "7", "9RPE", 90],
    ],
    [
      ["Competition Deadlift", "1", "2", "8RPE", 180],
      ["Competition Deadlift (% of E1RM)", "6", "5", "68%", 180],
      ["2ct Pause Bench", "1+2R", "5", "8RPE", 180],
      ["High Bar Squat", "1+1F", "3", "9RPE", 180],
    ],
    [
      ["Pin Squat", "1", "2", "8RPE", 180],
      ["Pin Squat", "1+1F", "5", "9RPE", 180],
      ["Close Grip Bench", "1+1F", "2", "9RPE", 180],
      ["Feet Up Bench", "1+1F", "6", "9RPE", 180],
    ],
    [
      ["2ct Pause Deadlifts", "1", "2", "8RPE", 180],
      ["2ct Pause Deadlifts", "1+2R", "4", "8RPE", 180],
      ["Touch and Go Bench", "1+3R", "4", "8RPE", 180],
    ],
  ],
  // week 14
  [
    [
      ["Competition Squat", "1", "1", "8RPE", 180],
      ["Competition Squat (% of E1RM)", "4", "4", "72%", 180],
      ["Competition Pause Bench", "1", "1", "9RPE", 180],
      ["Competition Pause Bench (% of E1RM)", "5", "4", "72%", 180],
      ["Overhead Press", "1+2R", "6", "8RPE", 120],
    ],
    [
      ["Competition Deadlift", "1", "1", "8RPE", 180],
      ["Competition Deadlift (% of E1RM)", "4", "4", "72%", 180],
      ["2ct Pause Bench", "1+2F", "2", "9RPE", 180],
      ["High Bar Squat", "1+2F", "4", "9RPE", 180],
    ],
    [
      ["Pin Squat", "1", "1", "8RPE", 180],
      ["Pin Squat", "1+1F", "2", "9RPE", 180],
      ["Close Grip Bench", "1+2R", "3", "8RPE", 180],
      ["Feet Up Bench", "1+1F", "3", "9RPE", 180],
    ],
    [
      ["2ct Pause Deadlifts", "1", "1", "8RPE", 180],
      ["2ct Pause Deadlifts", "1+2F", "2", "9RPE", 180],
      ["Touch and Go Bench", "1+1F", "3", "9RPE", 180],
    ],
  ],
  // week 15
  [
    [
      ["Competition Squat", "1", "1", "8RPE", 180],
      ["Competition Squat (% of E1RM)", "3", "3", "76%", 180],
      ["Competition Pause Bench", "1", "1", "9RPE", 180],
      ["Competition Pause Bench (% of E1RM)", "4", "3", "76%", 180],
      ["Overhead Press", "1+1F", "5", "9RPE", 90],
    ],
    [
      ["Competition Deadlift", "1", "1", "8RPE", 180],
      ["Competition Deadlift (% of E1RM)", "3", "3", "76%", 180],
      ["2ct Pause Bench", "1+2R", "4", "8RPE", 180],
      ["High Bar Squat", "1+1R", "2", "8RPE", 180],
    ],
    [
      ["Pin Squat", "1", "1", "8RPE", 180],
      ["Pin Squat", "1+2F", "4", "8RPE", 180],
      ["Close Grip Bench", "1+1F", "4", "9RPE", 180],
      ["Feet Up Bench", "1+1F", "4", "9RPE", 180],
    ],
    [
      ["2ct Pause Deadlifts", "1", "1", "8RPE", 180],
      ["2ct Pause Deadlifts", "1+2F", "4", "9RPE", 180],
      ["Touch and Go Bench", "1+2F", "3", "9RPE", 180],
    ],
  ],
  // week 16
  [
    [
      ["Competition Squat", "1", "1", "Opener", 180],
      ["Competition Squat", "3", "2", "82%", 180],
      ["Competition Pause Bench", "1", "1", "Opener", 180],
      ["Competition Pause Bench", "3", "2", "84%", 180],
    ],
    [
      ["Competition Deadlift", "1", "1", "Opener", 180],
      ["Competition Deadlift", "2", "2", "82%", 180],
      ["Competition Pause Bench", "4", "1", "85%", 180],
    ],
    [
      ["Competition Squat", "1", "1", "85%", 180],
      ["", "2", "2", "78%", 180],
      ["Competition Pause Bench", "1", "1", "85%", 180],
      ["", "3", "2", "78%", 180],
      ["Competition Deadlift", "1", "1", "82%", 180],
      ["", "2", "2", "75%", 180],
    ],
    [
      ["Competition Squat", "2", "3", "75%", 180],
      ["Competition Pause Bench", "3", "3", "78%", 180],
      ["Competition Deadlift", "1", "3", "75%", 180],
    ],
  ],
];
