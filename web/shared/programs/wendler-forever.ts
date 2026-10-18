// 5/3/1 Forever's Leader / Anchor cycling, and three original-book assistance templates.
// Percentages are of the training max (TM).
//
// - Leader / Anchor: 5/3/1 Forever runs in phases. Leaders are volume blocks (5's PRO main sets +
//   BBB, BBS, FSL or SSL); anchors are intensity blocks (5/3/1 PR sets + First Set Last). The
//   default 2/1 chain is Leader, Leader, 7th-week deload, Anchor, 7th-week TM test, then again from
//   the top, so the program never ends: an 11-week cycle (14 with two anchors). The TM goes up after
//   every 3-week leader or anchor block (+5 lb upper / +10 lb lower), not after the 7th weeks.
//   7th-week deload: 70×5, 80×3–5, 90×1, 100×1. TM test: 70×5, 80×5, 90×5, 100×3–5; fewer than
//   3 reps at 100% means the TM is too high. Sources: LiftVault "The 7th Week Protocol",
//   Boostcamp's public "Wendler 5/3/1 Deload Week", r/531Discussion; leader/anchor counts (2/1, 2/2)
//   as summarised from the book in public reviews. TM 85% of 1RM.
// - Triumvirate (5/3/1, 2009): main lift + two assistance lifts, 5 sets each. LiftVault "The
//   Triumvirate" lists the book's pairings.
// - Periodization Bible (Dave Tate, in 5/3/1): main lift + one exercise from each of three
//   categories, 5×10–20. LiftVault "The Periodization Bible Template".
// - I'm Not Doing Jack Shit (5/3/1): the main lift and nothing else. LiftVault.

import type { DayDef, PercentSet, ProgramDef, ProgramTemplate, SlotDef, Tier, Weights } from "../program";
import type { Unit } from "../units";
import { MAIN, rep } from "./wendler531";

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const P = (pct: number, reps: number, extra: Partial<PercentSet> = {}): PercentSet => ({ pct: pct / 100, reps, ...extra });
const UP: Weights = { lb: 5, kg: 2.5 };
const LOW: Weights = { lb: 10, kg: 5 };
const TM_UP = { ohp: UP, bench: UP, squat: LOW, deadlift: LOW };
const liftName = (l: string) => ({ ohp: "Press", bench: "Bench", squat: "Squat", deadlift: "Deadlift" })[l] ?? l;

function defaults(pctOf1rm: number) {
  return (unit: Unit) => {
    const orm = { squat: 315, bench: 225, deadlift: 385, ohp: 145 };
    return { trainingMaxes: Object.fromEntries(Object.entries(orm).map(([k, v]) => { const lb = Math.round((v * pctOf1rm) / 5) * 5; return [k, unit === "lb" ? lb : kg(lb)]; })), startWeights: {} };
  };
}

const pct = (lift: string, id: string, weeks: PercentSet[][], tier: Tier = "MAIN", note?: string): SlotDef => ({ id, lift, tier, note, progression: { kind: "percent", tmLift: lift, weeks } });
const fixed = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string): SlotDef => ({ id, lift, tier: "ACC", progression: { kind: "fixed", sets, reps, repsMax, note } });

// ───────────────────────── Leader / Anchor ─────────────────────────

const FIVES_PRO: PercentSet[][] = MAIN.slice(0, 3).map((wk) => wk.map((s) => ({ pct: s.pct, reps: 5 })));
const PR_SETS: PercentSet[][] = MAIN.slice(0, 3);
export const DELOAD_7TH: PercentSet[] = [P(70, 5), P(80, 3, { repsMax: 5 }), P(90, 1), P(100, 1)];
export const TM_TEST: PercentSet[] = [P(70, 5), P(80, 5), P(90, 5), P(100, 3, { repsMax: 5 })];

type Phase = "leader" | "deload" | "anchor" | "test";

/** The weeks of one lap: each 3-week block is a leader or anchor, each 7th week a deload or TM test. */
function phases(plan: string): { phase: Phase; block: number; wk: number }[] {
  const [leaders, anchors] = plan.split("-").map(Number);
  const out: { phase: Phase; block: number; wk: number }[] = [];
  for (let b = 0; b < leaders; b++) for (let w = 0; w < 3; w++) out.push({ phase: "leader", block: b, wk: w });
  out.push({ phase: "deload", block: 0, wk: 0 });
  for (let b = 0; b < anchors; b++) for (let w = 0; w < 3; w++) out.push({ phase: "anchor", block: b, wk: w });
  out.push({ phase: "test", block: 0, wk: 0 });
  return out;
}

