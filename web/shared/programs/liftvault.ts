// Free programs whose numbers come from LiftVault's public Google Sheets (liftvault.com). Each
// sheet was exported with `export?format=xlsx` and read cell by cell, formulas included, so the
// percentages, set counts and weekly jumps below are the sheet's own. Per-program notes say
// where something had to be approximated.
//
// Smolov (full, 14 weeks)            "Smolov Squat Program Spreadsheet | LiftVault.com"
//   Intro (2 wk) → Base (3 wk + 1RM test) → Switching (2 wk) → Intense (4 wk + taper + test).
//   Base adds +20 lb / +10 kg in week 2 and +30 lb / +15 kg in week 3 over week 1 (sheet
//   formulas: week 2 = week 1 + 10 + 10 lb, week 3 = week 2 + 5 + 5 lb). The base test resets the
//   squat max (e1rm rule on the test single), so Switching and Intense run off the new 1RM
//   exactly like the sheet's "New Squat 1RM" input. Switching: squat negative at 1RM +10 / +20 lb,
//   power clean 8×3 @60% of its 1RM, box squat 12×2 @70/75% of its 1RM. The sheet doesn't say
//   how the switching work is split over the week; here it's one session per week. Intro week 2
//   is listed once (2×2, 1×3, 1×5 @85%); LiftVault's page says the week has three sessions, so
//   it is repeated three times.
// Magnusson–Ortmayer deadlift (12 weeks, 1×/week)   "Mag/Ort Deadlift Program | LiftVault.com"
//   4×4 @70, doubles @80/90, 1×8+ @70; +10 lb / +5 kg jumps on the schedule in the sheet; weeks 4
//   and 8 are rest weeks (skipped), week 12 is an optional max test. The page's "miss the 8 reps
//   → repeat the week" rule isn't expressible (no repeat-week), so the schedule is followed.
// GZCL UHF+ 5 week   "GZCL UHF+ (5 weeks) | LiftVault.com"
// GZCL UHF 9 week (+ optional 3-week taper)   "GZCL Free Compendium November 27th Update" (UHF 9 Wk tab),
//   linked from LiftVault's GZCL template page. Both are transcribed from the sheets' training
//   schedule (T1/T2 % of training max, "N+" = last set a rep-out). T3 work has no load: the set
//   count per week is the sheet's and the rep target follows its T3 table (5 sets 12–15, 4 sets
//   10–12, 3 sets 8–10, 2 sets 6–8, 1 set 10).
// GZCL General Gainz Wave LP (16 weeks)   "GG Wave LP Spreadsheet v1.2 | LiftVault.com" (/u/cyte85)
//   T1 at 80% of 1RM, T2 at 70%, both + one weekly increment; each 4-week wave restarts one
//   increment above the last wave's start. T1 = rep max then that many singles (6/5/4/3), T2 =
//   rep max then half-sets. The sheet floors to 2.5; the engine rounds to the nearest 2.5.
//   This is a community version; Cody's own General Gainz is a rep-max framework without fixed
//   loads, which the engine can't express.
// Candito 6 Week Advanced Bench   "Candito 6 Week Advanced Bench Press Program Spreadsheet | LiftVault.com"
// Candito 9 Week Advanced Squat   "Candito 9 Week Squat Program" (LiftVault sheet)
//   Weeks 1–3 run off the current 1RM, later weeks off the "desired / goal max". The engine has
//   one max per lift, so the goal is an option (goal = 1RM × (1 + g)) and late-week % are scaled
//   by it. Checkpoints that rewrite the max (squat) are left as notes.
// Greg Nuckols High Frequency   "Greg Nuckols High Frequency Template (Exact)" and
//   "Greg Nuckols Frequency Program (1x Weekly Deadlift + OHP)", LiftVault sheets. 3-week waves;
//   week 3's 85% day is an AMAP: 6–7 reps +5 lb, 8–9 +10 lb, 10+ +15 lb. Rows / pulldowns are %
//   of a 6RM, and each extra set of 6 in week 3 adds 2% to it.
// German Volume Training   "German Volume Training Spreadsheet | LiftVault.com"
// Arnold Split (Basic Training #1)   "The Arnold Split Basic Training #1" (LiftVault Arnold split page)
// Alex Bromley's Simplest Beginner Program   "SIMPLEST Beginner Program (Alex Bromley) | LiftVault.com"

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, TmRule, Weights } from "../program";
import type { Unit } from "../units";

// ───────────────────────── helpers ─────────────────────────

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const toUnit = (lb: number, unit: Unit) => (unit === "lb" ? lb : kg(lb));
const inUnit = (lb: Record<string, number>, unit: Unit) => Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, toUnit(v, unit)]));
const w8 = (lb: number, kgv: number): Weights => ({ lb, kg: kgv });
/** n sets of `reps` at `pct` (omit pct for RPE / pick-a-weight sets). */
const S = (n: number, reps: number, pct?: number, extra: Partial<PercentSet> = {}): PercentSet[] =>
  Array.from({ length: n }, () => ({ ...(pct != null ? { pct } : {}), reps, ...extra }));
/** Same, with the last set as many reps as possible. */
const SA = (n: number, reps: number, pct?: number, extra: Partial<PercentSet> = {}): PercentSet[] =>
  S(n, reps, pct, extra).map((x, i) => (i === n - 1 ? { ...x, amrap: true } : x));
const plus = (sets: PercentSet[], add?: Weights) => (add ? sets.map((x) => ({ ...x, add })) : sets);
const scale = (sets: PercentSet[], g: number) => sets.map((x) => (x.pct != null ? { ...x, pct: x.pct * g } : x));

function pctSlot(id: string, lift: string, tier: Tier, tmLift: string, weeks: PercentSet[][], o: { note?: string; rest?: number; tmRule?: TmRule } = {}): SlotDef {
  return { id, lift, tier, progression: { kind: "percent", tmLift, weeks, ...(o.tmRule ? { tmRule: o.tmRule } : {}) }, note: o.note, restSeconds: o.rest };
}
function fixedSlot(id: string, lift: string, tier: Tier, sets: number, reps: number, o: { repsMax?: number; note?: string; amrapLast?: boolean; rest?: number } = {}): SlotDef {
  return { id, lift, tier, progression: { kind: "fixed", sets, reps, repsMax: o.repsMax, amrapLast: o.amrapLast, note: o.note }, restSeconds: o.rest };
}
function doubleSlot(id: string, lift: string, tier: Tier, sets: number, reps: [number, number], inc: Weights, note?: string, amrapLast?: boolean): SlotDef {
  return { id, lift, tier, progression: { kind: "double", sets, reps, increment: inc, amrapLast }, note };
}
/** A work-up-to-a-max single; the lift's max becomes what you hit (Epley e1RM of the best set). */
function testSlot(id: string, lift: string, note = "Work up to a new 1RM. Your max updates to what you hit."): SlotDef {
  return pctSlot(id, lift, "MAIN", lift, [[{ rpe: 10, reps: 1 }]], { note, rest: 300, tmRule: { type: "e1rm", setIndex: 0, pct: 1 } });
}

interface DaySpec { name: string; slots: (p: string) => SlotDef[] }
/** One DayDef per (week, day), scheduled only in that week. Slot ids are prefixed "w3d2". */
function blockDays(weeks: DaySpec[][]): DayDef[] {
  return weeks.flatMap((days, w) => days.map((d, i) => ({ id: `W${w + 1}D${i + 1}`, name: d.name, weeks: [w], slots: d.slots(`w${w + 1}d${i + 1}`) })));
}

const goalOption = (def: string) => ({
  key: "goal", label: "Goal max", default: def, choices: [
    { value: "0.02", label: "+2% over current 1RM" },
    { value: "0.03", label: "+3%" },
    { value: "0.04", label: "+4%" },
    { value: "0.05", label: "+5%" },
  ],
});

// ───────────────────────── Smolov ─────────────────────────

const SMOLOV_BASE: [string, number, number, number][] = [["Mon", 4, 9, 0.7], ["Wed", 5, 7, 0.75], ["Fri", 7, 5, 0.8], ["Sat", 10, 3, 0.85]];
/** Base weeks 1–3: absolute load on top of the week-1 %. */
export const SMOLOV_BASE_ADD: (Weights | undefined)[] = [undefined, w8(20, 10), w8(30, 15)];
/** Intense mesocycle weeks 1–4, Mon / Wed / Sat, % of the new 1RM. */
const SMOLOV_INTENSE: PercentSet[][][] = [
  [
    [...S(1, 3, 0.65), ...S(1, 4, 0.75), ...S(3, 4, 0.85), ...S(1, 5, 0.85)],
    [...S(1, 3, 0.6), ...S(1, 3, 0.7), ...S(1, 4, 0.8), ...S(1, 3, 0.9), ...S(2, 5, 0.85)],
    [...S(1, 4, 0.65), ...S(1, 4, 0.7), ...S(5, 4, 0.8)],
  ],
  [
    [...S(1, 4, 0.6), ...S(1, 4, 0.7), ...S(1, 4, 0.8), ...S(1, 3, 0.9), ...S(2, 4, 0.9)],
    [...S(1, 3, 0.65), ...S(1, 3, 0.75), ...S(1, 3, 0.85), ...S(3, 3, 0.9), ...S(1, 3, 0.95)],
    [...S(1, 3, 0.65), ...S(1, 3, 0.75), ...S(1, 4, 0.85), ...S(4, 5, 0.9)],
  ],
  [
    [...S(1, 3, 0.6), ...S(1, 3, 0.7), ...S(1, 3, 0.8), ...S(5, 5, 0.9)],
    [...S(1, 3, 0.6), ...S(1, 3, 0.7), ...S(1, 3, 0.8), ...S(2, 3, 0.95)],
    [...S(1, 3, 0.65), ...S(1, 3, 0.75), ...S(1, 3, 0.85), ...S(4, 3, 0.95)],
  ],
  [
    [...S(1, 3, 0.7), ...S(1, 4, 0.8), ...S(5, 5, 0.9)],
    [...S(1, 3, 0.7), ...S(1, 3, 0.8), ...S(4, 3, 0.95)],
    [...S(1, 3, 0.75), ...S(1, 4, 0.9), ...S(3, 4, 0.95)],
  ],
];

const sq = (sets: PercentSet[], note?: string) => (p: string) => [pctSlot(`${p}-sq`, "squat", "MAIN", "squat", [sets], { note, rest: 300 })];

