// Boris Sheiko's classic numbered programs: #29–#32 (prep → competition), #37, the Sheiko
// Beginner prep/comp cycles, and Advanced Medium Load (AML).
//
// Source: the widely shared ChaseT (2008.05.09) Sheiko spreadsheets as hosted by LiftVault
// ("Sheiko Program Spreadsheets": tabs #29, #30, #31, #32, #37; "Sheiko Beginner": tabs
// Prep_1, Comp; "Sheiko Advanced Medium Load": tabs Prep Cycle I–III, Comp Cycle). The day
// tables below were extracted from those sheets' %/reps/sets columns by script and are exact.
//
// Rules: every set is a fixed % of your competition 1RM (no AMRAPs, no auto-regulation). Each
// block is a fixed sequence of unique sessions; the program ends after the last week. Variations
// use the parent lift's 1RM: front/pause squat → squat; halting, paused, chain and deficit
// deadlifts and block pulls → deadlift; board/chain/close-grip/decline bench → bench.
// Halting/paused/chain deadlifts and board/chain presses are logged as the plain lift (with a
// note); block pulls ("deadlift from boxes") as Rack Pull. A lift done twice in a session gets
// its own slot (…-bench, …-bench2), matched to Hevy exercise blocks in order.
// Accessories (GPP) are `fixed` with the sheet's sets×reps; the sheet gives no load. Generic
// rows ("Chest muscles", "Lat muscles", "Abs"…) map to a representative lift with a note.
// Where the sheet says "100–105% × 2–3 singles" (max test) we prescribe 2 × 1 @ 100% + note.

import type { DayDef, PercentSet, ProgramDef, ProgramTemplate, SlotDef, Tier } from "../program";
import type { Unit } from "../units";

/** [lift, "reps@pct[xSets] …" for % work or "SETSxREPS" for accessories, note?] */
type Entry = [string, string, string?];
type Wk = [string, Entry[]][];

/** Whose 1RM a variation's percentages are of. */
const TM_OF: Record<string, string> = {
  frontSquat: "squat", pauseSquat: "squat",
  deficitDeadlift: "deadlift", rackPull: "deadlift",
  cgBench: "bench", declineBench: "bench",
};
const COMP = new Set(["squat", "bench", "deadlift"]);

/** "5@50 4@60x2" → one PercentSet per set. */
export function parseSets(spec: string): PercentSet[] {
  return spec.split(" ").flatMap((tok) => {
    const m = /^(\d+)@(\d+)(?:x(\d+))?$/.exec(tok);
    if (!m) throw new Error(`bad set spec ${tok}`);
    return Array.from({ length: Number(m[3] ?? 1) }, () => ({ pct: Number(m[2]) / 100, reps: Number(m[1]) }));
  });
}

function slot(id: string, [lift, spec, note]: Entry, first: boolean): SlotDef {
  if (!spec.includes("@")) {
    const [sets, reps] = spec.split("x").map(Number);
    return { id, lift, tier: "ACC", note, progression: { kind: "fixed", sets, reps } };
  }
  const tier: Tier = COMP.has(lift) && first && !note ? "MAIN" : "SUPP";
  return { id, lift, tier, note, progression: { kind: "percent", tmLift: TM_OF[lift] ?? lift, weeks: [parseSets(spec)] } };
}

interface Block { key: string; label: string; weeks: Wk[] }

/** Lay blocks end to end: one DayDef per (week, day), scheduled only in its program week. */
function layout(blocks: Block[]): { days: DayDef[]; weekNames: string[] } {
  const days: DayDef[] = [];
  const weekNames: string[] = [];
  for (const b of blocks) {
    b.weeks.forEach((wk, w) => {
      const g = weekNames.length;
      weekNames.push(`${b.label} · Week ${w + 1}`);
      wk.forEach(([dayName, entries], d) => {
        const base = `${b.key}w${w + 1}d${d + 1}`;
        const seen: Record<string, number> = {};
        const slots = entries.map((e) => {
          const n = (seen[e[0]] = (seen[e[0]] ?? 0) + 1);
          return slot(`${base}-${e[0]}${n > 1 ? n : ""}`, e, n === 1);
        });
        days.push({ id: base.toUpperCase(), name: `${b.label} W${w + 1} · ${dayName}`, weeks: [g], slots });
      });
    });
  }
  return { days, weekNames };
}

