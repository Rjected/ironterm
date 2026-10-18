// Comeback blocks: short, finite programs for getting back to training after a layoff. Built from
// the research summarised in docs/training/COMEBACK.md:
//
//   - Strength holds for ~4 weeks off and comes back in about half the break after that, so loads
//     start submaximal (70–78% of the pre-break e1RM) and climb a few % a week to ~88%.
//   - Soreness, not strength, is the problem: eccentric work at long muscle lengths (deep squats)
//     does the most damage, and the protection regular training gives (the repeated bout effect)
//     fades within ~3 weeks. Each exposure rebuilds it, so the squat is trained often with only a
//     few sets per session.
//   - With weekly volume matched, frequency doesn't change strength gains, so spreading the squat
//     over 3–4 short sessions costs nothing.
//   - Volume starts low (2–3 sets) and comes back before the heaviest loads do. No AMRAPs, no
//     grinders: RPE targets cap each day.
//   - Slow lowering and pauses come in after the first week, once the first exposures have
//     rebuilt some protection.
//
// The maxes are your best e1RMs from before the break, and nothing moves them: the block is a
// fixed ramp. When it's done you go back to your normal program at your normal weights.
//
// Both blocks have their own ramp built in, so the re-entry ramp (ReplayOptions.reentry) is off
// for them.

import type { DayDef, OptionDef, PercentSet, ProgramTemplate, SlotDef, Tier } from "../program";
import type { Unit } from "../units";

const kg = (lb: number) => Math.round(lb / 2.20462 / 2.5) * 2.5;
const toUnit = (lb: number, unit: Unit) => (unit === "lb" ? lb : kg(lb));
const s = (n: number, reps: number, pct: number, rpe?: number): PercentSet[] => Array.from({ length: n }, () => ({ pct, reps, rpe }));
const pctSlot = (id: string, lift: string, tier: Tier, tmLift: string, weeks: PercentSet[][], note?: string, restSeconds?: number): SlotDef => ({
  id, lift, tier, progression: { kind: "percent", tmLift, weeks }, note, restSeconds,
});
const acc = (id: string, lift: string, sets: number, reps: number, repsMax?: number, note?: string): SlotDef => ({
  id, lift, tier: "ACC", progression: { kind: "fixed", sets, reps, repsMax, note },
});

const MAX_LABEL = "Pre-break e1RM";

/** Shorter breaks start further along the same 4-week ramp. */
const LENGTHS: Record<string, { weeks: number; label: string }> = {
  "2": { weeks: 2, label: "2 weeks (2–4 weeks off)" },
  "3": { weeks: 3, label: "3 weeks (1–3 months off)" },
  "4": { weeks: 4, label: "4 weeks (3+ months off)" },
};
const lengthOption: OptionDef = {
  key: "weeks", label: "Length (by time off)", default: "3",
  choices: Object.entries(LENGTHS).map(([value, { label }]) => ({ value, label })),
};
const weeksFor = (o: Record<string, string>) => LENGTHS[o.weeks]?.weeks ?? 3;
const last = <T>(xs: T[], n: number) => xs.slice(xs.length - n);
const weekNames = (n: number) => Array.from({ length: n }, (_, i) => (i === n - 1 ? `Week ${i + 1} · last` : `Week ${i + 1}`));

const HAND_OFF = "When the block is done, go back to your regular program at your normal weights. You're back.";

// ───────────────────────── Return to Training (full body) ─────────────────────────

/** Medium day: sets of 5. */
const RTT_FIVES: PercentSet[][] = [s(2, 5, 0.7, 6), s(3, 5, 0.75, 6), s(3, 5, 0.8, 7), s(3, 4, 0.84, 7)];
/** Heavier day: triples. */
const RTT_TRIPLES: PercentSet[][] = [s(3, 3, 0.75, 6), s(3, 3, 0.8, 7), s(4, 3, 0.84, 7), s(3, 3, 0.88, 8)];
/** Light squat on the deadlift day: more exposures, little damage. */
const RTT_LIGHT_SQ: PercentSet[][] = [s(2, 5, 0.6, 5), s(2, 5, 0.65, 5), s(3, 5, 0.65, 6), s(3, 5, 0.7, 6)];
const RTT_DEADLIFT: PercentSet[][] = [s(2, 5, 0.7, 6), s(3, 5, 0.75, 6), s(3, 4, 0.8, 7), s(2, 3, 0.85, 7)];

