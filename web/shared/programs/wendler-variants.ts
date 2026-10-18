// More 5/3/1 templates. Percentages are of the training max (TM).
//
// - 5/3/1 for Beginners: Wendler's blog template as written up in the r/Fitness wiki
//   (thefitness.wiki/routines/5-3-1-for-beginners). Mon squat+bench, Wed deadlift+press, Fri
//   bench+squat; 5/3/1 sets with AMRAP + FSL 5×5; no deload; TM 90%, +5/+10 lb every 3-week cycle;
//   50–100 reps each of push, pull and single-leg/core every day.
// - Building the Monolith: jimwendler.com "Building the Monolith – 5/3/1 for Size" (set/rep/%
//   structure cross-checked with Liftosaur's version, which prints the same loads as % of 1RM).
//   6 weeks, 3 days. Wendler says to "adjust TM" after week 3 without an amount; we use the standard
//   +5 lb upper / +10 lb lower (as Liftosaur does). Suggested TM: "lower than you think (85%)".
// - Boring But Big 3-Month Challenge: jimwendler.com "Boring But Big, 3 Month Challenge". Main
//   5/3/1 sets for the prescribed reps only (no AMRAPs), then 5×10 of the same lift at 50% / 60% /
//   70% of TM in months 1 / 2 / 3; one push, one pull and one ab movement a day, 25–50 reps each
//   (the prose says 25–30). The post doesn't mention deloads or TM increases, so "month" = the
//   book's 4-week cycle (3 weeks + deload) with the standard +5/+10 TM bump after each month
//   (deload can be switched off). BBB stays 5×10 in the deload, as on jimwendler.com's BBB page.
// - 5/3/1 5's PRO + FSL / BBS / SSL: 5/3/1 Forever leader-style template (from memory of the book +
//   Wendler's blog on FSL vs BBB): every main set is 5 reps at the usual 5/3/1 percentages, then
//   FSL 5×5, Boring But Strong 10×5 at the FSL weight, or Second Set Last 5×5. TM 85%, +5/+10 per
//   cycle. Forever assistance: 50–100 push, 50–100 pull, 0–50 single-leg/core per session.
// - 5/3/1 2-day / 3-day: the original book's layouts. 2-day pairs squat+bench and deadlift+press;
//   3-day rotates the four lifts through three sessions a week, so a "week" of the cycle is four
//   sessions and the calendar drifts (Mon press, Wed deadlift, Fri bench, next Mon squat…).
//
// Krypteia and CAP-style e1RM rules aren't here (not verified / need engine support).

import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, Weights } from "../program";
import type { Unit } from "../units";
import { MAIN, rep, supplemental } from "./wendler531";

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const P = (pct: number, reps: number, amrap = false): PercentSet => ({ pct: pct / 100, reps, amrap });
const UP: Weights = { lb: 5, kg: 2.5 };
const LOW: Weights = { lb: 10, kg: 5 };
const TM_UP = { ohp: UP, bench: UP, squat: LOW, deadlift: LOW };

function defaults(pctOf1rm: number) {
  return (unit: Unit) => {
    const orm = { squat: 315, bench: 225, deadlift: 385, ohp: 145 };
    return { trainingMaxes: Object.fromEntries(Object.entries(orm).map(([k, v]) => { const lb = Math.round((v * pctOf1rm) / 5) * 5; return [k, unit === "lb" ? lb : kg(lb)]; })), startWeights: {} };
  };
}

const pct = (lift: string, id: string, weeks: PercentSet[][], tier: Tier = "MAIN", tmLift = lift, note?: string): SlotDef => ({ id, lift, tier, note, progression: { kind: "percent", tmLift, weeks } });
const fixed = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string): SlotDef => ({ id, lift, tier: "ACC", progression: { kind: "fixed", sets, reps, repsMax, note } });

const liftName = (l: string) => ({ ohp: "Press", bench: "Bench", squat: "Squat", deadlift: "Deadlift" })[l] ?? l;

// ───────────────────────── 5/3/1 for Beginners ─────────────────────────

const AMRAP3 = MAIN.slice(0, 3);
const FSL3 = AMRAP3.map((wk) => rep(5, { pct: wk[0].pct, reps: 5 }));
const ACC_NOTE = "50–100 total reps";

