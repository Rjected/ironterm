// Wendler 5/3/1, 4-day, with a supplemental template. Percentages are of the training max (TM),
// which starts around 90% of your 1RM. TM goes up once per cycle: +5 lb upper, +10 lb lower.
// Checked against Dan's "Copy of Wendler 5-3-1 v1.3.xlsx" (Jon K's sheet): same set percentages
// (65/75/85, 70/80/90, 75/85/95, deload 40/50/60), TM = 90% of 1RM, BBB 5×10 @ 50% of TM. That
// sheet also keeps BBB in the deload week; here (as in Forever) the deload week drops it.

import type { PercentSet, ProgramTemplate, SlotDef } from "../program";
import type { Unit } from "../units";

export const MAIN: PercentSet[][] = [
  [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: 5, amrap: true }],
  [{ pct: 0.7, reps: 3 }, { pct: 0.8, reps: 3 }, { pct: 0.9, reps: 3, amrap: true }],
  [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: 1, amrap: true }],
  [{ pct: 0.4, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.6, reps: 5 }],
];

export const rep = (n: number, s: PercentSet) => Array.from({ length: n }, () => ({ ...s }));

export function supplemental(kind: string, deload: boolean): PercentSet[][] | null {
  const weeks = deload ? 4 : 3;
  if (kind === "bbb") return Array.from({ length: weeks }, (_, w) => (w === 3 ? [] : rep(5, { pct: 0.5, reps: 10 })));
  if (kind === "bbb60") return Array.from({ length: weeks }, (_, w) => (w === 3 ? [] : rep(5, { pct: 0.6, reps: 10 })));
  if (kind === "fsl") return MAIN.slice(0, weeks).map((wk, w) => (w === 3 ? [] : rep(5, { pct: wk[0].pct, reps: 5 })));
  return null;
}

export const wendler531: ProgramTemplate = {
  id: "531",
  name: "5/3/1",
  author: "Jim Wendler",
  source: "5/3/1 Forever (book) · Wendler 5-3-1 v1.3 sheet",
  summary: "Three-week waves off a training max, AMRAP top sets, slow and steady TM increases each cycle.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  options: [
    { key: "supp", label: "Supplemental", default: "bbb", choices: [
      { value: "bbb", label: "Boring But Big 5×10 @ 50%" },
      { value: "bbb60", label: "BBB 5×10 @ 60%" },
      { value: "fsl", label: "First Set Last 5×5" },
      { value: "none", label: "None" },
    ] },
    { key: "deload", label: "Deload week", default: "on", choices: [{ value: "on", label: "Every 4th week" }, { value: "off", label: "Skip (3-week cycles)" }] },
  ],
  build(o) {
    const opts = { supp: "bbb", deload: "on", ...o };
    const deload = opts.deload === "on";
    const weeks = deload ? MAIN : MAIN.slice(0, 3);
    const supp = supplemental(opts.supp, deload);
    const day = (id: string, lift: string): { id: string; name: string; slots: SlotDef[] } => {
      const slots: SlotDef[] = [{ id: `${id}-main`, lift, tier: "MAIN", progression: { kind: "percent", tmLift: lift, weeks } }];
      if (supp) slots.push({ id: `${id}-supp`, lift, tier: "SUPP", progression: { kind: "percent", tmLift: lift, weeks: supp } });
      return { id, name: `Day ${id} · ${lift === "ohp" ? "Press" : lift[0].toUpperCase() + lift.slice(1)}`, slots };
    };
    return {
      templateId: "531",
      name: `5/3/1 ${opts.supp === "none" ? "" : opts.supp.toUpperCase()}`.trim(),
      sessionsPerWeek: 4,
      days: [day("1", "ohp"), day("2", "deadlift"), day("3", "bench"), day("4", "squat")],
      cycle: {
        weeks: weeks.length,
        weekNames: ["5s week", "3s week", "5/3/1 week", "Deload"],
        tmIncrease: { ohp: { lb: 5, kg: 2.5 }, bench: { lb: 5, kg: 2.5 }, squat: { lb: 10, kg: 5 }, deadlift: { lb: 10, kg: 5 } },
      },
    };
  },
  defaults(unit: Unit) {
    const lb = { squat: 250, bench: 185, deadlift: 300, ohp: 115 };
    return { trainingMaxes: Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5])), startWeights: {} };
  },
};
