// Free programs from coaches who give them away, transcribed from LiftVault's write-ups and public
// sheets of the originals:
//
//   Dan John 40 Day     "Even Easier Strength" (Dan John, Medium; LiftVault "Dan John 40 Day Program"
//                       sheet). Five movements every workout (push, pull, hinge, squat, carry); a
//                       two-week wave of ten workouts run four times: 2×5, 2×5, 5-3-2, 2×5, 2×5 /
//                       2×5, 6 singles, 1×10 light, 2×5, 5-3-2. Never miss, add weight when it's light.
//   10,000 Swings       Dan John's kettlebell challenge (T Nation; LiftVault sheet): 20 workouts of 500
//                       swings, 5 rounds of 10/15/25/50, a 1-2-3 ladder of one strength lift between
//                       the sets; 2 days on, 1 off.
//   AlphaDestiny Novice Alex Leonidas (YouTube; LiftVault write-up). A/B full body three days a week;
//                       mains 3 (or 5) sets of 4–6, add weight at 15–18 total reps (25–30 with five
//                       sets); accessories in rep ranges. Stalled two sessions → about −10%.
//   Bromley 100 lb Sq.  "100 lbs in 10 Weeks" (Alex Bromley, Empire Barbell free PDF; LiftVault sheet).
//                       Four days; squat and push press 3×5 @70 → 5×5 @75 → 4×4 @78 → 3×3 @83 → 1×3+
//                       @88 (last set to the max), deadlift 3×6 @65 → 3×3 @85, two work-up top-set
//                       days. Run the 5-week wave, take a light week and retest, run it again: weeks
//                       6–10 here run off the new maxes from the week-5 AMRAPs (e1RM). Accessory sets
//                       change weekly; each slot lists the five weeks in its note.

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, Weights } from "../program";
import type { Unit } from "../units";

const kg = (v: number) => Math.round(v / 2.20462 / 2.5) * 2.5;
const conv = (unit: Unit, rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, unit === "lb" ? v : kg(v)]));
const fixed = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string, tier: Tier = "ACC"): SlotDef => ({
  id, lift, tier, progression: { kind: "fixed", sets, reps, repsMax, note },
});
const dbl = (id: string, lift: string, sets: number, lo: number, hi: number, inc: Weights, tier: Tier = "ACC", note?: string): SlotDef => ({
  id, lift, tier, note, progression: { kind: "double", sets, reps: [lo, hi], increment: inc },
});
const maxSets = (id: string, lift: string, sets: number, note: string): SlotDef => ({ id, lift, tier: "ACC", progression: { kind: "fixed", sets, reps: 1, amrapLast: true, note } });

// ───────────────────────── Dan John 40 Day ─────────────────────────

const DJ_LIFTS: [string, string][] = [["ohp", "push"], ["pullUp", "pull"], ["deadlift", "hinge"], ["frontSquat", "squat"]];
type Scheme = "2x5" | "532" | "6x1" | "1x10";
const DJ_WAVE: Scheme[][] = [["2x5", "2x5", "532", "2x5", "2x5"], ["2x5", "6x1", "1x10", "2x5", "532"]];
const DJ_SCHEME: Record<Scheme, { label: string; sets: number; reps: number; repsMax?: number; note: string }> = {
  "2x5": { label: "2×5", sets: 2, reps: 5, note: "easy and smooth" },
  "532": { label: "5-3-2", sets: 3, reps: 2, repsMax: 5, note: "5 at the easy weight, then heavier for 3, then a solid 2" },
  "6x1": { label: "6 singles", sets: 6, reps: 1, note: "add a little each single; no misses" },
  "1x10": { label: "1×10", sets: 1, reps: 10, note: "light" },
};