export const wendlerBeginners: ProgramTemplate = {
  id: "531-beginners",
  name: "5/3/1 for Beginners",
  author: "Jim Wendler",
  source: "Wendler's 5/3/1 for Beginners (blog) as published in the r/Fitness wiki",
  summary: "Full-body 5/3/1 three days a week: two main lifts per day with 5/3/1 sets and 5×5 First Set Last, TM up every 3-week cycle, plus push/pull/core assistance.",
  category: "novice",
  level: "beginner",
  daysPerWeek: [3],
  options: [],
  build() {
    const lift = (d: string, l: string) => [pct(l, `b${d}-${l}`, AMRAP3), pct(l, `b${d}-${l}-fsl`, FSL3, "SUPP")];
    const acc = (d: string, push: string, pull: string, leg: string) => [
      fixed(`b${d}-push`, push, 5, 10, 20, ACC_NOTE), fixed(`b${d}-pull`, pull, 5, 10, 20, ACC_NOTE), fixed(`b${d}-leg`, leg, 5, 10, 20, ACC_NOTE),
    ];
    return {
      templateId: "531-beginners",
      name: "5/3/1 for Beginners",
      sessionsPerWeek: 3,
      maxLabel: "Training max",
      days: [
        { id: "1", name: "Day 1 · Squat / Bench", slots: [...lift("1", "squat"), ...lift("1", "bench"), ...acc("1", "dip", "chinUp", "lunge")] },
        { id: "2", name: "Day 2 · Deadlift / Press", slots: [...lift("2", "deadlift"), ...lift("2", "ohp"), ...acc("2", "pushUp", "dbRow", "hangingLegRaise")] },
        { id: "3", name: "Day 3 · Bench / Squat", slots: [...lift("3", "bench"), ...lift("3", "squat"), ...acc("3", "dip", "chinUp", "abWheel")] },
      ],
      cycle: { weeks: 3, weekNames: ["5s week", "3s week", "5/3/1 week"], tmIncrease: TM_UP },
      notes: [
        "TM = 90% of your 1RM. Don't grind the + sets; leave a rep in the tank.",
        "TM goes up every cycle no matter what: +5 lb press/bench, +10 lb squat/deadlift. If you keep missing reps for a whole cycle, drop that TM by 15 lb (upper) / 30 lb (lower).",
        "Before lifting: 10–15 jumps or throws. Assistance: 50–100 reps each of push, pull and single-leg/core; any exercise works.",
        "Optional: every 4th cycle, take a TM-test / deload week.",
      ],
    };
  },
  defaults: defaults(0.9),
};

// ───────────────────────── Building the Monolith ─────────────────────────

const WAVE = [[70, 80, 90], [65, 75, 85], [75, 85, 95]];
const MONO_WEEKS = [0, 1, 2, 0, 1, 2].map((w) => WAVE[w]);
const ramp = (topSets: number) => MONO_WEEKS.map(([a, b, c]) => [P(a, 5), P(b, 5), ...Array.from({ length: topSets }, () => P(c, 5))]);
const WIDOWMAKER = [45, 55, 55, 50, 65, 70];
const FRI_PRESS: [number, number][] = [[10, 70], [10, 50], [10, 75], [12, 60], [15, 65], [12, 75]];