function program(templateId: string, name: string, blocks: Block[], sessionsPerWeek: number, notes: string[]): ProgramDef {
  const { days, weekNames } = layout(blocks);
  return {
    templateId, name, days, sessionsPerWeek, maxLabel: "1RM", notes,
    cycle: { weeks: weekNames.length, weekNames, finite: true },
  };
}

const NOTES = [
  "Enter your current competition 1RMs. Every set is a fixed percentage; don't grind or add AMRAPs.",
  "When a lift appears twice in a session, log it as two separate exercises in Hevy, in order.",
  "Halting/paused/chain deadlifts and board/chain presses: log as the plain lift. Block pulls: log as Rack Pull.",
  "Accessories have no prescribed load: pick a weight that's moderate for the sets×reps.",
];

const toUnit = (lb: Record<string, number>, unit: Unit) =>
  Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5]));
const defaults = (unit: Unit) => ({ trainingMaxes: toUnit({ squat: 315, bench: 225, deadlift: 385 }, unit), startWeights: {} });

// ───────────────────────── data (from the spreadsheets) ─────────────────────────

const B29: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@75x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["bench", "5@50 5@60 4@70x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60x2 3@70x2 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["inclineBench", "4x6"],
      ["dip", "5x5"],
      ["rackPull", "4@55 4@65 4@75x2 3@85x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "5@50 5@60 4@70 3@75x2 2@80x2 3@75x2 4@70 6@60 8@50"],
      ["chestFly", "5x10"],
      ["squat", "5@50 4@60x2 3@70x2 3@75x5"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["frontSquat", "3@45x2 3@55x2 2@60x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70x2 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["rackPull", "4@55 4@65 4@75x2 4@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 2@80x2 3@75 5@65 7@55"],
      ["chestFly", "5x10"],
      ["squat", "5@50 5@60x2 4@70x4"],
      ["goodMorning", "5x5"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "5@55 4@65 3@75x2 2@85x4"],
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50x2 3@60x2 3@65x4"],
      ["bench", "5@50 4@60 3@70x2 2@80x3 2@85x2 3@80x2"],
      ["chestFly", "5x10"],
      ["rackPull", "4@60 4@70x2 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 4@60 3@70x2 3@80x7"],
      ["chestFly", "5x10"],
      ["ohp", "5x4"],
      ["goodMorning", "5x5"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@55 5@65 4@75x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["frontSquat", "5@40x2 4@50x2 3@60x3"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "3@50 3@60 3@70x2 3@80x2 2@85x3 2@80x3"],
      ["bench", "5@50 5@60 5@70x4"],
      ["chestFly", "5x10"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "6@50 5@60 4@70x2 3@80x2 2@85x2 3@80x2 4@70 6@60 8@50"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
  ],
];

const B30: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@80x5"],
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["squat", "5@55 4@65 3@75x5"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 4@70 6@65 8@60 10@55 12@50"],
      ["chestFly", "6x4"],
      ["rackPull", "5@60 4@70x2 3@80x3 2@90x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60x2 3@70x2 2@80x6"],
      ["dip", "5x6"],
      ["squat", "5@50 5@60x2 4@70x4"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 2@80x2 1@90x3"],
      ["bench", "5@50 4@60 3@70x2 2@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 3@70x2 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 3@75x2 5@70x2 7@60 9@50"],
      ["chestFly", "5x10"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x5"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60x2 3@70x2 2@80x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["bench", "4@55 3@65 2@75x5"],
      ["dip", "5x8"],
      ["legPress", "5x6"],
      ["goodMorning", "5x6", "Seated"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["squat", "6@50 6@60 6@65x4"],
      ["bench", "5@55 5@65x2 4@75x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 3@70x2 3@80x3 2@85x3"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 5@70 7@65 9@60 11@55 13@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@65 5@75x2 4@85x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3 3@80x3"],
      ["bench", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x2 1@90x2"],
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x2 3@80x2"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@55 5@65 4@75x4"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
  ],
];

const B31: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x4"],
      ["squat", "5@50 5@60x2 2@70 4@70 6@70 8@70 7@70 5@70 3@70"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["squat", "5@50 5@60x2 4@65x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 4@70 6@65 8@60 10@55 12@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@60 4@70 3@80x2 2@90x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@50 4@60x2 3@70x2 2@80x6"],
      ["dip", "5x6"],
      ["squat", "5@55 5@65 4@75x4"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 2@80x2 1@90x3"],
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@55 5@65 5@75x4"],
      ["chestFly", "5x10"],
      ["legPress", "5x6"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60x2 3@65x4"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 3@75 5@65 7@55"],
      ["chestFly", "5x10"],
      ["deadlift", "3@55 3@65x2 3@75x2 2@85x4"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 2@80x2 2@85x4"],
      ["inclineBench", "6x4"],
      ["squat", "6@50 6@60 6@65x4"],
      ["tricepPushdown", "5x10", "Triceps: any triceps exercise"],
      ["backExtension", "4x10"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["squat", "5@50 5@60 5@70 8@70 3@70 6@70 2@70 7@70 4@70"],
      ["bench", "5@55 5@65 5@70x5"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 3@70x2 2@80x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "8@50 7@55 6@60 5@65 4@70 3@75x2 2@80x2 1@85x2 2@80x2 3@75 4@70 6@65 8@60 10@55 12@50"],
      ["rackPull", "4@60 4@70 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["legPress", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3 3@80x3"],
      ["bench", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 2@80x2 1@90x3 2@80x2"],
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x4"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["lunge", "5x5"],
      ["backExtension", "4x10"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 2@80x2 1@90x3 2@80x2"],
      ["deadlift", "3@50 3@60 3@70x2 2@80x2 1@90x2"],
      ["chestFly", "5x10"],
      ["legPress", "6x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@55 5@65 4@75x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 5@60 5@70x4"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
];

const B32: Wk[] = [
  [ // week 1
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x3"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["squat", "3@50 3@60x2 2@70x2 2@80 1@90 1@100x2", "Top: 2–3 singles at 100–105%"],
      ["bench", "3@50 3@60 2@70x2 2@80 1@90 1@100x2", "Top: 2–3 singles at 100–105%"],
      ["deadlift", "3@50 2@60 2@70x2 1@80 1@90 1@100x2", "Top: 2–3 singles at 100–105%"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60x2 3@70x2 2@75x4"],
      ["bench", "3@55 3@65x2 3@75x6"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "3@50 3@60x2 3@70x2 2@80x4"],
      ["bench", "3@50 3@60 3@70x2 3@80x5"],
      ["chestFly", "4x8"],
      ["squat", "3@55 3@65x2 3@75x4"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 2@60x2 2@65x2 1@70x3", "Halting deadlift: pull to the knees, lower"],
      ["bench", "3@50 3@60 3@70x2 3@80x2 2@85x3"],
      ["chestFly", "5x10"],
      ["deadlift", "3@50 3@60 3@70x2 3@80x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "3@50 3@60 3@70x2 3@80x5"],
      ["squat", "3@50 3@60x2 3@70x2 3@80x6"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@80x5"],
      ["bench", "3@50 3@60 3@70x2 2@80x3 1@85x3"],
      ["chestFly", "4x8"],
      ["hangingLegRaise", "5x4", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70x2 2@80x5"],
      ["chestFly", "4x8"],
      ["deadlift", "3@50 3@60x2 3@70x2 2@75x5"],
      ["goodMorning", "4x5"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60x2 2@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x4"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["bench", "3@50 3@60x2 2@70x2 1@75x4"],
      ["deadlift", "3@50 2@60x2 2@70x4"],
      ["hangingLegRaise", "2x8", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["squat", "3@50 3@60x2 2@70x3"],
      ["bench", "3@50 3@60x2 2@70x3"],
    ]],
  ],
];

const B37: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@75x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "5@50 5@60x2 4@70x2 3@75x4"],
      ["inclineBench", "6x4"],
      ["dip", "5x5"],
      ["rackPull", "5@50 5@60x2 4@70x2 3@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "7@50 6@55 5@60 4@65 3@70x2 2@75x2 3@70x2 4@65 6@60 8@55 10@50"],
      ["chestFly", "5x10"],
      ["squat", "5@50 4@60x2 3@70x2 3@75x5"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 2@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "3@55 3@65 3@75x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60x2 4@70x5"],
      ["chestFly", "5x10"],
      ["deadlift", "4@50 4@60 3@70x2 3@75x5"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["squat", "4@50 4@60 3@70x2 3@75x6"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 4@75 5@70 6@60 7@50"],
      ["chestFly", "5x10"],
      ["tricepPushdown", "5x10", "Triceps: any triceps exercise"],
      ["squat", "3@55 3@65 2@75x4"],
      ["goodMorning", "5x6", "Seated"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "5@50 5@60 5@70x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x2 4@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 3@75x2 4@70 5@65 6@60 7@55 8@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@60 5@70x2 4@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 2@80x5"],
      ["squat", "5@50 5@60 5@70x2 4@75x5"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@55 5@65 4@75x4"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
  ],
];

const BEG_PREP: Wk[] = [
  [ // week 1
    ["Mon", [
      ["squat", "5@50 5@60 4@70x4"],
      ["bench", "5@50 4@60 3@70 3@75x4"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["goodMorning", "5x4", "~75% effort"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["inclineBench", "5x3", "~85% effort"],
      ["cableRow", "5x8", "~65% effort"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar at knee height"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise · ~75% effort"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise · ~70% effort"],
      ["goodMorning", "5x5", "Seated · ~75% effort"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["latPulldown", "4x8", "Lats: any lat exercise · ~65% effort"],
      ["dip", "4x6", "~70% effort"],
      ["backExtension", "4x8", "~65% effort"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 6@60 6@65x4"],
      ["rackPull", "4@55 4@65 4@75x4", "Block pull, bar at knee height"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise · ~70% effort"],
    ]],
    ["Fri", [
      ["squat", "5@50 5@60 4@70x4"],
      ["cgBench", "3@50 3@60 3@70x4"],
      ["cableRow", "4x8", "~65% effort"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise · ~65% effort"],
      ["backExtension", "4x8", "~65% effort"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["dbBench", "4x6", "~70% effort"],
      ["goodMorning", "5x5", "Seated · ~75% effort"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@65x4"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3"],
      ["rackPull", "3@60 3@70 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["cableRow", "4x6", "~70% effort"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise · ~60% effort"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["declineBench", "4@50 4@60 4@70x4"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise · ~65% effort"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x2 2@85x3"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["latPulldown", "4x8", "Lats: any lat exercise · ~65% effort"],
      ["bicepCurl", "4x6", "~70% effort"],
      ["backExtension", "4x8", "~65% effort"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 3@80 2@85x4"],
      ["deadlift", "2@50 2@60 2@70x2 1@75x3", "Pause 5–7 cm below and above the knees"],
      ["chestFly", "4x8", "Chest: any chest exercise · ~65% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise · ~70% effort"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise · ~60% effort"],
    ]],
    ["Fri", [
      ["squat", "5@55 4@65 3@75x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise · ~65% effort"],
      ["goodMorning", "4x5", "~75% effort"],
    ]],
  ],
];

const BEG_COMP: Wk[] = [
  [ // week 1
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x3"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise · ~65% effort"],
    ]],
    ["Wed", [
      ["squat", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["bench", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["deadlift", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["backExtension", "3x8", "~65% effort"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@75x4"],
      ["bench", "3@55 3@65 3@75x5"],
      ["chestFly", "4x6", "Chest: any chest exercise · ~70% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise · ~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise · ~65% effort"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 3@80x5"],
      ["chestFly", "4x6", "Chest: any chest exercise · ~70% effort"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise · ~70% effort"],
      ["goodMorning", "4x5", "Seated · ~75% effort"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@65 1@70x3"],
      ["bench", "3@50 3@60 3@70 3@80 2@85x2 1@90x2"],
      ["rackPull", "3@65 3@75 2@85x2 1@95x3", "Block pull, bar at knee height"],
      ["latPulldown", "4x6", "Lats: any lat exercise · ~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise · ~65% effort"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["bench", "3@50 3@60 3@70 3@80x5"],
      ["chestFly", "4x6", "Chest: any chest exercise · ~70% effort"],
      ["bicepCurl", "4x6", "~65% effort"],
      ["goodMorning", "5x4", "~80% effort"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80 1@85x3"],
      ["cableRow", "4x6", "~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise · ~65% effort"],
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80x4"],
      ["deadlift", "3@50 3@60 3@70 2@75x5"],
      ["chestFly", "3x6", "Chest: any chest exercise · ~70% effort"],
      ["backExtension", "3x6", "~70% effort"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x4"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise · ~65% effort"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["bench", "3@50 3@60 2@70 1@75x3"],
      ["deadlift", "3@50 3@60 2@70x3"],
      ["hangingLegRaise", "2x8", "Abs: any ab exercise · ~65% effort"],
    ]],
    ["Wed", [
      ["squat", "3@50 3@60 2@65x3"],
      ["bench", "3@50 3@60 2@70x3"],
    ]],
  ],
];

const AML1: Wk[] = [
  [ // week 1
    ["Mon", [
      ["frontSquat", "4@30 4@40 4@50x3"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["squat", "3@55 3@65 2@75x4"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["deadlift", "3@55 3@65 2@75x4", "Pause 5–7 cm above the knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70 3@75x4"],
      ["pauseSquat", "3@50 3@60 3@70x4", "Pause halfway down"],
      ["bench", "3@60 3@70 3@80x2 2@85x3", "Board press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Sat", [
      ["deficitDeadlift", "3@50 2@60x4"],
      ["inclineBench", "5x3"],
      ["rackPull", "3@55 3@65 3@75x2 2@85x3", "Block pull, bar 5–7 cm below knees"],
      ["dip", "5x4", "Weighted"],
      ["legPress", "5x5", "80–90% of your squat 1RM"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 3@75 2@80x5"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["skullcrusher", "5x6", "French press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70x5", "With chains: +8–10 kg per side on top of this weight"],
      ["deadlift", "3@50 3@60 3@70 2@75x5", "Pause 5–7 cm below the knees"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["legExtension", "5x6", "1 s pause at the top of every rep"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["frontSquat", "4@30 4@40 4@50x4"],
      ["bench", "3@60 3@70 3@80 2@85x2 1@90x3", "Board press"],
      ["dip", "5x6", "Weighted"],
      ["latPulldown", "4x8", "Lats: any lat exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Sat", [
      ["cgBench", "4@50 3@60 3@65x4"],
      ["deadlift", "3@50 3@60 2@70x2 1@75x3", "With chains: +8–10 kg per side on top of this weight"],
      ["dbBench", "5x6"],
      ["legPress", "5x4"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["frontSquat", "4@40 4@50 3@55x3"],
      ["bench", "5@50 4@60 3@70 2@80x2 1@85x2 2@80x2"],
      ["pauseSquat", "3@50 3@60 3@70 2@75x4", "Pause halfway down"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["goodMorning", "4x5"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 6@70"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5–7 cm below knees"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "3@55 3@65 3@75 2@85x2 1@90x3", "Board press"],
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "4@50 4@60 4@65x4", "With chains: +8–10 kg per side on top of this weight"],
      ["latPulldown", "4x8", "Lats: any lat exercise"],
      ["goodMorning", "4x4", "Seated"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5–7 cm above the knees"],
      ["bench", "4@50 4@60 4@65x4", "Medium grip"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["frontSquat", "3@40 3@45 3@50x2 3@55x3"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3 3@80x2"],
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["dip", "5x6"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "3@60 3@70 3@80 3@85 2@90x2 1@95x2", "Board press"],
      ["rackPull", "3@60 3@70 3@80x2 2@90x2 1@95x2", "Block pull, bar 5–7 cm below knees"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["skullcrusher", "5x6", "French press"],
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x2 1@80x3", "Pause 5–7 cm below the knees"],
      ["bench", "6@50 6@60 6@65x4"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["legPress", "5x5"],
      ["reverseHyper", "4x8"],
    ]],
  ],
];

const AML2: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 5@70"],
      ["bench", "3@60 3@70 3@80x2 2@85x3", "Board press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["rackPull", "3@60 3@70 3@80x2 3@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"],
    ]],
    ["Fri", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Sat", [
      ["rackPull", "3@60 3@70 3@80x2 3@85x4", "Block pull, bar 5 cm below knees"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 2@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@55 4@65 4@75x2 3@85x2 2@90x3", "Board press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@55 4@65 3@75 2@85x4"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["squat", "3@50 3@60 3@70 2@80x3"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5–7 cm below and above the knees"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["dip", "5x5"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 6@70"],
      ["bench", "3@50 3@60 3@70 2@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "6@50 5@60 4@70 3@75 2@80x2"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x5", "With chains: +8–10 kg per side on top of this weight"],
      ["squat", "4@50 4@60 4@70x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "1 full + 1/2 rep (to knees) ×2 per set"],
      ["cgBench", "3@50 3@60 3@70x4"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@80x4", "Pause 5–7 cm above the knees"],
      ["bench", "3@55 3@65 3@75 3@85x2 2@90x2 1@95x3", "Board press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x3"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Sat", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@60 3@70 3@80 2@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["legPress", "5x5"],
    ]],
  ],
  [ // week 5
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["rackPull", "3@55 3@65 3@75 3@85x4", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "6@50 5@60 4@70 3@75 2@80x2 1@85x2 2@80 3@75 4@70 5@65 6@60 7@55 8@50"],
      ["squat", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5 cm above the knees"],
      ["dbBench", "5x6"],
      ["rackPull", "4@50 4@60 4@70 4@75x4", "Block pull with chains, bar 10–12 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
  [ // week 6
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "4@50 4@60 3@65x2"],
      ["bench", "5@50 5@60 3@70 6@70 4@70 7@70 2@70 8@70 5@70"],
      ["deadlift", "3@50 3@60 3@70 2@80x5"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x8", "Lats: any lat exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@75x5"],
      ["squat", "5@50 5@60 5@70x4"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "4@50 4@60 4@70x4"],
      ["deadlift", "3@50 3@60 3@70 3@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["dip", "5x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
];

const AML3: Wk[] = [
  [ // week 1
    ["Mon", [
      ["squat", "5@55 4@65 3@75 2@85x3"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 2@80x2 1@85x2 2@80x2"],
      ["rackPull", "3@65 3@75 3@85x2 2@90x3", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@75x4"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"],
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5 cm above the knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2–3 singles at 100–105%"],
      ["bench", "5@50 4@60 3@70 2@75x3"],
      ["chestFly", "3x5", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2–3 singles at 100–105%"],
      ["deadlift", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2–3 singles at 100–105%"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@75x5"],
      ["squat", "5@50 5@60 5@70x4"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 5@70x4"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5 cm below knees"],
      ["dip", "5x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 4@60 3@70 3@80x5"],
      ["bench", "4@60 4@70 4@80x4", "Board press"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x2 3@80 5@70 7@60 9@50"],
      ["deadlift", "4@50 4@60 4@70 3@75x4", "Alternate full and half (to knees) reps"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "5@50 5@60 3@65 7@65 4@65 8@65 2@65 6@65"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["dip", "5x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5–7 cm above the knees"],
      ["bench", "4@50 4@60 4@70x4", "With chains: +8–10 kg per side on top of this weight"],
      ["goodMorning", "5x5"],
      ["legPress", "5x6"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["bench", "3@55 3@65 3@75 3@85x2 2@90x3", "Board press"],
      ["squat", "5@50 4@60 3@70 3@80x2 2@85x2 3@80x2"],
      ["declineBench", "4@50 4@60 4@70x5"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@80x4", "Pause 5–7 cm below the knees"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3 3@80x2"],
      ["rackPull", "3@65 3@75 3@85x2 2@95x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Fri", [
      ["bench", "3@50 3@60 3@70 3@75x4", "With chains: +8–10 kg per side on top of this weight"],
      ["squat", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["bench", "4@50 4@60 4@70 4@75x4", "Board press"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"],
    ]],
    ["Sat", [
      ["deadlift", "4@50 4@60 3@70 2@80x4", "Alternate full and half (to knees) reps"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"],
    ]],
  ],
  [ // week 5
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 3@65 2@70x4"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["rackPull", "3@70 3@80 2@90x2 1@95x3", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x5"],
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "6@50 6@60 6@70x5"],
      ["squat", "3@55 3@65 3@75x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["cgBench", "4@50 4@60 4@70x4"],
      ["rackPull", "3@55 3@65 3@75 3@85x4", "Block pull, bar 5 cm below knees"],
      ["dip", "5x5"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
    ]],
  ],
];

const AML4: Wk[] = [
  [ // week 1
    ["Mon", [
      ["bench", "5@55 4@65 3@75 2@85x3"],
      ["squat", "5@50 4@60 3@70 3@80x4"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x2"],
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["rackPull", "3@60 3@70 2@80x2 1@90x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["bench", "3@50 3@60 3@70 2@80x2 2@85x3 2@80x2"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x5"],
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar 5 cm below knees"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 2
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x3"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "3x8"],
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80 1@90 1@95 1@100", "Top: 1–2 singles at 100%"],
      ["deadlift", "3@50 3@60 2@70 2@80 1@90 1@95 1@100", "Top: 1–2 singles at 100%"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80 1@90 1@95 1@100", "Top: 1–2 singles at 100%"],
      ["bench", "3@50 3@60 3@70 2@75x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "4x4"],
    ]],
    ["Sat", [
      ["dbBench", "5x5"],
      ["deadlift", "3@50 3@60 3@70 2@75x3", "Halting deadlift: pull to the knees, lower"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["dip", "4x4"],
    ]],
  ],
  [ // week 3
    ["Mon", [
      ["squat", "3@55 3@65 2@75x2 1@85x4"],
      ["bench", "3@50 3@60 3@70 3@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"],
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x3", "Halting deadlift: pull to the knees, lower"],
      ["bench", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["deadlift", "3@50 3@60 3@70 2@80x4"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x5"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x4"],
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["reverseHyper", "4x8"],
    ]],
  ],
  [ // week 4
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "4x4"],
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80x2"],
      ["deadlift", "2@50 2@60 2@70x3"],
      ["latPulldown", "3x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 2@70x2 1@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x3"],
      ["backExtension", "3x6"],
    ]],
  ],
  [ // week 5
    ["Mon", [
      ["bench", "3@50 3@60 2@70x2 1@75x3"],
      ["deadlift", "3@50 3@60 2@70x3"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"],
    ]],
    ["Wed", [
      ["squat", "3@50 2@60 1@70x3"],
      ["bench", "3@50 3@60 2@70x3"],
    ]],
  ],
];

// ───────────────────────── templates ─────────────────────────

const BLOCKS_29_32: Record<string, Block> = {
  "29": { key: "s29", label: "#29", weeks: B29 },
  "30": { key: "s30", label: "#30", weeks: B30 },
  "31": { key: "s31", label: "#31", weeks: B31 },
  "32": { key: "s32", label: "#32", weeks: B32 },
};
const RUNS: Record<string, string[]> = { all: ["29", "30", "31", "32"], "30-32": ["30", "31", "32"], "29": ["29"], "30": ["30"], "31": ["31"], "32": ["32"] };

export const sheiko2932: ProgramTemplate = {
  id: "sheiko-29-32",
  name: "Sheiko #29–#32",
  author: "Boris Sheiko",
  source: "Sheiko Program Spreadsheets (ChaseT 2008, LiftVault): tabs #29, #30, #31, #32",
  summary: "Four 4-week blocks run back to back: #29 and #30 preparatory, #31 and #32 competition, peaking with a max test in #32. Bench three times a week, squat twice, deadlift once, all at fixed percentages of your 1RM.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 16,
  options: [
    { key: "run", label: "Blocks", default: "all", choices: [
      { value: "all", label: "#29 → #32 (16 weeks)" },
      { value: "30-32", label: "#30 → #32 (12 weeks)" },
      { value: "29", label: "#29 only (preparatory)" },
      { value: "30", label: "#30 only (preparatory)" },
      { value: "31", label: "#31 only (competition)" },
      { value: "32", label: "#32 only (competition / peak)" },
    ] },
  ],
  build(o) {
    const run = RUNS[o.run ?? "all"] ?? RUNS.all;
    const name = run.length > 1 ? `Sheiko #${run[0]}–#${run[run.length - 1]}` : `Sheiko #${run[0]}`;
    return program("sheiko-29-32", name, run.map((k) => BLOCKS_29_32[k]), 3, [
      ...NOTES,
      "#32 week 1 Wednesday is a max test: work up to 2–3 singles at 100–105%. The last week ends in competition (days 5–7).",
    ]);
  },
  defaults,
};

export const sheiko37: ProgramTemplate = {
  id: "sheiko-37",
  name: "Sheiko #37",
  author: "Boris Sheiko",
  source: "Sheiko Program Spreadsheets (ChaseT 2008, LiftVault): tab #37",
  summary: "A 4-week Sheiko preparatory block at medium volume: bench three times a week, squat twice, deadlift once, with block pulls and halting deadlifts.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 4,
  options: [],
  build: () => program("sheiko-37", "Sheiko #37", [{ key: "s37", label: "#37", weeks: B37 }], 3, NOTES),
  defaults,
};

export const sheikoBeginner: ProgramTemplate = {
  id: "sheiko-beginner",
  name: "Sheiko Beginner",
  author: "Boris Sheiko",
  source: "Sheiko Beginner Program (ChaseT 2008, LiftVault): tabs Prep_1, Comp",
  summary: "Sheiko's 3-day beginner template: run the 4-week prep cycle one or more times, then the 4-week competition cycle with a max test in its first week.",
  category: "powerlifting",
  level: "beginner",
  daysPerWeek: [3],
  weeks: 8,
  options: [
    { key: "prep", label: "Prep cycles", default: "1", choices: [
      { value: "1", label: "1 (4 weeks)" }, { value: "2", label: "2 (8 weeks)" }, { value: "3", label: "3 (12 weeks)" },
    ] },
    { key: "comp", label: "Competition cycle", default: "on", choices: [
      { value: "on", label: "Finish with the 4-week comp cycle" }, { value: "off", label: "Prep only, then retest" },
    ] },
  ],
  build(o) {
    const n = Math.min(3, Math.max(1, Number(o.prep ?? 1) || 1));
    const blocks: Block[] = Array.from({ length: n }, (_, i) => ({ key: `bp${i + 1}`, label: n > 1 ? `Prep ${i + 1}` : "Prep", weeks: BEG_PREP }));
    if ((o.comp ?? "on") === "on") blocks.push({ key: "bc", label: "Comp", weeks: BEG_COMP });
    return program("sheiko-beginner", "Sheiko Beginner", blocks, 3, [
      ...NOTES,
      "Accessory \"~65% effort\" is the sheet's intensity for that exercise, not a % of a competition lift.",
      "Comp week 1 Wednesday is a max test (singles up to 105%). If you hit a PR, update your 1RM unless the meet is under 30 days away.",
    ]);
  },
  defaults,
};

export const sheikoAml: ProgramTemplate = {
  id: "sheiko-aml",
  name: "Sheiko Advanced Medium Load",
  author: "Boris Sheiko",
  source: "Sheiko Advanced Medium Load (ChaseT 2008, LiftVault): tabs Prep Cycle I, II, III, Comp Cycle",
  summary: "Sheiko's 4-day plan for Class 1 and above: three preparatory cycles (4, 6 and 5 weeks) and a 5-week competition cycle, with board and chain presses, paused and block deadlifts, and max tests along the way.",
  category: "powerlifting",
  level: "advanced",
  daysPerWeek: [4],
  weeks: 20,
  options: [],
  build: () => program("sheiko-aml", "Sheiko AML", [
    { key: "a1", label: "Prep I", weeks: AML1 },
    { key: "a2", label: "Prep II", weeks: AML2 },
    { key: "a3", label: "Prep III", weeks: AML3 },
    { key: "a4", label: "Comp", weeks: AML4 },
  ], 4, [
    ...NOTES,
    "Chains: add 8–10 kg of chain per side on top of the listed bar weight.",
    "Prep III week 2 and Comp week 2 include max-test singles (100–105% / 100%).",
    "The last week ends in competition.",
  ]),
  defaults,
};

export const SHEIKO_TEMPLATES = [sheiko2932, sheiko37, sheikoBeginner, sheikoAml];
