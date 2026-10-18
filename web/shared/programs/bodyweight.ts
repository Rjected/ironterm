// Bodyweight classics:
//
//   Armstrong Pull-up   Maj. Charles Lewis Armstrong's USMC pull-up routine (the widely circulated
//                       Armstrong Pull-up Program document; LiftVault's and InsideHook's write-ups).
//                       Morning push-ups, then five days: max-effort sets, a pyramid, 9 "training sets"
//                       on three grips, as many training sets as possible, and a repeat of the hardest
//                       day. When all nine Day-3 sets are clean, add a rep to the training set.
//   Grease the Groove   Pavel Tsatsouline's practice method (free articles, e.g. StrongFirst): many
//                       submaximal sets spread through the day, about half your max, never to failure,
//                       five or so days a week. Usually pull-ups or push-ups.

import type { ProgramTemplate, SlotDef, Tier } from "../program";

const sets = (id: string, lift: string, n: number, reps: number, note: string, o: { amrap?: boolean; repsMax?: number; tier?: Tier } = {}): SlotDef => ({
  id, lift, tier: o.tier ?? "MAIN", progression: { kind: "fixed", sets: n, reps, repsMax: o.repsMax, amrapLast: o.amrap, note },
});

export const armstrong: ProgramTemplate = {
  id: "armstrong-pullup",
  name: "Armstrong Pull-up Program",
  author: "Maj. Charles Lewis Armstrong (USMC)",
  source: "The Armstrong Pull-up Program document, as written up by LiftVault and InsideHook",
  summary: "The Marine Corps pull-up routine: morning push-ups, then five days a week of max sets, pyramids, multi-grip training sets and volume, until you can do 20+.",
  category: "bodyweight",
  level: "beginner",
  daysPerWeek: [5],
  then: { when: "It doesn't end: keep adding a rep to your training set. Past 20 strict pull-ups, start adding weight or move to a weighted pull-up program." },
  options: [],
  build() {
    const pushups = sets("ap-push", "pushUp", 3, 1, "every morning: 3 sets of max push-ups", { amrap: true, tier: "ACC" });
    return {
      templateId: "armstrong-pullup",
      name: "Armstrong Pull-ups",
      sessionsPerWeek: 5,
      days: [
        { id: "D1", name: "Day 1 · Max effort", slots: [pushups, sets("ap-max", "pullUp", 5, 1, "five max-effort sets, 90 s rest", { amrap: true })] },
        { id: "D2", name: "Day 2 · Pyramid", slots: [pushups, sets("ap-pyr", "pullUp", 10, 1, "pyramid: 1, 2, 3… until you miss, then one more max set; rest 10 s per rep of the last set", { repsMax: 10 })] },
        { id: "D3", name: "Day 3 · Training sets, three grips", slots: [
          pushups,
          sets("ap-ts-over", "pullUp", 3, 3, "training set: a number you can do clean every time; overhand"),
          sets("ap-ts-chin", "chinUp", 3, 3, "training set, palms toward you"),
          sets("ap-ts-wide", "pullUp", 3, 3, "training set, wide grip. All nine clean → add a rep next week"),
        ] },
        { id: "D4", name: "Day 4 · Max training sets", slots: [pushups, sets("ap-mts", "pullUp", 8, 3, "as many training sets as you can, 60 s rest, until one isn't perfect", { repsMax: 3 })] },
        { id: "D5", name: "Day 5 · Hardest day again", slots: [pushups, sets("ap-d5", "pullUp", 5, 1, "repeat whichever day was hardest this week (max sets shown)", { amrap: true })] },
      ],
      notes: [
        "Every morning: three sets of max push-ups.",
        "Five days on, two off. Strict reps only: full hang, chin over the bar, no kipping.",
        "Your training set is a number of reps you can always do cleanly. When you get all nine on Day 3, add one.",
      ],
    };
  },
  defaults: () => ({ startWeights: {}, trainingMaxes: {} }),
};

export const greaseTheGroove: ProgramTemplate = {
  id: "grease-the-groove",
  name: "Grease the Groove",
  author: "Pavel Tsatsouline",
  source: "Pavel Tsatsouline's \"Grease the Groove\" articles (StrongFirst, T Nation)",
  summary: "Practice, not workouts: many easy sets of one movement through the day, about half your max and never to failure. The classic way to go from a few pull-ups to many.",
  category: "bodyweight",
  level: "beginner",
  daysPerWeek: [5],
  then: { when: "It doesn't end: retest your max every week or two and keep sets at about half of it. When it plateaus, switch movements or add weight." },
  options: [{ key: "lift", label: "Movement", default: "pullUp", choices: [
    { value: "pullUp", label: "Pull-ups" }, { value: "pushUp", label: "Push-ups" }, { value: "dip", label: "Dips" }, { value: "chinUp", label: "Chin-ups" },
  ] }],
  build(o) {
    const lift = o.lift ?? "pullUp";
    return {
      templateId: "grease-the-groove",
      name: "Grease the Groove",
      sessionsPerWeek: 5,
      days: [{ id: "GTG", name: "Practice day", slots: [sets("gtg", lift, 5, 3, "about half your max each set, spread through the day; never close to failure", { repsMax: 10 })] }],
      notes: [
        "Pick one movement. Through the day, whenever you pass the bar, do a set of about half your max (40–60%). Rest at least 15 minutes between sets.",
        "Never go near failure: stop with plenty left. Many sets matter more than hard ones. Take a day or two off a week.",
        "Test your max every week or two and adjust the set size.",
      ],
    };
  },
  defaults: () => ({ startWeights: {}, trainingMaxes: {} }),
};

export const BODYWEIGHT_TEMPLATES = [armstrong, greaseTheGroove];