export const monolith: ProgramTemplate = {
  id: "531-monolith",
  name: "5/3/1 Building the Monolith",
  author: "Jim Wendler",
  source: "jimwendler.com: Building the Monolith – 5/3/1 for Size (cross-checked with Liftosaur)",
  summary: "Six-week, three-day size block: squat twice a week (ending in a 20-rep set), high-volume pressing, and 100-rep chin, dip and face-pull work.",
  category: "hypertrophy",
  level: "advanced",
  daysPerWeek: [3],
  weeks: 6,
  options: [],
  build() {
    const monPress = MONO_WEEKS.map(([a, b, c]) => [P(a, 5), P(b, 5), P(c, 5), P(a, 5, true)]);
    const friSquat = MONO_WEEKS.map(([a, b, c], w) => [P(a, 5), P(b, 5), P(c, 5), P(WIDOWMAKER[w], 20)]);
    const friPress = FRI_PRESS.map(([n, p]) => Array.from({ length: n }, () => P(p, 5)));
    return {
      templateId: "531-monolith",
      name: "Building the Monolith",
      sessionsPerWeek: 3,
      maxLabel: "Training max",
      // TM goes up after week 3 (fires on the pass boundary, so a missed session can't skip it)
      cycle: { weeks: 6, finite: true, tmIncrease: TM_UP, tmIncreaseEvery: 3, weekNames: ["Week 1", "Week 2", "Week 3", "Week 4 (TM up)", "Week 5", "Week 6"] },
      days: [
        { id: "1", name: "Monday · Squat / Press", slots: [
          pct("squat", "mo1-sq", ramp(5)),
          pct("ohp", "mo1-ohp", monPress),
          fixed("mo1-chin", "chinUp", 5, 20, undefined, "100 total reps"),
          fixed("mo1-fp", "facePull", 5, 20, undefined, "100 total reps (or band pull-aparts)"),
          fixed("mo1-dip", "dip", 5, 20, 40, "100–200 total reps"),
        ] },
        { id: "2", name: "Wednesday · Deadlift / Bench", slots: [
          pct("deadlift", "mo2-dl", ramp(3)),
          pct("bench", "mo2-bp", ramp(5)),
          { id: "mo2-row", lift: "dbRow", tier: "ACC", progression: { kind: "double", sets: 5, reps: [10, 20], increment: { lb: 5, kg: 2 } } },
          fixed("mo2-curl", "bicepCurl", 5, 20, undefined, "100 total reps"),
        ] },
        { id: "3", name: "Friday · Squat (20 reps) / Press volume", slots: [
          pct("squat", "mo3-sq", friSquat),
          pct("ohp", "mo3-ohp", friPress),
          fixed("mo3-chin", "chinUp", 5, 5, undefined, "weighted"),
          fixed("mo3-fp", "facePull", 5, 20, undefined, "100 total reps (or band pull-aparts)"),
          fixed("mo3-shrug", "shrug", 5, 20, undefined, "100 total reps"),
        ] },
      ],
      notes: [
        "Start with a TM of about 85% of your 1RM. After week 3 the TM goes up (+5 lb press/bench, +10 lb squat/deadlift) and weeks 4–6 repeat the waves.",
        "Only the first three exercises each day are required. Use a safety-squat bar for the 20-rep set if you like.",
        "No joker sets, and don't superset the main lifts.",
        "After the six weeks, move to a less demanding template (a deload week first is common).",
      ],
    };
  },
  defaults: defaults(0.85),
};

// ───────────────────────── Boring But Big 3-Month Challenge ─────────────────────────

const STRAIGHT: PercentSet[][] = MAIN.map((wk) => wk.map((s) => ({ ...s, amrap: false })));