const LEADER_SUPP: Record<string, { label: string; sets: (wk: number) => PercentSet[] }> = {
  bbb: { label: "BBB", sets: () => rep(5, P(50, 10)) },
  bbb60: { label: "BBB 60%", sets: () => rep(5, P(60, 10)) },
  bbs: { label: "BBS", sets: (wk) => rep(10, { pct: FIVES_PRO[wk][0].pct, reps: 5 }) },
  fsl: { label: "FSL", sets: (wk) => rep(5, { pct: FIVES_PRO[wk][0].pct, reps: 5 }) },
  ssl: { label: "SSL", sets: (wk) => rep(5, { pct: FIVES_PRO[wk][1].pct, reps: 5 }) },
};

export const wendlerForever: ProgramTemplate = {
  id: "531-forever",
  name: "5/3/1 Forever: Leader / Anchor",
  author: "Jim Wendler",
  source: "5/3/1 Forever (book) as summarised publicly: LiftVault \"The 7th Week Protocol\", r/531Discussion",
  summary: "The never-ending 5/3/1: two volume Leader blocks (5's PRO + BBB, BBS, FSL or SSL), a 7th-week deload, an intensity Anchor block (PR sets + FSL), a 7th-week TM test, repeat.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  then: { when: "It doesn't end: after the TM test it starts again with the next Leader. Swap the leader and anchor templates every lap or two to keep it fresh." },
  options: [
    { key: "leader", label: "Leader supplemental", default: "bbb", choices: [
      { value: "bbb", label: "Boring But Big 5×10 @ 50%" },
      { value: "bbb60", label: "Boring But Big 5×10 @ 60%" },
      { value: "bbs", label: "Boring But Strong 10×5 @ FSL" },
      { value: "fsl", label: "First Set Last 5×5" },
      { value: "ssl", label: "Second Set Last 5×5" },
    ] },
    { key: "anchor", label: "Anchor", default: "pr-fsl", choices: [
      { value: "pr-fsl", label: "5/3/1 PR sets + FSL 5×5" },
      { value: "pr", label: "5/3/1 PR sets only" },
      { value: "fives-fsl", label: "5's PRO + FSL 5×5" },
    ] },
    { key: "plan", label: "Leaders / anchors", default: "2-1", choices: [
      { value: "2-1", label: "2 leaders, 1 anchor (11 weeks a lap)" },
      { value: "2-2", label: "2 leaders, 2 anchors (14 weeks a lap)" },
    ] },
    { key: "acc", label: "Assistance", default: "on", choices: [{ value: "on", label: "Push / pull / single-leg-core" }, { value: "off", label: "None" }] },
  ],
  build(o) {
    const opts = { leader: "bbb", anchor: "pr-fsl", plan: "2-1", acc: "on", ...o };
    const lap = phases(opts.plan);
    const ls = LEADER_SUPP[opts.leader] ?? LEADER_SUPP.bbb;
    const anchorMain = opts.anchor === "fives-fsl" ? FIVES_PRO : PR_SETS;
    const only = (ph: Phase, f: (wk: number) => PercentSet[]) => lap.map((x) => (x.phase === ph ? f(x.wk) : []));
    const accs: Record<string, [string, string, string]> = { ohp: ["dip", "chinUp", "lunge"], deadlift: ["pushUp", "dbRow", "hangingLegRaise"], bench: ["dip", "chinUp", "bulgarianSplitSquat"], squat: ["pushUp", "dbRow", "abWheel"] };
    const day = (id: string, lift: string): DayDef => {
      const slots: SlotDef[] = [
        pct(lift, `lf${id}-leader`, only("leader", (w) => FIVES_PRO[w]), "MAIN", "Leader: 5's PRO, every set 5 reps"),
        pct(lift, `lf${id}-ls`, only("leader", ls.sets), "SUPP"),
        pct(lift, `lf${id}-anchor`, only("anchor", (w) => anchorMain[w]), "MAIN", opts.anchor === "fives-fsl" ? "Anchor: 5's PRO" : "Anchor: PR sets, last set for as many reps as you can"),
        pct(lift, `lf${id}-deload`, only("deload", () => DELOAD_7TH), "MAIN", "7th week deload"),
        pct(lift, `lf${id}-test`, only("test", () => TM_TEST), "MAIN", "TM test: 3–5 reps at 100% means the TM is right; fewer, lower it"),
      ];
      if (opts.anchor !== "pr") slots.push(pct(lift, `lf${id}-as`, only("anchor", (w) => rep(5, { pct: anchorMain[w][0].pct, reps: 5 })), "SUPP"));
      if (opts.acc === "on") {
        const [push, pull, leg] = accs[lift];
        slots.push(fixed(`lf${id}-push`, push, 5, 10, 20, "50–100 total reps"), fixed(`lf${id}-pull`, pull, 5, 10, 20, "50–100 total reps"), fixed(`lf${id}-leg`, leg, 5, 5, 10, "0–50 total reps"));
      }
      return { id, name: `Day ${id} · ${liftName(lift)}`, slots };
    };
    const names = lap.map((x) => x.phase === "deload" ? "7th week · Deload" : x.phase === "test" ? "7th week · TM test"
      : `${x.phase === "leader" ? "Leader" : "Anchor"}${(x.phase === "leader" ? Number(opts.plan[0]) : Number(opts.plan[2])) > 1 ? ` ${x.block + 1}` : ""} · Week ${x.wk + 1}`);
    // TM up after the last week of every leader and anchor block
    const bumps = lap.map((x, i) => ({ x, i })).filter(({ x }) => (x.phase === "leader" || x.phase === "anchor") && x.wk === 2).map(({ i }) => i);
    const def: ProgramDef = {
      templateId: "531-forever",
      name: `5/3/1 Forever ${ls.label} / ${opts.anchor === "pr" ? "PR" : opts.anchor === "fives-fsl" ? "5's PRO FSL" : "PR + FSL"}`,
      sessionsPerWeek: 4,
      maxLabel: "Training max",
      days: [day("1", "squat"), day("2", "bench"), day("3", "deadlift"), day("4", "ohp")],
      cycle: { weeks: lap.length, weekNames: names, tmIncrease: TM_UP, tmIncreaseAt: bumps },
      notes: [
        "TM = 85% of your 1RM. Leaders build volume, anchors push intensity; the 7th weeks reset fatigue and check the TM.",
        "TM +5 lb press/bench, +10 lb squat/deadlift after every 3-week leader or anchor block.",
        "TM test: 3–5 clean reps at 100% of TM means it's right. Fewer than 3: lower that TM in Setup before the next leader.",
        "Leaders: easier conditioning, fewer jumps and throws. Anchors: harder conditioning, more jumps and throws. 10–20 jumps or throws before lifting.",
      ],
    };
    return def;
  },
  defaults: defaults(0.85),
};