export const danJohn40: ProgramTemplate = {
  id: "dan-john-40-day",
  name: "Dan John 40 Day Program",
  author: "Dan John",
  source: "\"Even Easier Strength\" (Dan John, Medium) · LiftVault \"Dan John 40 Day Program\" sheet",
  summary: "Five movements, five days a week, forty workouts: mostly 2×5 with a weight that feels easy, never missing a rep. The bar gets heavier on its own.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [5],
  weeks: 8,
  then: { when: "After 40 workouts, test if you like, then pick new variations of the five movements and run it again." },
  options: [],
  build() {
    const days: DayDef[] = DJ_WAVE.flatMap((wk, w) => wk.map((sc, d): DayDef => {
      const s = DJ_SCHEME[sc];
      return {
        id: `W${w + 1}D${d + 1}`, name: `${w === 0 ? "Week A" : "Week B"} · Day ${d + 1} · ${s.label}`,
        weeks: [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => x % 2 === w),
        slots: [
          ...DJ_LIFTS.map(([lift, what]) => fixed(`dj-${lift}-${sc}`, lift, s.sets, s.reps, s.repsMax, `${what}: ${s.note}`, "MAIN")),
          fixed("dj-carry", "farmersWalk", 1, 1, undefined, "loaded carry for distance", "ACC"),
        ],
      };
    }));
    return {
      templateId: "dan-john-40-day",
      name: "Dan John 40 Day",
      sessionsPerWeek: 5,
      days,
      cycle: { weeks: 8, finite: true, weekNames: Array.from({ length: 8 }, (_, w) => `Wave ${Math.floor(w / 2) + 1} · ${w % 2 ? "week B" : "week A"}`) },
      notes: [
        "Pick one push, pull, hinge and squat (press, pull-up, deadlift and front squat by default) and a loaded carry; do all five every workout.",
        "The easy weight is about your second or third warm-up, not a max. Never miss, never grind, ten reps or fewer per lift a day.",
        "When the bar feels light, add a little. Every couple of weeks you can swap in a close variation.",
      ],
    };
  },
  defaults: () => ({ startWeights: {}, trainingMaxes: {} }),
};

// ───────────────────────── 10,000 Swings ─────────────────────────

export const tenKSwings: ProgramTemplate = {
  id: "dan-john-10k-swings",
  name: "Dan John 10,000 Swing Challenge",
  author: "Dan John",
  source: "T Nation \"The 10,000 Swing Kettlebell Workout\" · LiftVault sheet",
  summary: "Twenty workouts of 500 kettlebell swings in sets of 10, 15, 25 and 50, with a 1-2-3 ladder of presses, dips, goblet squats or chins in between.",
  category: "strength",
  level: "beginner",
  daysPerWeek: [4, 5],
  weeks: 4,
  then: { when: "Done at 10,000 swings: go back to your usual lifting; most people find their main lifts went up too." },
  options: [
    { key: "lift", label: "Strength lift", default: "ohp", choices: [
      { value: "ohp", label: "Overhead press" }, { value: "dip", label: "Dips" }, { value: "gobletSquat", label: "Goblet squat" }, { value: "chinUp", label: "Chin-ups" },
    ] },
  ],
  build(o) {
    const lift = o.lift ?? "ohp";
    const slots: SlotDef[] = [
      fixed("10k-swing", "kbSwing", 20, 10, 50, "5 rounds of 10, 15, 25, 50 = 500 a session"),
      fixed("10k-lift", lift, 15, 1, 3, "ladder: 1 after the 10s, 2 after the 15s, 3 after the 25s (30 reps a session)", "MAIN"),
    ];
    return {
      templateId: "dan-john-10k-swings",
      name: "10,000 Swings",
      sessionsPerWeek: 5,
      days: [1, 2, 3, 4, 5].map((d) => ({ id: `S${d}`, name: `Workout ${d}`, slots })),
      cycle: { weeks: 4, finite: true },
      notes: [
        "Two days on, one off: 20 workouts of 500 swings is 10,000. Men usually use a 24 kg bell, women 16 kg; go lighter if your swing breaks down.",
        "Each round: 10 swings, 1 rep of the strength lift, 15 swings, 2 reps, 25 swings, 3 reps, 50 swings. Five rounds.",
        "Rest 30–60 seconds after the 10s, 15s and 25s, at least 3 minutes after each 50.",
      ],
    };
  },
  defaults: (unit) => ({ startWeights: conv(unit, { "10k-swing": 53, "10k-lift": 95 }), trainingMaxes: {} }),
};