export const bbbChallenge: ProgramTemplate = {
  id: "531-bbb-challenge",
  name: "Boring But Big 3-Month Challenge",
  author: "Jim Wendler",
  source: "jimwendler.com: Boring But Big, 3 Month Challenge",
  summary: "Three months of 5/3/1 (prescribed reps only) plus 5×10 of the same lift, climbing from 50% to 60% to 70% of TM month by month.",
  category: "hypertrophy",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 12,
  options: [
    { key: "deload", label: "Deload week", default: "on", choices: [{ value: "on", label: "Every 4th week (12 weeks)" }, { value: "off", label: "None (3-week months, 9 weeks)" }] },
  ],
  build(o) {
    const deload = (o.deload ?? "on") === "on";
    const per = deload ? 4 : 3;
    const total = per * 3;
    const main = Array.from({ length: total }, (_, w) => STRAIGHT[w % per]);
    const bbb = Array.from({ length: total }, (_, w) => rep(5, P(50 + 10 * Math.floor(w / per), 10)));
    const day = (id: string, lift: string, push: string, acc: string): DayDef => ({
      id, name: `Day ${id} · ${liftName(lift)}`,
      slots: [
        pct(lift, `bc${id}-main`, main),
        pct(lift, `bc${id}-bbb`, bbb, "SUPP"),
        fixed(`bc${id}-push`, push, 5, 5, 10, "25–50 total reps, any push"),
        fixed(`bc${id}-acc`, acc, 5, 5, 10, "25–50 total reps"),
        fixed(`bc${id}-abs`, "hangingLegRaise", 5, 5, 10, "25–50 total reps, any ab exercise"),
      ],
    });
    const names = Array.from({ length: total }, (_, w) => `Month ${Math.floor(w / per) + 1} · ${["5s", "3s", "5/3/1", "Deload"][w % per]}`);
    return {
      templateId: "531-bbb-challenge",
      name: "BBB 3-Month Challenge",
      sessionsPerWeek: 4,
      maxLabel: "Training max",
      // TM up after each month (pass boundary, so a missed session can't skip it)
      cycle: { weeks: total, finite: true, tmIncrease: TM_UP, tmIncreaseEvery: per, weekNames: names },
      days: [day("1", "ohp", "dip", "chinUp"), day("2", "deadlift", "pushUp", "facePull"), day("3", "bench", "dip", "chinUp"), day("4", "squat", "pushUp", "facePull")],
      notes: [
        "Main sets are for the prescribed reps only — no AMRAPs. BBB is 5×10 of the same lift: 50% of TM in month 1, 60% in month 2, 70% in month 3.",
        "TM goes up +5 lb press/bench, +10 lb squat/deadlift at the end of each month.",
        "Deload weeks keep BBB at 5×10 (or cut it to 3×10).",
        "Assistance should be easy: one push, one pull (chins/rows on press and bench days, face pulls on squat and deadlift days) and abs every day, 25–50 reps each. Walk or push the Prowler for conditioning.",
      ],
    };
  },
  defaults: defaults(0.9),
};

// ───────────────────────── 5's PRO + FSL / BBS / SSL ─────────────────────────

const FIVES: PercentSet[][] = MAIN.slice(0, 3).map((wk) => wk.map((s) => ({ pct: s.pct, reps: 5 })));

export const fivesPro: ProgramTemplate = {
  id: "531-fives-pro",
  name: "5/3/1 5's PRO + FSL / BBS",
  author: "Jim Wendler",
  source: "5/3/1 Forever (book, from memory) · jimwendler.com: 5x5 First Set Last vs Boring But Big",
  summary: "The Forever-era staple: 5 reps on every main set (no AMRAPs), then First Set Last 5×5, Boring But Strong 10×5 or Second Set Last 5×5, with push/pull/core assistance.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [
    { key: "supp", label: "Supplemental", default: "fsl", choices: [
      { value: "fsl", label: "First Set Last 5×5" },
      { value: "bbs", label: "Boring But Strong 10×5 @ FSL" },
      { value: "ssl", label: "Second Set Last 5×5" },
    ] },
    { key: "acc", label: "Assistance", default: "on", choices: [{ value: "on", label: "Push / pull / single-leg-core" }, { value: "off", label: "None" }] },
  ],
  build(o) {
    const opts = { supp: "fsl", acc: "on", ...o };
    const setIdx = opts.supp === "ssl" ? 1 : 0;
    const n = opts.supp === "bbs" ? 10 : 5;
    const supp = FIVES.map((wk) => rep(n, { pct: wk[setIdx].pct, reps: 5 }));
    const accs: Record<string, [string, string, string]> = { squat: ["dip", "chinUp", "abWheel"], bench: ["pushUp", "dbRow", "lunge"], deadlift: ["dip", "chinUp", "hangingLegRaise"], ohp: ["pushUp", "dbRow", "bulgarianSplitSquat"] };
    const day = (id: string, lift: string): DayDef => {
      const [push, pull, leg] = accs[lift];
      const slots = [pct(lift, `fp${id}-main`, FIVES), pct(lift, `fp${id}-supp`, supp, "SUPP")];
      if (opts.acc === "on") slots.push(fixed(`fp${id}-push`, push, 5, 10, 20, "50–100 total reps"), fixed(`fp${id}-pull`, pull, 5, 10, 20, "50–100 total reps"), fixed(`fp${id}-leg`, leg, 5, 5, 10, "0–50 total reps (optional)"));
      return { id, name: `Day ${id} · ${liftName(lift)}`, slots };
    };
    const label = { fsl: "FSL", bbs: "BBS", ssl: "SSL" }[opts.supp] ?? "FSL";
    return {
      templateId: "531-fives-pro",
      name: `5's PRO + ${label}`,
      sessionsPerWeek: 4,
      maxLabel: "Training max",
      days: [day("1", "squat"), day("2", "bench"), day("3", "deadlift"), day("4", "ohp")],
      cycle: { weeks: 3, weekNames: ["Week 1 (65/75/85)", "Week 2 (70/80/90)", "Week 3 (75/85/95)"], tmIncrease: TM_UP },
      notes: [
        "TM = 85% of your 1RM. Every main set is 5 clean reps; no AMRAPs. TM +5 lb press/bench, +10 lb squat/deadlift each cycle.",
        "Forever: run two of these cycles, then a 7th-week deload or TM test before the next block.",
      ],
    };
  },
  defaults: defaults(0.85),
};