// ───────────────────────── Triumvirate ─────────────────────────

/** Classic 5/3/1 main sets (AMRAP last set), with or without the deload week. */
function classic(deload: string): PercentSet[][] {
  return deload === "on" ? MAIN : MAIN.slice(0, 3);
}
const DELOAD_OPT = { key: "deload", label: "Deload week", default: "on", choices: [{ value: "on", label: "Every 4th week" }, { value: "off", label: "Skip (3-week cycles)" }] };
const WEEK_NAMES = ["5s week", "3s week", "5/3/1 week", "Deload"];

function fourDay(templateId: string, name: string, deload: string, extra: (lift: string, id: string) => SlotDef[], notes: string[]): ProgramDef {
  const main = classic(deload);
  return {
    templateId, name,
    sessionsPerWeek: 4,
    maxLabel: "Training max",
    days: ["ohp", "deadlift", "bench", "squat"].map((l, i) => ({ id: String(i + 1), name: `Day ${i + 1} · ${liftName(l)}`, slots: [pct(l, `${templateId}-${i + 1}`, main), ...extra(l, String(i + 1))] })),
    cycle: { weeks: main.length, weekNames: WEEK_NAMES, tmIncrease: TM_UP },
    notes,
  };
}

const TRI: Record<string, [string, number, number][]> = {
  ohp: [["dip", 5, 15], ["chinUp", 5, 10]],
  deadlift: [["goodMorning", 5, 12], ["hangingLegRaise", 5, 15]],
  bench: [["dbBench", 5, 15], ["dbRow", 5, 10]],
  squat: [["legPress", 5, 15], ["legCurl", 5, 10]],
};