// ───────────────────────── AlphaDestiny Novice ─────────────────────────

const UP: Weights = { lb: 5, kg: 2.5 };
const SQ: Weights = { lb: 10, kg: 5 };
const DL: Weights = { lb: 20, kg: 10 };

export const alphaDestinyNovice: ProgramTemplate = {
  id: "alphadestiny-novice",
  name: "AlphaDestiny Novice Program",
  author: "Alex Leonidas (AlphaDestiny)",
  source: "AlphaDestiny (YouTube), as written up by LiftVault \"AlphaDestiny Novice Program\"",
  summary: "A/B full body three days a week built on box squats, paused presses and rows for 3×4–6: add weight once the sets fill up, with arm and core work in rep ranges.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  then: { when: "Stay on it until novice gains slow (often 6–15 months; 225×5 bench, 315×5 squat, 405×5 deadlift is a common marker), then move to an intermediate program.", id: "531" },
  options: [{ key: "sets", label: "Main-lift sets", default: "3", choices: [{ value: "3", label: "3 sets of 4–6" }, { value: "5", label: "5 sets of 4–6" }] }],
  build(o) {
    const n = Number(o.sets ?? 3);
    const main = (id: string, lift: string, inc: Weights, note?: string) => dbl(id, lift, n, 4, 6, inc, "MAIN", note);
    const plank = (id: string) => fixed(id, "plank", 3, 1, undefined, "weighted, 30–60 s");
    return {
      templateId: "alphadestiny-novice",
      name: "AlphaDestiny Novice",
      sessionsPerWeek: 3,
      days: [
        { id: "A", name: "Workout A · Box squat / Paused bench / Row", slots: [
          main("ad-sq", "boxSquat", SQ), main("ad-bench", "pauseBench", UP), main("ad-row", "pendlayRow", UP),
          dbl("ad-tri", "overheadTricep", 3, 6, 10, UP, "ACC", "barbell overhead extension"), dbl("ad-curl", "preacherCurl", 3, 6, 10, UP),
          dbl("ad-sldl", "stiffLegDeadlift", 2, 6, 10, SQ, "ACC", "or good mornings, 2–3 sets"), plank("ad-plank-a"),
        ] },
        { id: "B", name: "Workout B · Box squat / Paused press / Trap-bar deadlift", slots: [
          main("ad-sq", "boxSquat", SQ), main("ad-ohp", "ohp", UP, "paused"), dbl("ad-dl", "trapBarDeadlift", 2, 4, 6, DL, "MAIN"),
          dbl("ad-cgbench", "cgBench", 3, 6, 8, UP), dbl("ad-chin", "chinUp", 3, 3, 5, UP, "ACC", "weighted"), plank("ad-plank-b"),
        ] },
      ],
      notes: [
        "Alternate A and B on Monday, Wednesday and Friday (ABA, then BAB).",
        "Main lifts: 3 sets of 4–6 (or 5 sets if you recover well). Once every set hits 6 (about 15–18 total reps with 3 sets, 25–30 with 5), add weight: squat 5–10 lb, deadlift 10–20 lb, presses and rows 5–10 lb. Smaller jumps as it gets heavy.",
        "Stalled for two sessions or more: drop that lift about 10% and build back up.",
      ],
    };
  },
  defaults: (unit) => ({
    startWeights: conv(unit, { "ad-sq": 135, "ad-bench": 115, "ad-row": 95, "ad-tri": 45, "ad-curl": 45, "ad-sldl": 95, "ad-plank-a": 0, "ad-ohp": 75, "ad-dl": 185, "ad-cgbench": 95, "ad-chin": 0, "ad-plank-b": 0 }),
    trainingMaxes: {},
  }),
};