// ───────────────────────── 2-day / 3-day ─────────────────────────

export const wendlerShort: ProgramTemplate = {
  id: "531-2-3day",
  name: "5/3/1 2-Day / 3-Day",
  author: "Jim Wendler",
  source: "5/3/1 (2009 book) training-week layouts · Wendler 5-3-1 v1.3 sheet percentages",
  summary: "Classic 5/3/1 waves on fewer training days: two lifts per session twice a week, or the four lifts rotating through three sessions a week.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [2, 3],
  options: [
    { key: "days", label: "Days per week", default: "3", choices: [{ value: "3", label: "3 days (lifts rotate)" }, { value: "2", label: "2 days (squat+bench, deadlift+press)" }] },
    { key: "supp", label: "Supplemental", default: "fsl", choices: [
      { value: "fsl", label: "First Set Last 5×5" },
      { value: "bbb", label: "Boring But Big 5×10 @ 50%" },
      { value: "none", label: "None" },
    ] },
    { key: "deload", label: "Deload week", default: "on", choices: [{ value: "on", label: "Every 4th week" }, { value: "off", label: "Skip (3-week cycles)" }] },
  ],
  build(o) {
    const opts = { days: "3", supp: "fsl", deload: "on", ...o };
    const deload = opts.deload === "on";
    const weeks = deload ? MAIN : MAIN.slice(0, 3);
    const supp = supplemental(opts.supp, deload);
    const lift = (pre: string, l: string): SlotDef[] => {
      const s = [pct(l, `${pre}-${l}`, weeks)];
      if (supp) s.push(pct(l, `${pre}-${l}-supp`, supp, "SUPP"));
      return s;
    };
    const two = opts.days === "2";
    const days: DayDef[] = two
      ? [
          { id: "1", name: "Day 1 · Squat / Bench", slots: [...lift("s1", "squat"), ...lift("s1", "bench")] },
          { id: "2", name: "Day 2 · Deadlift / Press", slots: [...lift("s2", "deadlift"), ...lift("s2", "ohp")] },
        ]
      : ["ohp", "deadlift", "bench", "squat"].map((l, i) => ({ id: String(i + 1), name: `Session ${i + 1} · ${liftName(l)}`, slots: lift(`r${i + 1}`, l) }));
    return {
      templateId: "531-2-3day",
      name: `5/3/1 ${opts.days}-Day`,
      sessionsPerWeek: two ? 2 : 3,
      maxLabel: "Training max",
      days,
      cycle: { weeks: weeks.length, weekNames: ["5s week", "3s week", "5/3/1 week", "Deload"], tmIncrease: TM_UP },
      notes: two
        ? ["TM = 90% of your 1RM. Two lifts per session; TM +5 lb press/bench, +10 lb squat/deadlift each cycle."]
        : ["TM = 90% of your 1RM. One lift per session, rotating press → deadlift → bench → squat, so a 'week' of the cycle takes four sessions (about 1⅓ calendar weeks).", "TM +5 lb press/bench, +10 lb squat/deadlift each cycle."],
    };
  },
  defaults: defaults(0.9),
};