export const smolov: ProgramTemplate = {
  id: "smolov",
  name: "Smolov",
  author: "Sergey Smolov",
  source: "smolovjr.com: Smolov Squat Routine (intro, base, intense, taper) · LiftVault Smolov sheet (base +lb jumps, switching block)",
  summary: "The full 13-week Russian squat cycle: intro, a four-day-a-week base block, a switching block, then an intense peaking block ending in a max test.",
  category: "peaking",
  level: "advanced",
  daysPerWeek: [3, 4],
  weeks: 13,
  options: [],
  build() {
    const intro1 = [...S(3, 8, 0.65), ...S(1, 5, 0.7), ...S(2, 2, 0.75), ...S(1, 1, 0.8)];
    const intro3 = [...S(4, 5, 0.7), ...S(1, 3, 0.75), ...S(2, 2, 0.8), ...S(1, 1, 0.9)];
    // smolovjr.com (and Liftosaur): week 2 is three days of 1×5 at 80, 82.5 and 85%; LiftVault's
    // sheet lists a single combined day.
    const intro2 = [0.8, 0.825, 0.85].map((p) => S(1, 5, p));
    const test = (name: string): DaySpec[] => [{ name, slots: (p) => [testSlot(`${p}-test`, "squat")] }];
    const weeks: DaySpec[][] = [
      [{ name: "Intro · Day 1", slots: sq(intro1) }, { name: "Intro · Day 2", slots: sq(intro1) }, { name: "Intro · Day 3", slots: sq(intro3) }],
      intro2.map((sets, d) => ({ name: `Intro wk 2 · Day ${d + 1}`, slots: sq(sets) })),
      ...SMOLOV_BASE_ADD.map((add, w) => SMOLOV_BASE.map(([day, n, r, pct]) => ({
        name: `Base wk ${w + 1} · ${day} ${n}×${r}`,
        slots: sq(plus(S(n, r, pct), add), add ? `${Math.round(pct * 100)}% + ${add.lb} lb / ${add.kg} kg` : undefined),
      }))),
      test("Base · 1RM test"),
      ...[0, 1].map((w): DaySpec[] => [{
        name: `Switching wk ${w + 1}`,
        slots: (p) => [
          pctSlot(`${p}-neg`, "squat", "MAIN", "squat", [plus(S(1, 1, 1), w ? w8(20, 10) : w8(10, 5))], { note: "Squat negative: eccentric only, with spotters / safeties", rest: 300 }),
          pctSlot(`${p}-pc`, "powerClean", "SUPP", "powerClean", [S(8, 3, 0.6)], { note: "Explosive" }),
          pctSlot(`${p}-box`, "boxSquat", "SUPP", "boxSquat", [S(12, 2, w ? 0.75 : 0.7)], { note: "Speed: explode off the box" }),
        ],
      }]),
      ...SMOLOV_INTENSE.map((days, w) => days.map((sets, d) => ({ name: `Intense wk ${w + 1} · ${["Mon", "Wed", "Sat"][d]}`, slots: sq(sets) }))),
      // smolovjr.com week 13: two taper days, then the test
      [
        { name: "Taper · Day 1", slots: sq([...S(1, 3, 0.7), ...S(1, 3, 0.8), ...S(2, 5, 0.9), ...S(3, 4, 0.95)]) },
        { name: "Taper · Day 2", slots: sq([...S(1, 4, 0.75), ...S(4, 4, 0.85)]) },
        ...test("Final 1RM test"),
      ],
    ];
    return {
      templateId: "smolov",
      name: "Smolov",
      sessionsPerWeek: 4,
      days: blockDays(weeks),
      cycle: {
        weeks: weeks.length, finite: true,
        weekNames: ["Intro 1", "Intro 2", "Base 1", "Base 2 (+20 lb)", "Base 3 (+30 lb)", "Base test", "Switching 1", "Switching 2", "Intense 1", "Intense 2", "Intense 3", "Intense 4", "Taper + test"],
      },
      maxLabel: "1RM",
      notes: [
        "Enter a true squat 1RM (and power clean / box squat 1RMs for the switching block).",
        "Base: Mon / Wed / Fri / Sat. Stop short of failure: a set within ~3 reps of failure was too heavy.",
        "Intro week 1 also has accessory days: lunges, Bulgarian split squats, lunges, 3×8 each.",
        "The base 1RM test updates your squat max; switching and the intense block use the new number.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 315, powerClean: 185, boxSquat: 275 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Magnusson–Ortmayer ─────────────────────────

/** Weekly load added on top of the % (lb, kg), by program week; null = rest week. */
export const MAGORT_ADD: ([number, number] | null)[] = [[0, 0], [0, 0], [10, 5], null, [10, 5], [20, 10], [30, 15], null, [30, 15], [40, 20], [50, 25]];

export const magOrt: ProgramTemplate = {
  id: "magnusson-ortmayer",
  name: "Magnusson–Ortmayer Deadlift",
  author: "Magnusson / Ortmayer",
  source: "LiftVault: Mag/Ort Deadlift Program spreadsheet (corrected 10 lb version)",
  summary: "One heavy deadlift session a week: 4×4, heavy doubles and a 70% rep-out, with the load climbing about 10 lb a week over 11–12 weeks.",
  category: "peaking",
  level: "intermediate",
  daysPerWeek: [1],
  weeks: 12,
  options: [],
  build() {
    const weeks: PercentSet[][] = MAGORT_ADD.map((a, w) => {
      if (!a) return [];
      const add = a[0] ? w8(a[0], a[1]) : undefined;
      const doubles = w === 0 ? S(2, 2, 0.8) : [...S(1, 2, 0.8), ...S(1, 2, 0.9)];
      return plus([...S(4, 4, 0.7), ...doubles, ...SA(1, 8, 0.7)], add);
    });
    const train = MAGORT_ADD.flatMap((a, w) => (a ? [w] : []));
    return {
      templateId: "magnusson-ortmayer",
      name: "Mag/Ort Deadlift",
      sessionsPerWeek: 1,
      days: [
        { id: "DL", name: "Deadlift", weeks: train, slots: [pctSlot("magort-dl", "deadlift", "MAIN", "deadlift", weeks, { rest: 240 })] },
        { id: "TEST", name: "Week 12 · max test (optional)", weeks: [11], slots: [testSlot("magort-test", "deadlift")] },
      ],
      cycle: {
        weeks: 12, finite: true,
        weekNames: ["Week 1", "Week 2", "Week 3 (+10 lb)", "Rest", "Week 5 (+10 lb)", "Week 6 (+20 lb)", "Week 7 (+30 lb)", "Rest", "Week 9 (+30 lb)", "Week 10 (+40 lb)", "Week 11 (+50 lb)", "Test"],
      },
      maxLabel: "1RM",
      notes: [
        "Deadlift only, once a week. Weeks 4 and 8 are full rest weeks (the program skips them).",
        "The last set is 8+ reps at 70%. If you miss 8, the original rule is to repeat the week: log it and keep the same max.",
        "Week 12: rest or test a new max.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ deadlift: 405 }, unit), startWeights: {} };
  },
};

// ───────────────────────── GZCL UHF ─────────────────────────

/** [sets, pct of TM, reps, last set is a rep-out (0/1)] */
type USet = [number, number, number, number];
/** [tier, lift, TM lift (null for T3), sets, note] */
type URow = [number, string, string | null, USet[], string?];

/** T3 rep targets by set count, from the sheet's "Third Tier Progression Guidelines". */
export const UHF_T3: Record<number, [number, number]> = { 5: [12, 15], 4: [10, 12], 3: [8, 10], 2: [6, 8], 1: [10, 10] };
const DAY_NAME: Record<string, string> = {
  squat: "Squat", bench: "Bench", deadlift: "Deadlift", deficitDeadlift: "Deficit deadlift", slingshotBench: "Slingshot bench",
  frontSquat: "Front squat", safetyBarSquat: "SSB squat",
};

function uhfDays(data: URow[][][]): DayDef[] {
  return blockDays(data.map((days) => days.map((rows, d) => {
    const tm = rows.find((r) => r[2])?.[2] ?? "squat";
    return {
      name: `Day ${d + 1} · ${DAY_NAME[rows[0][1]] ?? rows[0][1]}`,
      slots: (p: string) => {
        let t3 = 0;
        return rows.map(([tier, lift, tmLift, sets, note]): SlotDef => {
          if (tier === 3) {
            const n = sets[0][0];
            const [lo, hi] = UHF_T3[n] ?? [10, 12];
            return pctSlot(`${p}-t3${"abcd"[t3++]}`, lift, "T3", tm, [S(n, lo, undefined, hi > lo ? { repsMax: hi } : {})], {
              note: [note, `rep out: heaviest ${lo}${hi > lo ? `–${hi}` : ""}, 1–2 reps in reserve`].filter(Boolean).join(" · "), rest: 75,
            });
          }
          const ps = sets.flatMap(([n, pct, reps, amrap]) => (amrap ? SA : S)(n, reps, pct));
          return pctSlot(`${p}-t${tier}`, lift, tier === 1 ? "T1" : "T2", tmLift!, [ps], { note: note || undefined, rest: tier === 1 ? 240 : 150 });
        });
      },
    };
  })));
}

const UHF_NOTES = [
  "Training max = an estimated daily 2RM at the start of the block.",
  "+ means the last set is a rep-out: stop 1–2 reps short of failure (2–3 if run down).",
  "Rest: T1 3–5 min, T2 2–3 min, T3 60–90 s.",
];

export const gzclUhf5: ProgramTemplate = {
  id: "gzcl-uhf-5wk",
  name: "GZCL UHF+ (5 Week)",
  author: "Cody Lefever (GZCL)",
  source: "LiftVault: GZCL UHF Method + Heavy Singles (Sept 2018) spreadsheet, UHF+ tab",
  summary: "Ultra high frequency GZCL: five days a week, a heavy T1 single plus rep-out back-offs, T2 volume and three T3 pump lifts a day.",
  category: "gzcl",
  level: "advanced",
  daysPerWeek: [5],
  weeks: 5,
  options: [],
  build() {
    return {
      templateId: "gzcl-uhf-5wk",
      name: "GZCL UHF+ 5 Week",
      sessionsPerWeek: 5,
      days: uhfDays(UHF5),
      cycle: { weeks: 5, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5 (deload / test)"] },
      maxLabel: "Training max (2RM)",
      notes: [...UHF_NOTES, "The heavy single sits inside the TM: no AMRAP on it. Week 5 drops volume: one rep-out set capped at ~8 reps (\"target practice\").", "Week 6 (not scheduled): set the new TM, then start again."],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 405, bench: 245, deadlift: 455, ohp: 145, inclineBench: 205, frontSquat: 315 }, unit), startWeights: {} };
  },
};

export const gzclUhf9: ProgramTemplate = {
  id: "gzcl-uhf-9wk",
  name: "GZCL UHF (9 Week)",
  author: "Cody Lefever (GZCL)",
  source: "GZCL Free Compendium November 27th Update (UHF 9 Wk tab), linked from LiftVault's GZCL template spreadsheets page",
  summary: "Nine weeks of five-day-a-week GZCL: T1 waves of 3s, 2s and heavy singles over a 2RM training max, T2 variations and descending T3 volume, with an optional three-week taper.",
  category: "gzcl",
  level: "advanced",
  daysPerWeek: [5],
  weeks: 9,
  options: [{ key: "taper", label: "Taper", default: "off", choices: [{ value: "off", label: "9 weeks" }, { value: "on", label: "+ taper (weeks 10–11; week 12 openers / meet)" }] }],
  build(o) {
    const taper = o.taper === "on";
    const data = taper ? UHF9 : UHF9.slice(0, 9);
    return {
      templateId: "gzcl-uhf-9wk",
      name: `GZCL UHF 9 Week${taper ? " + taper" : ""}`,
      sessionsPerWeek: 5,
      days: uhfDays(data),
      cycle: { weeks: data.length, finite: true, weekNames: data.map((_, w) => (w < 9 ? `Week ${w + 1}` : `Taper ${w - 8}`)) },
      maxLabel: "Training max (2RM)",
      notes: [...UHF_NOTES, "Week 9 is a deload for T2 (except block pulls) with a heavy T1 single to max reps.", ...(taper ? ["Taper weeks 10–11 go above the TM; week 12 is meet / test openers."] : [])],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 405, bench: 245, deadlift: 455, inclineBench: 205 }, unit), startWeights: {} };
  },
};

// ───────────────────────── GZCL General Gainz Wave LP ─────────────────────────

// The sheet's text: "Add 5kg/10lb a week, 2.5kg/5lb for OHP".
const ggInc = (lift: string) => (lift === "ohp" ? w8(5, 2.5) : w8(10, 5));
const ggAdd = (lift: string, k: number) => (k ? w8(ggInc(lift).lb * k, ggInc(lift).kg * k) : undefined);
/** T2 "rep max + half-sets" per wave. */
const GG_T2: [number, [number, number][]][] = [[10, [[4, 5]]], [8, [[4, 4]]], [7, [[2, 4], [2, 3]]], [6, [[4, 3]]]];
/** Week w (0–15) → wave and number of increments over the starting load. */
export const ggWeek = (w: number) => ({ wave: Math.floor(w / 4), k: Math.floor(w / 4) + (w % 4) });

function ggT1(lift: string): PercentSet[][] {
  return Array.from({ length: 16 }, (_, w) => {
    const { wave, k } = ggWeek(w);
    const r = 6 - wave;
    return plus([...SA(1, r, 0.8), ...S(r, 1, 0.8)], ggAdd(lift, k));
  });
}
function ggT2(lift: string): PercentSet[][] {
  return Array.from({ length: 16 }, (_, w) => {
    const { wave, k } = ggWeek(w);
    const [rm, half] = GG_T2[wave];
    return plus([...SA(1, rm, 0.7), ...half.flatMap(([n, r]) => S(n, r, 0.7))], ggAdd(lift, k));
  });
}

export const gzclGgWave: ProgramTemplate = {
  id: "gzcl-gg-wave",
  name: "GZCL General Gainz Wave LP",
  author: "/u/cyte85 (after Cody Lefever's General Gainz)",
  source: "LiftVault: GG Wave LP Spreadsheet v1.2 (/u/K-S-R), linked from LiftVault's GZCL template page",
  summary: "General Gainz made concrete: four 4-week waves, a T1 rep max plus singles and a T2 rep max plus half-sets, with loads climbing every week.",
  category: "gzcl",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 16,
  options: [],
  build() {
    const t3 = (id: string, lift: string, reps: number) => fixedSlot(id, lift, "T3", 3, reps, { amrapLast: true, note: `${reps}+ rep max, then 2 more max-rep sets · 30–60 s rest`, rest: 60 });
    const day = (id: string, name: string, t1: string, t2: string, acc: [string, number][]): DayDef => ({
      id, name,
      slots: [
        pctSlot(`gg-${id}-t1`, t1, "T1", t1, ggT1(t1), { note: "Rep max, then that many singles (1 min rest)", rest: 240 }),
        pctSlot(`gg-${id}-t2`, t2, "T2", t2, ggT2(t2), { note: "Rep max, then half-sets", rest: 120 }),
        ...acc.map(([l, r], i) => t3(`gg-${id}-t3${i}`, l, r)),
      ],
    });
    const upperAcc: [string, number][] = [["row", 10], ["chestFly", 15], ["tricepPushdown", 15], ["facePull", 15]];
    const lowerAcc: [string, number][] = [["legPress", 10], ["lateralRaise", 15], ["legCurl", 15], ["bicepCurl", 15]];
    return {
      templateId: "gzcl-gg-wave",
      name: "GG Wave LP",
      sessionsPerWeek: 4,
      days: [
        day("bench", "Day 1 · Bench", "bench", "squat", upperAcc),
        day("dl", "Day 2 · Deadlift", "deadlift", "ohp", lowerAcc),
        day("squat", "Day 3 · Squat", "squat", "bench", upperAcc),
        day("ohp", "Day 4 · OHP", "ohp", "deadlift", lowerAcc),
      ],
      cycle: { weeks: 16, finite: true, weekNames: Array.from({ length: 16 }, (_, w) => `Wave ${Math.floor(w / 4) + 1} · week ${(w % 4) + 1}`) },
      maxLabel: "1RM",
      microplates: true,
      notes: [
        "T1 = 80% of 1RM, T2 = 70%, + one increment a week (10 lb / 5 kg, OHP 5 lb / 2.5 kg). Each wave starts one increment above the last.",
        "T1: hit the rep max (6, 5, 4, 3 by wave), rest 3–5 min, then that many singles. T2: rep max, then half-sets totalling about twice it.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 315, bench: 225, deadlift: 405, ohp: 135 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Candito Advanced Bench ─────────────────────────

const rpe = (n: number, reps: number, r: number, extra: Partial<PercentSet> = {}) => S(n, reps, undefined, { rpe: r, ...extra });

export const canditoAdvBench: ProgramTemplate = {
  id: "candito-adv-bench",
  name: "Candito 6 Week Advanced Bench",
  author: "Jonnie Candito",
  source: "LiftVault: Candito 6 Week Advanced Bench Press Program Spreadsheet (loads from its formulas)",
  summary: "Bench specialization: three weeks benching five days a week off your current max, then three weeks of high-volume, peak and max-out work off a goal max.",
  category: "peaking",
  level: "advanced",
  daysPerWeek: [5, 2],
  weeks: 6,
  options: [
    goalOption("0.05"),
    { key: "acc1", label: "Horizontal accessory", default: "cgBench", choices: [
      { value: "cgBench", label: "Close-grip bench" }, { value: "spotoPress", label: "Spoto press" }, { value: "feetUpBench", label: "Feet-up bench" },
      { value: "pauseBench", label: "Paused bench" }, { value: "wideBench", label: "Wide-grip bench" },
    ] },
    { key: "acc2", label: "Vertical accessory", default: "ohp", choices: [
      { value: "ohp", label: "Standing overhead press" }, { value: "seatedOhp", label: "Seated overhead press" },
      { value: "inclineBench", label: "Incline bench" }, { value: "dbInclineBench", label: "Incline DB press" },
    ] },
  ],
  build(o) {
    const opts = { goal: "0.05", acc1: "cgBench", acc2: "ohp", ...o };
    const g = 1 + Number(opts.goal);
    const B = "bench";
    const bench = (p: string, sets: PercentSet[], note?: string, k = "") => pctSlot(`${p}-bench${k}`, B, "MAIN", B, [sets], { note, rest: 180 });
    const acc = (p: string, lift: string, sets: PercentSet[], note?: string, k = "a") => pctSlot(`${p}-${k}`, lift, "SUPP", B, [sets], { note, rest: 120 });
    const iso = (p: string, n: number) => [
      pctSlot(`${p}-iso1`, "tricepPushdown", "ACC", B, [S(n, 20)], { note: "Isolation for your weak point (any)", rest: 60 }),
      pctSlot(`${p}-iso2`, "overheadTricep", "ACC", B, [S(n, 20)], { note: "Isolation for your weak point (any)", rest: 60 }),
    ];
    const [a1, a2] = [opts.acc1, opts.acc2];
    const w1: [string, number, number][] = [[a1, 8, 1], [a2, 6, 2], [a1, 6, 1], [a2, 3, 2], [a1, 3, 1]];
    const weeks: DaySpec[][] = [
      w1.map(([lift, reps], d) => ({ name: `Max fatigue · Day ${d + 1}`, slots: (p) => [bench(p, S(3, 3, 0.7)), acc(p, lift, rpe(3, reps, 9)), ...iso(p, 3)] })),
      [
        { name: "Max fatigue · Day 1", slots: (p) => [bench(p, S(3, 1, 0.875), "Heavy singles, fast bar speed", "-top"), bench(p, S(3, 3, 0.75)), ...iso(p, 3)] },
        ...([["Low", 6], ["High", 6], ["Low", 3], ["High", 3]] as const).map(([pin, reps], d): DaySpec => ({
          name: `Max fatigue · Day ${d + 2}`,
          slots: (p) => [bench(p, S(3, 3, 0.75)), acc(p, "pinPress", rpe(3, reps, 9), `${pin} pin press${pin === "Low" ? " (pins low on the chest)" : " (a few inches off the chest)"}`), ...iso(p, 3)],
        })),
      ],
      [
        { name: "Build to 90% · Day 1", slots: (p) => [bench(p, S(3, 1, 0.9), "Heavy singles, ~90%", "-top"), bench(p, S(3, 3, 0.75), "75–80%"), ...iso(p, 3)] },
        ...([[a1, 12], [a2, 12], [a1, 10], [a2, 10]] as const).map(([lift, reps], d): DaySpec => ({
          name: `Build to 90% · Day ${d + 2}`, slots: (p) => [bench(p, S(3, 3, 0.75), "75–80%"), acc(p, lift, rpe(3, reps, 9)), ...iso(p, 3)],
        })),
      ],
      [
        { name: "Volume + specificity · Day 1", slots: (p) => [bench(p, scale(S(10, 3, 0.8), g), "80–82.5% of goal max"), acc(p, a1, rpe(1, 15, 10, { repsMax: 20 }), "PR set: true 15–20 rep max (15 unbroken, rest-pause to 20)")] },
        { name: "Volume + specificity · Day 2", slots: (p) => [
          bench(p, plus(scale(S(5, 3, 0.8), g), w8(5, 2.5)), "Heaviest you can in the range (up to 82.5% of goal + 15 lb) for 5–10 sets"),
          acc(p, a2, rpe(1, 15, 10, { repsMax: 20 }), "PR set: true 15–20 rep max"),
        ] },
      ],
      [
        { name: "Peak · Day 1", slots: (p) => [bench(p, scale(S(3, 3, 0.875), g), "87.5–90% of goal max"), ...iso(p, 1)] },
        { name: "Peak · Day 2", slots: (p) => [bench(p, rpe(1, 5, 10), "Work up to a true 5RM", "-5rm"), bench(p, scale(S(5, 3, 0.85), g), "Back-offs off the goal max"), ...iso(p, 1)] },
      ],
      [
        { name: "Overload · Day 1", slots: (p) => [acc(p, "pinPress", scale(S(3, 3, 1.075), g), "High pin press above your goal max"), ...iso(p, 1)] },
        { name: "Max out", slots: (p) => [testSlot(`${p}-test`, B, "Work up to a new 1RM: your goal max is the target.")] },
      ],
    ];
    return {
      templateId: "candito-adv-bench",
      name: "Candito Advanced Bench",
      sessionsPerWeek: 5,
      days: blockDays(weeks),
      cycle: { weeks: 6, finite: true, weekNames: ["Max fatigue 1", "Max fatigue 2", "Max fatigue 3 (to 90%)", "High volume", "Peak", "Max out"] },
      maxLabel: "1RM",
      notes: [
        `Weeks 1–3 use your current 1RM; weeks 4–6 use the goal max (${Math.round((g - 1) * 100)}% higher).`,
        "Weeks 1–3: five days in a row, then two off. Weeks 4–6: two days a week.",
        "Accessories have no set load: about RPE 9. If you miss a prescribed weight, lower your max 2.5–5%.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ bench: 275 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Candito Advanced Squat ─────────────────────────

export const canditoAdvSquat: ProgramTemplate = {
  id: "candito-adv-squat",
  name: "Candito 9 Week Advanced Squat",
  author: "Jonnie Candito",
  source: "LiftVault: Candito 9 Week Squat Program spreadsheet (loads from its formulas)",
  summary: "Squat specialization: three high-frequency weeks off your current max, then reduced-frequency volume, a 5RM transition, max-strength work and a max out off a goal max.",
  category: "peaking",
  level: "advanced",
  daysPerWeek: [5, 2, 3],
  weeks: 9,
  options: [
    goalOption("0.03"),
    { key: "acc1", label: "Primary accessory 1", default: "pinSquat", choices: [{ value: "pinSquat", label: "Pin squat" }, { value: "pauseSquat", label: "Pause squat" }, { value: "boxSquat", label: "Box squat" }] },
    { key: "acc2", label: "Primary accessory 2", default: "pauseSquat", choices: [{ value: "pauseSquat", label: "Pause squat" }, { value: "pinSquat", label: "Pin squat" }, { value: "boxSquat", label: "Box squat" }] },
  ],
  build(o) {
    const opts = { goal: "0.03", acc1: "pinSquat", acc2: "pauseSquat", ...o };
    const g = 1 + Number(opts.goal);
    const Q = "squat";
    const [a1, a2] = [opts.acc1, opts.acc2];
    const sq = (p: string, sets: PercentSet[], note?: string, k = "") => pctSlot(`${p}-sq${k}`, Q, "MAIN", Q, [sets], { note, rest: 240 });
    const gsq = (p: string, sets: PercentSet[], note?: string, k = "") => sq(p, scale(sets, g), note, k);
    const acc = (p: string, k: string, lift: string, sets: PercentSet[], note: string) => pctSlot(`${p}-${k}`, lift, "SUPP", Q, [sets], { note, rest: 120 });
    const H = "Hard", M = "Medium";
    const dl = (p: string, n: number, r: number, note = "Optional, light") => acc(p, "dl", "deadlift", S(n, r), note);
    const extra = (p: string, n: number, reps: number, note = M) => [
      acc(p, "x1", "legPress", S(n, reps), `${note} · accessory of choice`),
      acc(p, "x2", "backExtension", S(n, reps), `${note} · accessory of choice`),
    ];
    const add5 = w8(5, 2.5), add10 = w8(10, 5);
    const weeks: DaySpec[][] = [
      ([[a1, 8], [a2, 8], [a1, 6], [a1, 3], [a2, 3]] as const).map(([lift, reps], d) => ({
        name: `High frequency · Day ${d + 1}`, slots: (p) => [sq(p, S(3, 3, 0.75)), acc(p, "a", lift, S(1, reps), H), ...extra(p, 3, 20)],
      })),
      [
        { name: "High frequency · Day 1", slots: (p) => [sq(p, S(3, 1, 0.9), "Singles", "-top"), sq(p, S(3, 3, 0.75), "75 or 80%"), dl(p, 2, 6), acc(p, "fs", "frontSquat", S(1, 20), "Hard · front or high-bar squat"), acc(p, "x1", "legPress", S(3, 20), M)] },
        { name: "High frequency · Day 2", slots: (p) => [sq(p, S(3, 3, 0.75), "75 or 80%"), acc(p, "a", a2, S(5, 1), M), acc(p, "gm", "goodMorning", S(1, 20), "Hard · off pins"), acc(p, "x1", "legPress", S(3, 20), M)] },
        { name: "High frequency · Day 3", slots: (p) => [sq(p, S(3, 3, 0.75), "75 or 80%"), acc(p, "a", a1, S(5, 1), M), acc(p, "fs", "frontSquat", S(1, 15), "Hard · front or high-bar squat"), acc(p, "x1", "legPress", S(3, 20), M)] },
        { name: "High frequency · Day 4", slots: (p) => [sq(p, S(3, 3, 0.75), "75 or 80%"), acc(p, "a", a2, S(5, 1), M), acc(p, "gm", "goodMorning", S(1, 15), H), acc(p, "x1", "legPress", S(3, 20), M)] },
        { name: "High frequency · Day 5", slots: (p) => [sq(p, S(3, 3, 0.75), "75 or 80%"), acc(p, "a", a1, S(5, 1), M), acc(p, "x1", "legPress", S(3, 20), M)] },
      ],
      [
        { name: "High frequency · Day 1", slots: (p) => [sq(p, S(1, 3, 0.9)), dl(p, 2, 6), acc(p, "u1", "row", S(3, 8, undefined, { repsMax: 12 }), "Medium · accessory of choice"), acc(p, "u2", "dbBench", S(3, 8, undefined, { repsMax: 12 }), "Medium · accessory of choice"), ...extra(p, 3, 20)] },
        ...[2, 3, 4, 5].map((d): DaySpec => ({
          name: `High frequency · Day ${d}`,
          slots: (p) => [sq(p, S(3, 3, 0.8), "80 or 85%"), acc(p, "u1", "row", S(3, 8, undefined, { repsMax: 12 }), "Medium · accessory of choice"), acc(p, "u2", "dbBench", S(3, 8, undefined, { repsMax: 12 }), "Medium · accessory of choice"), ...extra(p, 3, 20)],
        })),
      ],
      [
        { name: "High volume · Day 1", slots: (p) => [gsq(p, S(10, 3, 0.8)), acc(p, "a", a1, S(1, 20), H), dl(p, 3, 3)] },
        { name: "High volume · Day 2", slots: (p) => [
          sq(p, plus(scale(S(5, 3, 0.8), g), add5), "Heaviest you can, up to day 1 + 15 lb, for 5–10 sets"),
          gsq(p, S(5, 3, 0.7), "Beltless back-offs: only if you hit max weight and max sets", "-bo"),
          acc(p, "a", a1, S(1, 15), H),
        ] },
      ],
      [
        { name: "High volume · Day 1", slots: (p) => [gsq(p, S(1, 1, 0.875), "87.5–90%", "-top"), gsq(p, [...S(5, 3, 0.8), ...S(5, 3, 0.775)]), acc(p, "a", a1, S(1, 20), "Hard · 5 lb more than last week"), dl(p, 3, 3)] },
        { name: "High volume · Day 2", slots: (p) => [
          sq(p, plus(scale(S(5, 3, 0.8), g), add5), "Up to 87.5% of goal"),
          sq(p, plus(scale(S(5, 3, 0.8), g), w8(-5, -2.5)), undefined, "-2"),
          sq(p, plus(scale(S(5, 3, 0.7), g), add5), "Beltless back-offs: only if you hit max weight and reps", "-bo"),
          acc(p, "a", a1, S(1, 15), "Hard · 5 lb more than last week"),
        ] },
      ],
      [
        { name: "5RM transition · Day 1", slots: (p) => [sq(p, rpe(1, 5, 10), "Work up to a 5RM (checkpoint 2)"), dl(p, 3, 8), ...extra(p, 3, 20)] },
        { name: "5RM transition · Day 2", slots: (p) => [gsq(p, S(12, 1, 0.75)), ...extra(p, 3, 20)] },
      ],
      [
        { name: "Max strength · Day 1", slots: (p) => [gsq(p, S(1, 3, 0.9)), dl(p, 2, 6), ...extra(p, 1, 20, H)] },
        { name: "Max strength · Day 2", slots: (p) => [sq(p, plus(scale(S(12, 1, 0.75), g), add5)), ...extra(p, 3, 20)] },
        { name: "Max strength · Day 3", slots: (p) => [sq(p, plus(scale(S(3, 1, 0.9), g), add5)), ...extra(p, 1, 20, H)] },
      ],
      [
        { name: "Max strength · Day 1", slots: (p) => [sq(p, plus(scale(S(1, 3, 0.9), g), add5), "Up to 92.5% + 5 lb"), dl(p, 2, 4, "Light"), ...extra(p, 1, 20, H)] },
        { name: "Max strength · Day 2", slots: (p) => [sq(p, plus(scale(S(12, 1, 0.75), g), add10)), ...extra(p, 3, 20)] },
        { name: "Max strength · Day 3", slots: (p) => [sq(p, plus(scale(S(3, 1, 0.9), g), add10), "Up to 92.5% + 10 lb, only if Monday's triple hit the top weight"), acc(p, "a", a1, S(1, 3), M), ...extra(p, 1, 20, H)] },
      ],
      [
        { name: "Max out week · Day 1", slots: (p) => [sq(p, plus(scale(S(6, 3, 0.7), g), add10)), ...extra(p, 3, 20)] },
        { name: "Max out week · Day 2", slots: (p) => [gsq(p, S(9, 1, 0.75))] },
        { name: "Max out", slots: (p) => [testSlot(`${p}-test`, Q, "Max out. Your goal max is the target.")] },
      ],
    ];
    return {
      templateId: "candito-adv-squat",
      name: "Candito Advanced Squat",
      sessionsPerWeek: 5,
      days: blockDays(weeks),
      cycle: { weeks: 9, finite: true, weekNames: ["High frequency 1", "High frequency 2", "High frequency 3", "High volume 1", "High volume 2", "5RM transition", "Max strength 1", "Max strength 2", "Max out"] },
      maxLabel: "1RM",
      notes: [
        `Weeks 1–3 use your current 1RM; weeks 4–9 use the goal max (${Math.round((g - 1) * 100)}% higher).`,
        "Checkpoint 1 (end of week 1): your pause-squat triple should be 80–87.5% of your max; if not, max = triple ÷ 0.825 (under) or ÷ 0.85 (over).",
        "Checkpoint 2 (week 6): your 5RM should be 85–90% of the goal; if not, goal = 5RM ÷ 0.875. Adjust the max in Setup.",
        "Accessory picks are placeholders: Hard / Medium / Light is the intended effort.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 365 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Greg Nuckols High Frequency ─────────────────────────

/** Sets × reps by week for each intensity (weeks 1–3). */
const HF: Record<string, PercentSet[][]> = {
  "0.75": [S(4, 3, 0.75), S(5, 3, 0.75), S(5, 4, 0.75)],
  "0.8": [S(3, 2, 0.8), S(4, 2, 0.8), S(4, 3, 0.8)],
  "0.7": [S(4, 4, 0.7), S(5, 4, 0.7), S(5, 5, 0.7)],
  "0.85": [S(3, 1, 0.85), S(4, 1, 0.85), SA(1, 1, 0.85)],
  "0.65": [S(5, 5, 0.65), S(6, 5, 0.65), S(6, 6, 0.65)],
};
/** Week-3 AMAP at 85%: 6–7 reps +1 increment, 8–9 +2, 10+ +3 (increment 5 lb / 2.5 kg). */
export const HF_AMAP: TmRule = { type: "amrapTable", setIndex: 0, applyAt: "weekEnd", table: [{ minReps: 6, increments: 1 }, { minReps: 8, increments: 2 }, { minReps: 10, increments: 3 }] };
/** Week-3 "1+ sets of 6" at the 6RM: +2% per set after the first. */
const HF_6RM: TmRule = { type: "totalReps", applyAt: "weekEnd", table: [0, 12, 18, 24, 30, 36, 42, 48].map((m, i) => ({ minReps: m, pct: i * 0.02 })) };

export const nuckolsHf: ProgramTemplate = {
  id: "nuckols-hf",
  name: "Greg Nuckols High Frequency",
  author: "Greg Nuckols",
  source: "LiftVault: Greg Nuckols High Frequency Template (Exact) and Frequency Program (1x Weekly Deadlift + OHP) sheets",
  summary: "Squat and bench (and deadlift) every training day at a different intensity, 3-week waves that add a set each week, then an AMAP at 85% sets the new max.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [5, 6],
  options: [{ key: "version", label: "Version", default: "exact", choices: [
    { value: "exact", label: "Exact: squat, bench and deadlift 5 days a week" },
    { value: "6day", label: "6 days: squat + bench daily, deadlift and OHP once a week" },
  ] }],
  build(o) {
    const six = o.version === "6day";
    const days: DayDef[] = [];
    const main = (d: string, lift: string, pct: string) =>
      pctSlot(`hf-${d}-${lift}`, lift, "MAIN", lift, HF[pct], { rest: 180, ...(pct === "0.85" ? { tmRule: HF_AMAP, note: "Week 3: one set as many reps as possible (sets the new max)" } : {}) });
    const acc = (id: string, lift: string, sets: number, note: string) => fixedSlot(id, lift, "ACC", sets, 8, { repsMax: 12, note, rest: 75 });
    if (!six) {
      (["0.75", "0.8", "0.7", "0.85", "0.65"] as const).forEach((pct, i) => {
        const d = `d${i + 1}`;
        days.push({ id: d.toUpperCase(), name: `Day ${i + 1} · ${Math.round(Number(pct) * 100)}%`, slots: ["squat", "bench", "deadlift"].map((l) => main(d, l, pct)) });
      });
    } else {
      const tri = acc("hf-tri", "tricepPushdown", 2, "Tricep work · RPE 8");
      const quad = acc("hf-quad", "legPress", 2, "Quad work · RPE 8");
      const pec = acc("hf-pec", "chestFly", 2, "Pec work · RPE 8");
      const post = acc("hf-post", "backExtension", 2, "Posterior chain · RPE 8");
      const bis = acc("hf-bis", "bicepCurl", 3, "Biceps · RPE 9");
      const pull = (d: string, lift: string): SlotDef[] => [
        pctSlot(`hf-${d}-${lift}`, lift, "SUPP", lift, [S(4, 12, 0.775), S(4, 8, 0.85), []], { note: "% of your 6RM", rest: 90 }),
        pctSlot(`hf-${d}-${lift}-amap`, lift, "SUPP", lift, [[], [], S(1, 6, 1)], { note: "As many sets of 6 as you can at your 6RM; each set after the first adds 2% to it", rest: 90, tmRule: HF_6RM }),
      ];
      const list: [string, string, SlotDef[]][] = [
        ["Mon", "0.75", [main("mon", "bench", "0.75"), tri, main("mon", "squat", "0.75"), quad]],
        ["Tue", "0.8", [main("tue", "bench", "0.8"), pec, main("tue", "squat", "0.8"), post, fixedSlot("hf-kroc", "dbRow", "ACC", 4, 10, { repsMax: 20, note: "Kroc rows · RPE 9–9.5" }), bis]],
        ["Wed", "0.7", [main("wed", "bench", "0.7"), tri, main("wed", "squat", "0.7"), quad]],
        ["Thu", "0.85", [main("thu", "bench", "0.85"), tri, main("thu", "squat", "0.85"), quad, ...pull("thu", "latPulldown"), bis]],
        ["Fri", "0.85", [main("fri", "ohp", "0.85"), acc("hf-delt", "lateralRaise", 2, "Side delt work · RPE 8"), main("fri", "deadlift", "0.85"), post]],
        ["Sat", "0.65", [main("sat", "bench", "0.65"), pec, main("sat", "squat", "0.65"), post, ...pull("sat", "tBarRow"), bis]],
      ];
      for (const [d, pct, slots] of list) days.push({ id: d.toUpperCase(), name: `${d} · ${Math.round(Number(pct) * 100)}%`, slots });
    }
    return {
      templateId: "nuckols-hf",
      name: `Nuckols High Frequency${six ? " · 6 day" : ""}`,
      sessionsPerWeek: six ? 6 : 5,
      days,
      cycle: { weeks: 3, weekNames: ["Week 1", "Week 2 (+1 set)", "Week 3 (+1 rep, AMAP)"] },
      maxLabel: "1RM",
      tmIncrement: Object.fromEntries(["squat", "bench", "deadlift", "ohp"].map((l) => [l, w8(5, 2.5)])),
      notes: [
        "Week 3, 85% day: one set to as many reps as possible. 6–7 reps → max +5 lb, 8–9 → +10 lb, 10+ → +15 lb (2.5 / 5 / 7.5 kg). Applied after week 3.",
        "Stay away from failure on everything else; bar speed and perfect reps.",
        ...(six ? ["Row and pulldown % are of a 6RM. Abs and rear delts, 2 easy sets, after every session."] : ["Add a couple of light prehab accessories, 3 supersetted sets."]),
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: inUnit({ squat: 315, bench: 225, deadlift: 385, ohp: 140, latPulldown: 160, tBarRow: 135 }, unit), startWeights: {} };
  },
};

// ───────────────────────── German Volume Training ─────────────────────────

/** All prescribed sets at full reps → +5% next session (any short or missing set → hold). */
const GVT_RULE: TmRule = { type: "amrapVsTarget", setIndex: 0, allSets: true, penalizeMissingSets: true, table: [{ diff: -100, pct: 0 }, { diff: 0, pct: 0.05 }] };

export const gvt: ProgramTemplate = {
  id: "gvt",
  name: "German Volume Training",
  author: "Charles Poliquin",
  source: "Charles Poliquin, \"German Volume Training\" (Volume 51 text) · LiftVault GVT spreadsheet",
  summary: "Ten sets of ten on two supersetted main lifts per session at 60% of 1RM (phase 2: 10×6 at 70%), plus two lighter supplementary lifts.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [3, 4],
  weeks: 7,
  options: [{ key: "phase", label: "Phase", default: "1", choices: [{ value: "1", label: "Phase 1 · 10×10 @ 60% (weeks 1–4)" }, { value: "2", label: "Phase 2 · 10×6 @ 70% (weeks 5–7)" }] }],
  build(o) {
    const two = o.phase === "2";
    const [reps, pct] = two ? [6, 0.7] : [10, 0.6];
    const main = (id: string, lift: string, tag: string) =>
      pctSlot(id, lift, "MAIN", lift, [S(10, reps, pct, { target: reps })], { tmRule: GVT_RULE, rest: 90, note: `${tag}: superset, 90 s between · all 10×${reps} → +5% next time` });
    const sup = (id: string, lift: string, r: [number, number], tag: string) => ({ ...doubleSlot(id, lift, "ACC", 3, r, w8(5, 2.5), `${tag}: superset, 60 s between`), restSeconds: 60 });
    const days: DayDef[] = two
      ? [
        // Poliquin's phase 2: B1/B2 3×6 (fly, EZ-bar row) and 3×12–15 (twisting crunch, calf);
        // arms/shoulders day keeps phase 1's dips + incline hammer curls and the two lateral raises.
        { id: "A", name: "Day A · Chest + Back", slots: [main("gvt-a1", "dbInclineBench", "A1"), main("gvt-a2", "pullUp", "A2 · wide grip"), sup("gvt-b1", "chestFly", [6, 6], "B1 · flat"), sup("gvt-b2", "row", [6, 6], "B2 · EZ bar")] },
        { id: "B", name: "Day B · Legs + Abs", slots: [main("gvt-a1l", "deadlift", "A1 · bent-knee"), main("gvt-a2l", "legCurl", "A2 · seated"), sup("gvt-b1l", "crunch", [12, 15], "B1 · twisting"), sup("gvt-b2l", "calfRaise", [12, 15], "B2 · standing")] },
        { id: "C", name: "Day C · Arms + Shoulders", slots: [main("gvt-a1c", "dip", "A1"), main("gvt-a2c", "hammerCurl", "A2 · incline"), sup("gvt-b1c", "rearDeltFly", [10, 12], "B1 · bent-over"), sup("gvt-b2c", "lateralRaise", [10, 12], "B2 · seated")] },
      ]
      : [
        { id: "A", name: "Day A · Chest + Back", slots: [main("gvt-a1", "dbDeclineBench", "A1 · palms facing"), main("gvt-a2", "chinUp", "A2"), sup("gvt-b1", "inclineFly", [10, 12], "B1"), sup("gvt-b2", "dbRow", [10, 12], "B2")] },
        { id: "B", name: "Day B · Legs + Abs", slots: [main("gvt-a1l", "squat", "A1"), main("gvt-a2l", "legCurl", "A2 · lying"), sup("gvt-b1l", "cableCrunch", [15, 20], "B1 · low cable pull-in"), sup("gvt-b2l", "seatedCalfRaise", [15, 20], "B2")] },
        { id: "C", name: "Day C · Arms + Shoulders", slots: [main("gvt-a1c", "dip", "A1"), main("gvt-a2c", "hammerCurl", "A2 · incline"), sup("gvt-b1c", "rearDeltFly", [10, 12], "B1 · bent-over"), sup("gvt-b2c", "lateralRaise", [10, 12], "B2 · seated")] },
      ];
    return {
      templateId: "gvt",
      name: `German Volume Training · Phase ${two ? 2 : 1}`,
      sessionsPerWeek: 4,
      days,
      maxLabel: "1RM",
      notes: [
        "Rotate A / B / C over a 5-day cycle: three training days, two rest days.",
        `Main lifts: 10×${reps} at ${Math.round(pct * 100)}% of 1RM, same weight on every set. When every set hits ${reps}, the max goes up 5% (so the load does too).`,
        "For chin-ups and dips, enter the 1RM as added weight. Run GVT once or twice a year at most.",
      ],
    };
  },
  defaults(unit) {
    return {
      trainingMaxes: inUnit({ dbDeclineBench: 90, chinUp: 70, squat: 315, legCurl: 150, dip: 90, hammerCurl: 50, dbInclineBench: 85, pullUp: 60, deadlift: 405, cgBench: 205, inclineCurl: 45 }, unit),
      // B exercises (double progression): phase 1 lifts; phase 2 reuses the slot ids
      startWeights: inUnit({ "gvt-b1": 25, "gvt-b2": 50, "gvt-b1l": 50, "gvt-b2l": 90, "gvt-b1c": 15, "gvt-b2c": 15 }, unit),
    };
  },
};

// ───────────────────────── Arnold Split ─────────────────────────

const PYR = "15 / 10–12 / 8–10 / 6 reps, adding weight each set";
const pyr = (id: string, lift: string, note = PYR) => fixedSlot(id, lift, "ACC", 4, 6, { repsMax: 15, note, rest: 90 });
const heavy = (id: string, lift: string, note = "10 / 6 / 4 reps, heavier each set") => fixedSlot(id, lift, "MAIN", 3, 4, { repsMax: 10, note, rest: 150 });

export const arnoldSplit: ProgramTemplate = {
  id: "arnold-split",
  name: "Arnold Split (Basic Training #1)",
  author: "Arnold Schwarzenegger",
  source: "LiftVault: The Arnold Split Basic Training #1 spreadsheet (from The New Encyclopedia of Modern Bodybuilding)",
  summary: "Six days a week: chest and back, shoulders and arms, legs, twice through. Four-set pyramids on almost everything, with a few heavy power movements.",
  category: "hypertrophy",
  level: "advanced",
  daysPerWeek: [6],
  options: [],
  build() {
    const chestBack: SlotDef[] = [
      pyr("arn-bench", "bench"), pyr("arn-incline", "inclineBench"), pyr("arn-pullover", "pullover"),
      fixedSlot("arn-chin", "chinUp", "ACC", 5, 10, { note: "50 total reps in as few sets as possible (up to 10)", amrapLast: true }),
      fixedSlot("arn-row", "row", "ACC", 5, 6, { repsMax: 15, note: "15 / 10–12 / 8–10 / 6 / 8" }),
      heavy("arn-dl", "deadlift"),
      fixedSlot("arn-crunch", "crunch", "ACC", 5, 25, { rest: 30 }),
    ];
    const arms: SlotDef[] = [
      pyr("arn-press", "ohp", `Barbell clean and press (or overhead press) · ${PYR}`), pyr("arn-lat", "lateralRaise"),
      heavy("arn-upright", "uprightRow", "Heavy: 10 / 6 / 4"),
      fixedSlot("arn-pp", "pushPress", "MAIN", 3, 2, { repsMax: 6, note: "6 / 4 / 2, each set then a drop set to failure", rest: 150 }),
      pyr("arn-curl", "barbellCurl"), pyr("arn-dbcurl", "bicepCurl", `Seated · ${PYR}`), pyr("arn-cgpress", "ohp", `Close-grip overhead press · ${PYR}`),
      pyr("arn-tri", "overheadTricep", `Standing barbell extension · ${PYR}`), pyr("arn-wrist", "wristCurl"), pyr("arn-rwrist", "wristCurl", `Reverse wrist curl · ${PYR}`),
      fixedSlot("arn-rcrunch", "crunch", "ACC", 5, 25, { note: "Reverse crunches", rest: 30 }),
    ];
    const legs: SlotDef[] = [
      pyr("arn-squat", "squat"), pyr("arn-lunge", "lunge"), pyr("arn-legcurl", "legCurl"),
      fixedSlot("arn-calf", "calfRaise", "ACC", 5, 15, { rest: 45 }),
      heavy("arn-sldl", "stiffLegDeadlift"), heavy("arn-gm", "goodMorning"),
      fixedSlot("arn-crunch", "crunch", "ACC", 5, 25, { rest: 30 }),
    ];
    return {
      templateId: "arnold-split",
      name: "Arnold Split",
      sessionsPerWeek: 6,
      days: [
        { id: "CB", name: "Chest & Back", slots: chestBack },
        { id: "SA", name: "Shoulders, Arms & Forearms", slots: arms },
        { id: "LG", name: "Thighs, Calves & Lower Back", slots: legs },
      ],
      notes: [
        "Mon/Thu chest & back, Tue/Fri shoulders & arms, Wed/Sat legs. The sheet repeats the same week for 12 weeks.",
        "Pyramids: 15, 10–12, 8–10, 6 reps, adding weight each set; take sets close to failure.",
      ],
    };
  },
};

// ───────────────────────── Alex Bromley: Simplest Beginner Program ─────────────────────────

export const bromleyBeginner: ProgramTemplate = {
  id: "bromley-beginner",
  name: "Bromley's Simplest Beginner Program",
  author: "Alex Bromley (Empire Barbell)",
  source: "LiftVault: SIMPLEST Beginner Program (Alex Bromley) spreadsheet, stages 1 and 2",
  summary: "The big five lifts for 4×6+ (add weight while the last set beats 6) plus arm work to failure; start A/B, then add a variation day.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3, 4, 5],
  options: [{ key: "stage", label: "Stage", default: "ab", choices: [{ value: "ab", label: "Stage 1 · A/B alternating (3–5 days)" }, { value: "3day", label: "Stage 2 · 3-day with a variations day" }] }],
  build(o) {
    const three = o.stage === "3day";
    const main = (id: string, lift: string, upper: boolean): SlotDef => ({
      id, lift, tier: "MAIN", restSeconds: 180, note: "Last set as many reps as possible. When it's a hard 6, move on to the next stage / vary the lift.",
      progression: { kind: "stages", stages: [{ sets: 4, reps: 6, amrap: true }], advance: { type: "amrapAtLeast", reps: 7 }, onFinalFail: { type: "hold" }, increment: upper ? w8(5, 2.5) : w8(10, 5) },
    });
    const toF = (id: string, lift: string, note?: string) => doubleSlot(id, lift, "ACC", 3, [8, 12], w8(5, 2.5), ["3 sets to failure, aim for 8–12", note].filter(Boolean).join(" · "));
    const days: DayDef[] = [
      { id: "A", name: three ? "Day 1" : "Workout A", slots: [main("brm-squat", "squat", false), main("brm-bench", "bench", true), toF("brm-upright", "uprightRow"), toF("brm-tri", "tricepPushdown")] },
      { id: "B", name: three ? "Day 2" : "Workout B", slots: [main("brm-dl", "deadlift", false), main("brm-row", "row", true), main("brm-ohp", "ohp", true), toF("brm-bis", "bicepCurl")] },
    ];
    if (three) days.push({ id: "C", name: "Day 3 · Variations", slots: [toF("brm-fs", "frontSquat"), toF("brm-cgb", "cgBench"), toF("brm-rdl", "rdl"), toF("brm-btn", "seatedOhp", "behind-the-neck press")] });
    return {
      templateId: "bromley-beginner",
      name: `Bromley Beginner · ${three ? "3-day" : "A/B"}`,
      sessionsPerWeek: 3,
      days,
      notes: [
        "4×6+: pick a weight where the first three sets feel almost too easy. Add weight every session the last set beats 6 (upper +2.5–5 lb, lower +5–10 lb).",
        "3×F: three sets to failure. Over 12 reps → add weight; under 8 → take some off.",
        "When the big lifts stall, graduate to Bullmastiff (Bromley's 4-day template).",
      ],
    };
  },
  defaults(unit) {
    return {
      startWeights: inUnit({ "brm-squat": 135, "brm-bench": 95, "brm-dl": 155, "brm-row": 85, "brm-ohp": 65, "brm-upright": 45, "brm-tri": 30, "brm-bis": 20, "brm-fs": 95, "brm-cgb": 85, "brm-rdl": 115, "brm-btn": 45 }, unit),
      trainingMaxes: {},
    };
  },
};

export const LIFTVAULT_TEMPLATES: ProgramTemplate[] = [smolov, magOrt, gzclUhf5, gzclUhf9, gzclGgWave, canditoAdvBench, canditoAdvSquat, nuckolsHf, gvt, arnoldSplit, bromleyBeginner];

// ───────────────────────── UHF data (from the sheets) ─────────────────────────

const UHF5: URow[][][] = [
  [ // week 1
    [[1, "squat", "squat", [[1, 0.9, 1, 0], [3, 0.775, 4, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.65, 8, 0]]], [3, "cableRow", null, [[5, 0, 0, 0]]], [3, "barbellCurl", null, [[5, 0, 0, 0]]], [3, "legCurl", null, [[5, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.9, 1, 0], [3, 0.775, 4, 1]]], [2, "pauseSquat", "squat", [[6, 0.725, 3, 0]]], [3, "dbOhp", null, [[5, 0, 0, 0]]], [3, "lateralRaise", null, [[5, 0, 0, 0]]], [3, "chestFly", null, [[5, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.9, 1, 0], [3, 0.725, 4, 1]], "2\" deficit"], [2, "ohp", "ohp", [[4, 0.65, 8, 0]]], [3, "pullUp", null, [[5, 0, 0, 0]]], [3, "backExtension", null, [[5, 0, 0, 0]]], [3, "rearDeltFly", null, [[5, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 0.975, 1, 0], [3, 0.8, 4, 1]]], [2, "pauseDeadlift", "deadlift", [[6, 0.725, 3, 0]]], [3, "inclineBench", null, [[5, 0, 0, 0]], "wide grip"], [3, "dip", null, [[5, 0, 0, 0]]], [3, "overheadTricep", null, [[5, 0, 0, 0]]]],
    [[1, "frontSquat", "frontSquat", [[1, 0.9, 1, 0], [3, 0.775, 4, 1]]], [2, "cgBench", "bench", [[4, 0.65, 8, 0]]], [3, "stiffLegDeadlift", null, [[5, 0, 0, 0]]], [3, "lunge", null, [[5, 0, 0, 0]]], [3, "latPulldown", null, [[5, 0, 0, 0]]]],
  ],
  [ // week 2
    [[1, "squat", "squat", [[1, 0.925, 1, 0], [4, 0.825, 3, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.7, 8, 0]]], [3, "cableRow", null, [[5, 0, 0, 0]]], [3, "barbellCurl", null, [[5, 0, 0, 0]]], [3, "legCurl", null, [[5, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.925, 1, 0], [4, 0.825, 3, 1]]], [2, "pauseSquat", "squat", [[6, 0.775, 3, 0]]], [3, "dbOhp", null, [[5, 0, 0, 0]]], [3, "lateralRaise", null, [[5, 0, 0, 0]]], [3, "chestFly", null, [[5, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.925, 1, 0], [4, 0.775, 3, 1]], "2\" deficit"], [2, "ohp", "ohp", [[4, 0.7, 8, 0]]], [3, "pullUp", null, [[5, 0, 0, 0]]], [3, "backExtension", null, [[5, 0, 0, 0]]], [3, "rearDeltFly", null, [[5, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 1, 1, 0], [4, 0.825, 3, 1]]], [2, "pauseDeadlift", "deadlift", [[6, 0.775, 3, 0]]], [3, "inclineBench", null, [[5, 0, 0, 0]], "wide grip"], [3, "dip", null, [[5, 0, 0, 0]]], [3, "overheadTricep", null, [[5, 0, 0, 0]]]],
    [[1, "frontSquat", "frontSquat", [[1, 0.925, 1, 0], [4, 0.825, 3, 1]]], [2, "cgBench", "bench", [[4, 0.7, 8, 0]]], [3, "stiffLegDeadlift", null, [[5, 0, 0, 0]]], [3, "lunge", null, [[5, 0, 0, 0]]], [3, "latPulldown", null, [[5, 0, 0, 0]]]],
  ],
  [ // week 3
    [[1, "squat", "squat", [[1, 0.95, 1, 0], [4, 0.875, 2, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.75, 6, 0]]], [3, "cableRow", null, [[4, 0, 0, 0]]], [3, "barbellCurl", null, [[4, 0, 0, 0]]], [3, "legCurl", null, [[4, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.95, 1, 0], [4, 0.875, 2, 1]]], [2, "pauseSquat", "squat", [[6, 0.825, 2, 0]]], [3, "dbOhp", null, [[4, 0, 0, 0]]], [3, "lateralRaise", null, [[4, 0, 0, 0]]], [3, "chestFly", null, [[4, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.95, 1, 0], [4, 0.825, 2, 1]], "2\" deficit"], [2, "ohp", "ohp", [[4, 0.75, 6, 0]]], [3, "pullUp", null, [[4, 0, 0, 0]]], [3, "backExtension", null, [[4, 0, 0, 0]]], [3, "rearDeltFly", null, [[4, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 1.025, 1, 0], [4, 0.85, 2, 1]]], [2, "pauseDeadlift", "deadlift", [[6, 0.825, 2, 0]]], [3, "inclineBench", null, [[4, 0, 0, 0]], "wide grip"], [3, "dip", null, [[4, 0, 0, 0]]], [3, "overheadTricep", null, [[4, 0, 0, 0]]]],
    [[1, "frontSquat", "frontSquat", [[1, 0.95, 1, 0], [4, 0.875, 2, 1]]], [2, "cgBench", "bench", [[4, 0.75, 6, 0]]], [3, "stiffLegDeadlift", null, [[4, 0, 0, 0]]], [3, "lunge", null, [[4, 0, 0, 0]]], [3, "latPulldown", null, [[4, 0, 0, 0]]]],
  ],
  [ // week 4
    [[1, "squat", "squat", [[2, 0.975, 1, 1], [3, 0.95, 1, 0]]], [2, "inclineBench", "inclineBench", [[4, 0.8, 5, 0]]], [3, "cableRow", null, [[3, 0, 0, 0]]], [3, "barbellCurl", null, [[3, 0, 0, 0]]], [3, "legCurl", null, [[3, 0, 0, 0]]]],
    [[1, "bench", "bench", [[2, 0.975, 1, 1], [3, 0.95, 1, 0]]], [2, "pauseSquat", "squat", [[5, 0.875, 2, 0]]], [3, "dbOhp", null, [[3, 0, 0, 0]]], [3, "lateralRaise", null, [[3, 0, 0, 0]]], [3, "chestFly", null, [[3, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[2, 0.975, 1, 1], [3, 0.875, 1, 0]]], [2, "ohp", "ohp", [[4, 0.8, 5, 0]]], [3, "pullUp", null, [[3, 0, 0, 0]]], [3, "backExtension", null, [[3, 0, 0, 0]]], [3, "rearDeltFly", null, [[3, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[2, 1.05, 1, 1], [3, 0.875, 1, 0]]], [2, "pauseDeadlift", "deadlift", [[5, 0.875, 2, 0]]], [3, "inclineBench", null, [[3, 0, 0, 0]], "wide grip"], [3, "dip", null, [[3, 0, 0, 0]]], [3, "overheadTricep", null, [[3, 0, 0, 0]]]],
    [[1, "frontSquat", "frontSquat", [[2, 0.975, 1, 1], [3, 0.95, 1, 0]]], [2, "cgBench", "bench", [[4, 0.8, 5, 0]]], [3, "stiffLegDeadlift", null, [[3, 0, 0, 0]]], [3, "lunge", null, [[3, 0, 0, 0]]], [3, "latPulldown", null, [[3, 0, 0, 0]]]],
  ],
  [ // week 5
    [[1, "squat", "squat", [[1, 1, 1, 0], [1, 0.85, 1, 1]]], [2, "inclineBench", "inclineBench", [[1, 0.6, 1, 1]]], [3, "cableRow", null, [[1, 0, 0, 0]]], [3, "barbellCurl", null, [[1, 0, 0, 0]]], [3, "legCurl", null, [[1, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 1, 1, 0], [1, 0.85, 1, 1]]], [2, "squat", "squat", [[3, 0.7, 2, 0]]], [3, "dbOhp", null, [[1, 0, 0, 0]]], [3, "lateralRaise", null, [[1, 0, 0, 0]]], [3, "chestFly", null, [[1, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[1, 1, 1, 0], [1, 0.85, 1, 1]]], [2, "ohp", "ohp", [[1, 0.6, 1, 1]]], [3, "pullUp", null, [[1, 0, 0, 0]]], [3, "backExtension", null, [[1, 0, 0, 0]]], [3, "rearDeltFly", null, [[1, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 1.075, 1, 0], [1, 0.9, 1, 1]]], [2, "deadlift", "deadlift", [[3, 0.7, 2, 0]]], [3, "inclineBench", null, [[1, 0, 0, 0]], "wide grip"], [3, "dip", null, [[1, 0, 0, 0]]], [3, "overheadTricep", null, [[1, 0, 0, 0]]]],
    [[1, "frontSquat", "frontSquat", [[1, 1, 1, 0], [1, 0.85, 1, 1]]], [2, "cgBench", "bench", [[1, 0.6, 1, 1]]], [3, "stiffLegDeadlift", null, [[1, 0, 0, 0]]], [3, "lunge", null, [[1, 0, 0, 0]]], [3, "latPulldown", null, [[1, 0, 0, 0]]]],
  ],
];

const UHF9: URow[][][] = [
  [ // week 1
    [[1, "squat", "squat", [[3, 0.85, 4, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.6, 10, 1]]], [3, "cableRow", null, [[5, 0, 0, 0]]], [3, "barbellCurl", null, [[5, 0, 0, 0]]], [3, "legCurl", null, [[5, 0, 0, 0]]]],
    [[1, "bench", "bench", [[3, 0.85, 4, 1]]], [2, "pauseSquat", "squat", [[7, 0.7, 3, 1]]], [3, "dbOhp", null, [[5, 0, 0, 0]]], [3, "lateralRaise", null, [[5, 0, 0, 0]]], [3, "chestFly", null, [[5, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[3, 0.75, 4, 1]], "3\" deficit"], [2, "feetUpBench", "bench", [[4, 0.6, 10, 1]]], [3, "pullUp", null, [[5, 0, 0, 0]]], [3, "backExtension", null, [[5, 0, 0, 0]]], [3, "rearDeltFly", null, [[5, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[3, 0.9, 4, 1]]], [2, "pauseDeadlift", "deadlift", [[7, 0.6, 3, 1]]], [3, "inclineBench", null, [[5, 0, 0, 0]], "wide grip"], [3, "dip", null, [[5, 0, 0, 0]]], [3, "overheadTricep", null, [[5, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[3, 0.7, 4, 1]]], [2, "cgBench", "bench", [[4, 0.65, 10, 1]]], [3, "stiffLegDeadlift", null, [[5, 0, 0, 0]]], [3, "lunge", null, [[5, 0, 0, 0]]], [3, "latPulldown", null, [[5, 0, 0, 0]]]],
  ],
  [ // week 2
    [[1, "squat", "squat", [[4, 0.9, 3, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.65, 8, 0]]], [3, "cableRow", null, [[5, 0, 0, 0]]], [3, "barbellCurl", null, [[5, 0, 0, 0]]], [3, "legCurl", null, [[5, 0, 0, 0]]]],
    [[1, "bench", "bench", [[4, 0.9, 3, 1]]], [2, "pauseSquat", "squat", [[8, 0.75, 2, 0]]], [3, "dbOhp", null, [[5, 0, 0, 0]]], [3, "lateralRaise", null, [[5, 0, 0, 0]]], [3, "chestFly", null, [[5, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[4, 0.8, 3, 1]], "3\" deficit"], [2, "feetUpBench", "bench", [[4, 0.65, 8, 0]]], [3, "pullUp", null, [[5, 0, 0, 0]]], [3, "backExtension", null, [[5, 0, 0, 0]]], [3, "rearDeltFly", null, [[5, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[4, 0.95, 3, 1]]], [2, "pauseDeadlift", "deadlift", [[8, 0.65, 2, 0]]], [3, "inclineBench", null, [[5, 0, 0, 0]], "wide grip"], [3, "dip", null, [[5, 0, 0, 0]]], [3, "overheadTricep", null, [[5, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[4, 0.75, 3, 1]]], [2, "cgBench", "bench", [[4, 0.7, 8, 0]]], [3, "stiffLegDeadlift", null, [[5, 0, 0, 0]]], [3, "lunge", null, [[5, 0, 0, 0]]], [3, "latPulldown", null, [[5, 0, 0, 0]]]],
  ],
  [ // week 3
    [[1, "squat", "squat", [[5, 0.95, 2, 1]]], [2, "inclineBench", "inclineBench", [[4, 0.7, 6, 0]]], [3, "cableRow", null, [[4, 0, 0, 0]]], [3, "barbellCurl", null, [[4, 0, 0, 0]]], [3, "legCurl", null, [[4, 0, 0, 0]]]],
    [[1, "bench", "bench", [[5, 0.95, 2, 1]]], [2, "pauseSquat", "squat", [[10, 0.8, 1, 0]]], [3, "dbOhp", null, [[4, 0, 0, 0]]], [3, "lateralRaise", null, [[4, 0, 0, 0]]], [3, "chestFly", null, [[4, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[5, 0.85, 2, 1]], "3\" deficit"], [2, "feetUpBench", "bench", [[4, 0.7, 6, 0]]], [3, "pullUp", null, [[4, 0, 0, 0]]], [3, "backExtension", null, [[4, 0, 0, 0]]], [3, "rearDeltFly", null, [[4, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[5, 1, 2, 1]]], [2, "pauseDeadlift", "deadlift", [[10, 0.7, 1, 0]]], [3, "inclineBench", null, [[4, 0, 0, 0]], "wide grip"], [3, "dip", null, [[4, 0, 0, 0]]], [3, "overheadTricep", null, [[4, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[5, 0.8, 2, 1]]], [2, "cgBench", "bench", [[4, 0.75, 6, 0]]], [3, "stiffLegDeadlift", null, [[4, 0, 0, 0]]], [3, "lunge", null, [[4, 0, 0, 0]]], [3, "latPulldown", null, [[4, 0, 0, 0]]]],
  ],
  [ // week 4
    [[1, "squat", "squat", [[1, 0.875, 3, 0], [1, 0.9, 2, 0], [5, 0.925, 1, 1]]], [2, "inclineBench", "inclineBench", [[5, 0.75, 5, 1]]], [3, "cableRow", null, [[4, 0, 0, 0]]], [3, "barbellCurl", null, [[4, 0, 0, 0]]], [3, "legCurl", null, [[4, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.875, 3, 0], [1, 0.9, 2, 0], [5, 0.925, 1, 1]]], [2, "squat", "squat", [[5, 0.775, 5, 1]]], [3, "dbOhp", null, [[4, 0, 0, 0]]], [3, "lateralRaise", null, [[4, 0, 0, 0]]], [3, "chestFly", null, [[4, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.775, 3, 0], [1, 0.8, 2, 0], [5, 0.825, 1, 1]], "2\" deficit"], [2, "feetUpBench", "bench", [[5, 0.75, 5, 1]]], [3, "pullUp", null, [[4, 0, 0, 0]]], [3, "backExtension", null, [[4, 0, 0, 0]]], [3, "rearDeltFly", null, [[4, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 0.925, 3, 0], [1, 0.95, 2, 0], [5, 0.975, 1, 1]]], [2, "deadlift", "deadlift", [[5, 0.75, 5, 1]]], [3, "inclineBench", null, [[4, 0, 0, 0]], "wide grip"], [3, "dip", null, [[4, 0, 0, 0]]], [3, "overheadTricep", null, [[4, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[1, 0.725, 3, 0], [1, 0.75, 2, 0], [5, 0.775, 1, 1]]], [2, "cgBench", "bench", [[5, 0.8, 5, 1]]], [3, "stiffLegDeadlift", null, [[4, 0, 0, 0]]], [3, "lunge", null, [[4, 0, 0, 0]]], [3, "latPulldown", null, [[4, 0, 0, 0]]]],
  ],
  [ // week 5
    [[1, "squat", "squat", [[1, 0.9, 3, 0], [1, 0.925, 2, 0], [4, 0.95, 1, 1]]], [2, "inclineBench", "inclineBench", [[5, 0.775, 4, 0]]], [3, "cableRow", null, [[3, 0, 0, 0]]], [3, "barbellCurl", null, [[3, 0, 0, 0]]], [3, "legCurl", null, [[3, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.9, 3, 0], [1, 0.925, 2, 0], [4, 0.95, 1, 1]]], [2, "squat", "squat", [[5, 0.8, 4, 0]]], [3, "dbOhp", null, [[3, 0, 0, 0]]], [3, "lateralRaise", null, [[3, 0, 0, 0]]], [3, "chestFly", null, [[3, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.8, 3, 0], [1, 0.825, 2, 0], [4, 0.85, 1, 1]], "2\" deficit"], [2, "feetUpBench", "bench", [[5, 0.775, 4, 0]]], [3, "pullUp", null, [[3, 0, 0, 0]]], [3, "backExtension", null, [[3, 0, 0, 0]]], [3, "rearDeltFly", null, [[3, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 0.95, 3, 0], [1, 0.975, 2, 0], [4, 1, 1, 1]]], [2, "deadlift", "deadlift", [[5, 0.775, 4, 0]]], [3, "inclineBench", null, [[3, 0, 0, 0]], "wide grip"], [3, "dip", null, [[3, 0, 0, 0]]], [3, "overheadTricep", null, [[3, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[1, 0.75, 3, 0], [1, 0.775, 2, 0], [4, 0.8, 1, 1]]], [2, "cgBench", "bench", [[5, 0.825, 4, 0]]], [3, "stiffLegDeadlift", null, [[3, 0, 0, 0]]], [3, "lunge", null, [[3, 0, 0, 0]]], [3, "latPulldown", null, [[3, 0, 0, 0]]]],
  ],
  [ // week 6
    [[1, "squat", "squat", [[1, 0.925, 3, 0], [1, 0.95, 2, 0], [3, 0.975, 1, 1]]], [2, "inclineBench", "inclineBench", [[5, 0.8, 3, 0]]], [3, "cableRow", null, [[3, 0, 0, 0]]], [3, "barbellCurl", null, [[3, 0, 0, 0]]], [3, "legCurl", null, [[3, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.925, 3, 0], [1, 0.95, 2, 0], [3, 0.975, 1, 1]]], [2, "squat", "squat", [[5, 0.825, 3, 0]]], [3, "dbOhp", null, [[3, 0, 0, 0]]], [3, "lateralRaise", null, [[3, 0, 0, 0]]], [3, "chestFly", null, [[3, 0, 0, 0]]]],
    [[1, "deficitDeadlift", "deadlift", [[1, 0.825, 3, 0], [1, 0.85, 2, 0], [3, 0.875, 1, 1]], "2\" deficit"], [2, "feetUpBench", "bench", [[5, 0.8, 3, 0]]], [3, "pullUp", null, [[3, 0, 0, 0]]], [3, "backExtension", null, [[3, 0, 0, 0]]], [3, "rearDeltFly", null, [[3, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 0.975, 3, 0], [1, 1, 2, 0], [3, 1.025, 1, 1]]], [2, "deadlift", "deadlift", [[5, 0.8, 3, 0]]], [3, "inclineBench", null, [[3, 0, 0, 0]], "wide grip"], [3, "dip", null, [[3, 0, 0, 0]]], [3, "overheadTricep", null, [[3, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[1, 0.775, 3, 0], [1, 0.8, 2, 0], [3, 0.825, 1, 1]]], [2, "cgBench", "bench", [[5, 0.85, 3, 0]]], [3, "stiffLegDeadlift", null, [[3, 0, 0, 0]]], [3, "lunge", null, [[3, 0, 0, 0]]], [3, "latPulldown", null, [[3, 0, 0, 0]]]],
  ],
  [ // week 7
    [[1, "squat", "squat", [[3, 0.9, 3, 1]]], [2, "inclineBench", "inclineBench", [[10, 0.825, 2, 1]]], [3, "cableRow", null, [[2, 0, 0, 0]]], [3, "barbellCurl", null, [[2, 0, 0, 0]]], [3, "legCurl", null, [[2, 0, 0, 0]]]],
    [[1, "bench", "bench", [[3, 0.9, 3, 1]]], [2, "pauseSquat", "squat", [[5, 0.75, 2, 1]]], [3, "dbOhp", null, [[2, 0, 0, 0]]], [3, "lateralRaise", null, [[2, 0, 0, 0]]], [3, "chestFly", null, [[2, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[3, 0.9, 3, 1]]], [2, "feetUpBench", "bench", [[5, 0.825, 2, 1]]], [3, "pullUp", null, [[2, 0, 0, 0]]], [3, "backExtension", null, [[2, 0, 0, 0]]], [3, "rearDeltFly", null, [[2, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[3, 0.95, 3, 1]]], [2, "deadlift", "deadlift", [[5, 0.825, 2, 1]]], [3, "inclineBench", null, [[2, 0, 0, 0]], "wide grip"], [3, "dip", null, [[2, 0, 0, 0]]], [3, "overheadTricep", null, [[2, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[3, 0.75, 3, 1]]], [2, "cgBench", "bench", [[5, 0.875, 2, 1]]], [3, "stiffLegDeadlift", null, [[2, 0, 0, 0]]], [3, "lunge", null, [[2, 0, 0, 0]]], [3, "latPulldown", null, [[2, 0, 0, 0]]]],
  ],
  [ // week 8
    [[1, "squat", "squat", [[5, 0.925, 1, 1]]], [2, "inclineBench", "inclineBench", [[10, 0.85, 1, 0]]], [3, "cableRow", null, [[2, 0, 0, 0]]], [3, "barbellCurl", null, [[2, 0, 0, 0]]], [3, "legCurl", null, [[2, 0, 0, 0]]]],
    [[1, "bench", "bench", [[5, 0.925, 1, 1]]], [2, "pauseSquat", "squat", [[10, 0.775, 1, 0]]], [3, "dbOhp", null, [[2, 0, 0, 0]]], [3, "lateralRaise", null, [[2, 0, 0, 0]]], [3, "chestFly", null, [[2, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[5, 0.925, 1, 1]]], [2, "feetUpBench", "bench", [[10, 0.85, 1, 0]]], [3, "pullUp", null, [[2, 0, 0, 0]]], [3, "backExtension", null, [[2, 0, 0, 0]]], [3, "rearDeltFly", null, [[2, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[5, 0.975, 1, 1]]], [2, "deadlift", "deadlift", [[10, 0.85, 1, 0]]], [3, "inclineBench", null, [[2, 0, 0, 0]], "wide grip"], [3, "dip", null, [[2, 0, 0, 0]]], [3, "overheadTricep", null, [[2, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[5, 0.775, 1, 1]]], [2, "cgBench", "bench", [[10, 0.9, 1, 0]]], [3, "stiffLegDeadlift", null, [[2, 0, 0, 0]]], [3, "lunge", null, [[2, 0, 0, 0]]], [3, "latPulldown", null, [[2, 0, 0, 0]]]],
  ],
  [ // week 9
    [[1, "squat", "squat", [[1, 0.95, 3, 0], [1, 0.975, 2, 0], [1, 1, 1, 1]]], [3, "cableRow", null, [[1, 0, 0, 0]]], [3, "legCurl", null, [[1, 0, 0, 0]]]],
    [[1, "bench", "bench", [[1, 0.95, 3, 0], [1, 0.975, 2, 0], [1, 1, 1, 1]]], [3, "dbOhp", null, [[1, 0, 0, 0]]], [3, "chestFly", null, [[1, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[1, 0.95, 3, 0], [1, 0.975, 2, 0], [1, 1, 1, 1]]], [3, "pullUp", null, [[1, 0, 0, 0]]], [3, "rearDeltFly", null, [[1, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[1, 1, 3, 0], [1, 1.025, 2, 0], [1, 1.05, 1, 1]]], [2, "rackPull", "deadlift", [[4, 0.9, 5, 1]], "4\" blocks"], [3, "dip", null, [[1, 0, 0, 0]]], [3, "overheadTricep", null, [[1, 0, 0, 0]]]],
    [[1, "safetyBarSquat", "squat", [[1, 0.8, 3, 0], [1, 0.825, 2, 0], [1, 0.85, 1, 1]]], [3, "lunge", null, [[1, 0, 0, 0]]], [3, "latPulldown", null, [[1, 0, 0, 0]]]],
  ],
  [ // week 10
    [[1, "squat", "squat", [[6, 1.025, 1, 1]]], [2, "bench", "bench", [[10, 0.8, 2, 0]]], [3, "cableRow", null, [[1, 0, 0, 0]]], [3, "legCurl", null, [[1, 0, 0, 0]]]],
    [[1, "bench", "bench", [[6, 1.025, 1, 1]]], [2, "squat", "squat", [[10, 0.8, 2, 0]]], [3, "dbOhp", null, [[1, 0, 0, 0]]], [3, "chestFly", null, [[1, 0, 0, 0]]]],
    [[1, "deadlift", "deadlift", [[6, 1.025, 1, 1]]], [2, "bench", "bench", [[3, 0.7, 5, 0]]], [3, "pullUp", null, [[1, 0, 0, 0]]], [3, "rearDeltFly", null, [[1, 0, 0, 0]]]],
    [[1, "slingshotBench", "bench", [[6, 1.075, 1, 1]]], [2, "rackPull", "deadlift", [[5, 0.95, 4, 1]], "4\" blocks"], [3, "dip", null, [[1, 0, 0, 0]]], [3, "overheadTricep", null, [[1, 0, 0, 0]]]],
  ],
  [ // week 11
    [[1, "squat", "squat", [[3, 1.05, 1, 1]]], [2, "bench", "bench", [[10, 0.9, 1, 1]]]],
    [[1, "bench", "bench", [[3, 1.05, 1, 1]]], [2, "squat", "squat", [[10, 0.9, 1, 1]]]],
    [[1, "deadlift", "deadlift", [[3, 1.05, 1, 1]]], [2, "bench", "bench", [[4, 0.8, 3, 1]]]],
    [[1, "slingshotBench", "bench", [[3, 1.1, 1, 1]]], [2, "rackPull", "deadlift", [[5, 1, 3, 1]], "4\" blocks"]],
  ],
];