// ───────────────────────── Bromley 100 lbs in 10 Weeks ─────────────────────────

const P = (pct: number, reps: number, amrap = false): PercentSet => ({ pct: pct / 100, reps, amrap });
const rep = (n: number, s: PercentSet): PercentSet[] => Array.from({ length: n }, (_, i) => ({ ...s, amrap: s.amrap && i === n - 1 }));
/** squat and push press: last set for max reps */
const BROM_MAIN: PercentSet[][] = [rep(3, P(70, 5, true)), rep(5, P(75, 5, true)), rep(4, P(78, 4, true)), rep(3, P(83, 3, true)), [P(88, 3, true)]];
const BROM_DL: PercentSet[][] = [rep(3, P(65, 6)), rep(4, P(70, 6)), rep(5, P(75, 5)), rep(4, P(80, 4)), rep(3, P(85, 3))];
/** work up to a top set: no %, you pick the load */
const top = (reps: number): PercentSet[] => [{ reps, amrap: false }];
const BROM_TOP_PUSH = [top(5), top(3), top(5), top(5), top(1)];
const BROM_TOP_SQ = [top(5), top(3), top(5), top(3), top(1)];

/** 10 weeks = the 5-week wave twice; the week-5 1×3+ re-sets the max (e1RM) for weeks 6–10. */
function wave(lift: string, id: string, w5: PercentSet[][]): SlotDef[] {
  const twice = [...w5, ...w5];
  const test = [4, 9];
  return [
    { id, lift, tier: "MAIN", progression: { kind: "percent", tmLift: lift, weeks: twice.map((t, w) => (test.includes(w) ? [] : t)) } },
    { id: `${id}-test`, lift, tier: "MAIN", note: "all-out triple: your new max is estimated from it", progression: { kind: "percent", tmLift: lift, weeks: twice.map((t, w) => (test.includes(w) ? t : [])), tmRule: { type: "e1rm", setIndex: 0, pct: 1 } } },
  ];
}
const plain = (lift: string, id: string, w5: PercentSet[][], note?: string): SlotDef => ({ id, lift, tier: "MAIN", note, progression: { kind: "percent", tmLift: lift, weeks: [...w5, ...w5] } });