export const triumvirate: ProgramTemplate = {
  id: "531-triumvirate",
  name: "5/3/1 Triumvirate",
  author: "Jim Wendler",
  source: "5/3/1 (2009 book), as listed in LiftVault \"The Triumvirate\"",
  summary: "Original-book 5/3/1: one main lift a day, then exactly two assistance exercises for five sets each (dips and chins, good mornings and leg raises…).",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [DELOAD_OPT],
  build(o) {
    return fourDay("531-triumvirate", "5/3/1 Triumvirate", o.deload ?? "on",
      (l, id) => TRI[l].map(([lift, sets, reps], k) => fixed(`tri${id}-a${k + 1}`, lift, sets, reps)),
      [
        "TM = 90% of your 1RM. Main lift: 5/3/1 with the last set for as many reps as you can. TM +5 lb press/bench, +10 lb squat/deadlift each cycle.",
        "Two assistance lifts, five sets each, nothing else. Swap in a similar exercise if you need to; keep the 5-set structure.",
      ]);
  },
  defaults: defaults(0.9),
};

// ───────────────────────── Periodization Bible ─────────────────────────

const BIBLE: Record<string, [string, string][]> = {
  ohp: [["dbBench", "chest or shoulders"], ["chinUp", "lats or upper back"], ["tricepPushdown", "triceps"]],
  deadlift: [["legCurl", "hamstrings"], ["legPress", "quads"], ["hangingLegRaise", "abs"]],
  bench: [["dbOhp", "chest or shoulders"], ["dbRow", "lats or upper back"], ["skullcrusher", "triceps"]],
  squat: [["backExtension", "low back"], ["bulgarianSplitSquat", "quads"], ["abWheel", "abs"]],
};

export const periodizationBible: ProgramTemplate = {
  id: "531-periodization-bible",
  name: "5/3/1 Periodization Bible",
  author: "Jim Wendler (after Dave Tate)",
  source: "5/3/1 (2009 book), as listed in LiftVault \"The Periodization Bible Template\"",
  summary: "Dave Tate's bodybuilding-style assistance on 5/3/1: after the main lift, one exercise from each of three muscle categories for 5×10–20.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [DELOAD_OPT],
  build(o) {
    return fourDay("531-periodization-bible", "5/3/1 Periodization Bible", o.deload ?? "on",
      (l, id) => BIBLE[l].map(([lift, cat], k) => ({ ...fixed(`pb${id}-a${k + 1}`, lift, 5, 10, 20), note: `${cat}: any exercise` })),
      [
        "TM = 90% of your 1RM. Main lift: 5/3/1 with the last set for as many reps as you can. TM +5 lb press/bench, +10 lb squat/deadlift each cycle.",
        "Assistance: one exercise per category, 5 sets of 10–20. Press and bench days: chest/shoulders, lats/upper back, triceps. Squat: low back, quads, abs. Deadlift: hamstrings, quads, abs.",
      ]);
  },
  defaults: defaults(0.9),
};

// ───────────────────────── I'm Not Doing Jack Shit ─────────────────────────

export const jackShit: ProgramTemplate = {
  id: "531-jack-shit",
  name: "5/3/1 I'm Not Doing Jack Shit",
  author: "Jim Wendler",
  source: "5/3/1 (2009 book), as described in LiftVault \"I'm Not Doing Jack Shit\"",
  summary: "The minimum: the 5/3/1 main lift and nothing else. For busy weeks, or when the main lifts are all you want to train.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [DELOAD_OPT],
  build(o) {
    return fourDay("531-jack-shit", "5/3/1 I'm Not Doing Jack Shit", o.deload ?? "on", () => [], [
      "TM = 90% of your 1RM. Warm up, do the three 5/3/1 sets (last one for as many reps as you can), go home.",
      "TM +5 lb press/bench, +10 lb squat/deadlift each cycle. Push the + sets: they're the only work you do.",
    ]);
  },
  defaults: defaults(0.9),
};

export const WENDLER_FOREVER_TEMPLATES = [wendlerForever, triumvirate, periodizationBible, jackShit];