export const returnToTraining: ProgramTemplate = {
  id: "comeback",
  name: "Return to Training",
  author: "Ironterm",
  source: "built from the detraining and repeated-bout research in docs/training/COMEBACK.md",
  summary: "2–4 weeks of full-body sessions after a layoff: squat three times a week, few sets, loads from ~70% of your pre-break e1RM back up to ~88%. Then resume your program.",
  category: "comeback",
  level: "beginner",
  daysPerWeek: [3],
  weeks: 3,
  options: [lengthOption],
  build(o) {
    const n = weeksFor(o);
    const fives = last(RTT_FIVES, n), triples = last(RTT_TRIPLES, n);
    const days: DayDef[] = [
      { id: "A", name: "Day A · Squat & bench, fives", slots: [
        pctSlot("rtt-a-sq", "squat", "MAIN", "squat", fives, "Controlled lowering, full depth you're comfortable with. Stop a set early if it's grinding."),
        pctSlot("rtt-a-bp", "bench", "MAIN", "bench", fives),
        acc("rtt-a-row", "dbRow", 3, 10, 12, "pick a weight with ~3 reps left"),
      ] },
      { id: "B", name: "Day B · Deadlift & press, light squat", slots: [
        pctSlot("rtt-b-dl", "deadlift", "MAIN", "deadlift", last(RTT_DEADLIFT, n)),
        pctSlot("rtt-b-ohp", "ohp", "MAIN", "ohp", fives),
        pctSlot("rtt-b-sq", "squat", "SUPP", "squat", last(RTT_LIGHT_SQ, n), "Light on purpose: practice, not work. From week 2, take 3 seconds on the way down."),
        acc("rtt-b-pull", "latPulldown", 3, 10, 12, "pick a weight with ~3 reps left"),
      ] },
      { id: "C", name: "Day C · Squat & bench, triples", slots: [
        pctSlot("rtt-c-sq", "squat", "MAIN", "squat", triples),
        pctSlot("rtt-c-bp", "bench", "MAIN", "bench", triples),
        acc("rtt-c-core", "plank", 3, 1, undefined, "30–45 s"),
      ] },
    ];
    return {
      templateId: "comeback",
      name: `Return to Training · ${n} weeks`,
      sessionsPerWeek: 3,
      days,
      cycle: { weeks: n, finite: true, weekNames: weekNames(n) },
      maxLabel: MAX_LABEL,
      builtInRamp: true,
      notes: [
        "Enter your best e1RM for each lift from before the break. The block never changes it.",
        "Three days a week with a day off between. Squat every session: frequent, short exposures bring back your tolerance to soreness fastest.",
        "Leave 3–4 reps in the tank early on (RPE 5–6) and never grind. If a day feels heavier than its RPE, use the lighter weight.",
        "Expect a little soreness after the first two sessions. It fades quickly as you keep showing up.",
        "Cramping is usually fatigue, not salt: keep sessions short, and stretch the cramping muscle if it happens.",
        HAND_OFF,
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { squat: toUnit(315, unit), bench: toUnit(225, unit), deadlift: toUnit(405, unit), ohp: toUnit(135, unit) }, startWeights: {} };
  },
};

// ───────────────────────── Squat Comeback ─────────────────────────

const SQ_MEDIUM: PercentSet[][] = [s(3, 5, 0.7, 6), s(3, 5, 0.75, 6), s(3, 5, 0.8, 7), s(3, 4, 0.83, 7)];
const SQ_HEAVY: PercentSet[][] = [s(3, 3, 0.75, 6), s(3, 3, 0.8, 7), s(3, 3, 0.85, 7), s(3, 3, 0.88, 8)];
const SQ_LIGHT: PercentSet[][] = [s(2, 5, 0.6, 5), s(2, 5, 0.6, 5), s(3, 5, 0.625, 5), s(3, 5, 0.65, 6)];
const SQ_SPEED: PercentSet[][] = [s(3, 3, 0.65, 5), s(3, 3, 0.675, 5), s(3, 3, 0.7, 5), s(3, 3, 0.725, 6)];
const UPPER_FIVES: PercentSet[][] = [s(3, 5, 0.72, 6), s(3, 5, 0.77, 6), s(3, 5, 0.82, 7), s(3, 4, 0.85, 7)];
const UPPER_TRIPLES: PercentSet[][] = [s(3, 3, 0.77, 6), s(3, 3, 0.82, 7), s(3, 3, 0.86, 7), s(3, 3, 0.9, 8)];
const DL_LIGHT: PercentSet[][] = [s(2, 5, 0.65, 5), s(2, 5, 0.7, 6), s(2, 5, 0.75, 6), s(2, 3, 0.8, 7)];

export const squatComeback: ProgramTemplate = {
  id: "comeback-squat",
  name: "Squat Comeback",
  author: "Ironterm",
  source: "built from the detraining and repeated-bout research in docs/training/COMEBACK.md",
  summary: "Squat 3–4 times a week with only 2–3 sets each: loads from ~70% of your pre-break e1RM up to ~88%, slow lowering and pauses added after week 1. Bench, press and deadlift ride along.",
  category: "comeback",
  level: "intermediate",
  daysPerWeek: [3, 4],
  weeks: 3,
  options: [
    lengthOption,
    { key: "days", label: "Squat days per week", default: "4", choices: [{ value: "3", label: "3" }, { value: "4", label: "4" }] },
  ],
  build(o) {
    const n = weeksFor(o);
    const four = o.days !== "3";
    const w = (t: PercentSet[][]) => last(t, n);
    // Light day: normal tempo in week 1, then a 3-second lowering and a pause at the bottom.
    // Every week of the shorter blocks is past week 1 of the full ramp, so they start slow-lowering.
    const light = w(SQ_LIGHT);
    const firstTempo = Math.max(0, 1 - (4 - n));
    const lightWeeks = Array.from({ length: n }, (_, i) => i);
    const days: DayDef[] = [
      { id: "D1", name: "Day 1 · Squat fives", slots: [
        pctSlot("sqc-d1-sq", "squat", "MAIN", "squat", w(SQ_MEDIUM), "Controlled lowering to the depth you normally squat. No grinders."),
        pctSlot("sqc-d1-bp", "bench", "MAIN", "bench", w(UPPER_FIVES)),
        acc("sqc-d1-row", "dbRow", 3, 10, 12, "pick a weight with ~3 reps left"),
      ] },
      ...(firstTempo > 0 ? [{ id: "D2", name: "Day 2 · Light squat, deadlift", weeks: lightWeeks.filter((i) => i < firstTempo), slots: [
        pctSlot("sqc-d2-sq", "squat", "SUPP", "squat", light, "Light on purpose: this session is for your legs to get used to squatting again."),
        pctSlot("sqc-d2-dl", "deadlift", "MAIN", "deadlift", w(DL_LIGHT), "Lower it under control but don't fight the way down."),
        pctSlot("sqc-d2-ohp", "ohp", "MAIN", "ohp", w(UPPER_FIVES)),
      ] }] : []),
      { id: "D2T", name: "Day 2 · Tempo squat, deadlift", weeks: lightWeeks.filter((i) => i >= firstTempo), slots: [
        pctSlot("sqc-d2t-sq", "pauseSquat", "SUPP", "squat", light, "3 seconds down, 1-second pause at the bottom, up at normal speed. Builds tolerance to the part that makes you sore."),
        pctSlot("sqc-d2-dl", "deadlift", "MAIN", "deadlift", w(DL_LIGHT), "Lower it under control but don't fight the way down."),
        pctSlot("sqc-d2-ohp", "ohp", "MAIN", "ohp", w(UPPER_FIVES)),
      ] },
      { id: "D3", name: "Day 3 · Squat triples", slots: [
        pctSlot("sqc-d3-sq", "squat", "MAIN", "squat", w(SQ_HEAVY), "Heaviest squat of the week, still with 2–3 reps in the tank.", 240),
        pctSlot("sqc-d3-bp", "bench", "MAIN", "bench", w(UPPER_TRIPLES)),
        acc("sqc-d3-pull", "latPulldown", 3, 10, 12, "pick a weight with ~3 reps left"),
      ] },
      ...(four ? [{ id: "D4", name: "Day 4 · Squat speed triples", slots: [
        pctSlot("sqc-d4-sq", "squat", "SUPP", "squat", w(SQ_SPEED), "Fast and crisp on the way up; stop well short of slowing down."),
        acc("sqc-d4-calf", "calfRaise", 2, 12, 15, "slow"),
        acc("sqc-d4-core", "plank", 3, 1, undefined, "30–45 s"),
      ] }] : []),
    ];
    return {
      templateId: "comeback-squat",
      name: `Squat Comeback · ${n} weeks, ${four ? 4 : 3} days`,
      sessionsPerWeek: four ? 4 : 3,
      days,
      cycle: { weeks: n, finite: true, weekNames: weekNames(n) },
      maxLabel: MAX_LABEL,
      builtInRamp: true,
      notes: [
        "Enter your best e1RM for each lift from before the break. The block never changes it.",
        `Squat ${four ? "four" : "three"} times a week, only 2–3 sets each. Many short exposures rebuild your tolerance to squat soreness much faster than a few big sessions, and with the same weekly volume you lose no strength by spreading it out.`,
        "Loads start around 70% and climb to about 88% for triples. Leave reps in the tank every set; the RPE is a cap, not a target.",
        "Week 1 keeps a normal tempo. After that the light day adds a slow lowering and a pause, the part of the squat that causes the most soreness, in small doses.",
        "Sore after day 1? Do day 2 anyway, lighter if needed. Light squatting on sore legs doesn't add damage, usually eases the soreness for a while, and keeps building tolerance.",
        "Cramping is usually fatigue, not salt: keep sessions short, and stretch the cramping muscle if it happens.",
        HAND_OFF,
      ],
    };
  },
  defaults(unit) {
    return { trainingMaxes: { squat: toUnit(315, unit), bench: toUnit(225, unit), deadlift: toUnit(405, unit), ohp: toUnit(135, unit) }, startWeights: {} };
  },
};

export const COMEBACK_TEMPLATES: ProgramTemplate[] = [returnToTraining, squatComeback];