export const bromley100: ProgramTemplate = {
  id: "bromley-100lb-squat",
  name: "Bromley 100 lbs in 10 Weeks (Squat)",
  author: "Alex Bromley (Empire Barbell)",
  source: "Empire Barbell free PDF · LiftVault \"100 lbs in 10 Weeks Squat Program\" sheet",
  summary: "A squat-focused powerbuilding wave run twice: ass-to-grass squats and push presses from 3×5 @ 70% to a 1×3+ @ 88%, deadlifts alongside, then again from your new maxes.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 10,
  then: { when: "After the second wave, deload for a week and test; then move to a general program for a while before running it again." },
  options: [],
  build() {
    const acc = (id: string, lift: string, sets: number, reps: number, repsMax: number | undefined, weeks: string) => fixed(id, lift, sets, reps, repsMax, `weeks 1–5: ${weeks}`);
    return {
      templateId: "bromley-100lb-squat",
      name: "Bromley 100 lb Squat",
      sessionsPerWeek: 4,
      maxLabel: "1RM",
      days: [
        { id: "D1", name: "Day 1 · Push", slots: [
          ...wave("pushPress", "br-pp", BROM_MAIN),
          acc("br-press", "ohp", 3, 10, undefined, "3×10, 5×10, 8×8, 4×6, 3×5"),
          maxSets("br-dip", "dip", 3, "max reps; 3, 4, 5, 4, 3 sets by week; superset with the pulldown"),
          acc("br-pd", "latPulldown", 3, 8, 10, "close grip, 3×8–10, 4×8–10, 5×8–10, 4×8, 3×6"),
          acc("br-band", "tricepPushdown", 3, 50, undefined, "band, 3×50, 4×50, 5×50, 4×30, 3×20"),
          acc("br-skull", "skullcrusher", 3, 15, undefined, "3×15, 4×15, 5×15, 4×12, 3×12"),
        ] },
        { id: "D2", name: "Day 2 · Squat", slots: [
          ...wave("squat", "br-sq", BROM_MAIN),
          acc("br-fsq", "frontSquat", 3, 10, undefined, "ass to grass, 3×10, 5×10, 8×8, 4×6, 3×5"),
          acc("br-rdl", "rdl", 3, 6, undefined, "5-1-0 tempo, 3×6, 4×6, 6×5, 5×4, 3×4"),
          acc("br-lp", "legPress", 3, 15, undefined, "superset with curls, 3×15, 4×15, 5×12, 4×12, 3×10"),
          acc("br-curl", "legCurl", 3, 15, undefined, "3×15, 4×15, 5×12, 4×12, 3×10"),
        ] },
        { id: "D3", name: "Day 3 · Push top set", slots: [
          plain("pushPress", "br-pp-top", BROM_TOP_PUSH, "work up to a top set: max 5, 3, 5, 5 (reverse band), 1; no missed reps"),
          acc("br-incline", "inclineBench", 3, 6, undefined, "close grip, chains, 3×6, 4×6, 6×5, 4×4, 3×3"),
          acc("br-arnold", "arnoldPress", 3, 12, 15, "3×12–15, 4×12–15, 5×10–12, 4×10, 3×8–10"),
          acc("br-row", "row", 3, 10, 12, "superset with raises, 3×10–12, 4×10–12, 5×10, 4×8, 3×8"),
          acc("br-raise", "rearDeltFly", 3, 12, 15, "bent raise, 3×12–15, 4×12, 5×12, 4×10, 3×10"),
          acc("br-skull2", "skullcrusher", 3, 10, 12, "superset with bench dips, 3×10–12, 4×10, 5×10, 4×8–10, 3×8"),
          maxSets("br-bdip", "dip", 3, "bench dips, max reps; 3, 4, 5, 4, 3 sets by week"),
        ] },
        { id: "D4", name: "Day 4 · Squat top set & pull", slots: [
          plain("squat", "br-sq-top", BROM_TOP_SQ, "work up to a top set: max 5, 3, 5, 3, 1; keep your technique"),
          plain("deadlift", "br-dl", BROM_DL),
          acc("br-gm", "goodMorning", 3, 8, undefined, "safety bar, pause at pins, 3×8, 4×8, 5×6, 3×6, 3×5"),
          acc("br-lunge", "lunge", 3, 12, undefined, "alternating DB, per leg, 3×12, 4×10, 5×10, 4×8, 3×8"),
          acc("br-ghd", "backExtension", 3, 12, undefined, "pause at the top, add weight, 3×12, 4×12, 5×10, 4×10, 3×8"),
        ] },
      ],
      cycle: { weeks: 10, finite: true, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5 · AMRAP", "Week 6 (wave 2)", "Week 7", "Week 8", "Week 9", "Week 10 · AMRAP"] },
      notes: [
        "Enter 1RMs for squat, push press and deadlift; a slightly conservative number works better than an optimistic one.",
        "The last set of squats and push presses is for max reps every week. Week 5's 1×3+ at 88% sets a new max for the second wave (weeks 6–10).",
        "Take a light week between the waves if you need it. Accessory sets change week to week; each one lists all five weeks.",
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: conv(unit, { squat: 300, pushPress: 135, deadlift: 365 }), startWeights: {} };
  },
};

export const COACH_TEMPLATES = [danJohn40, tenKSwings, alphaDestinyNovice, bromley100];
