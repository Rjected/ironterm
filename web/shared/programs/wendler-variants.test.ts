import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramDef, type ProgramState, type ProgramTemplate } from "../program";
import { LIFTS } from "../lifts";
import { toKg } from "../units";
import { bbbChallenge, fivesPro, monolith, wendlerBeginners, wendlerShort } from "./wendler-variants";

function setup(t: ProgramTemplate, tms: Record<string, number>, options: Record<string, string> = {}) {
  const def = t.build(options);
  const cfg: ProgramConfig = { templateId: t.id, options, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: tms, increments: {} };
  return { def, cfg };
}

/** Log exactly what the plan says (main percent lifts only) for the next scheduled day. */
function doNext(def: ProgramDef, cfg: ProgramConfig, s: ProgramState, n: number): ProgramState {
  const plan = planDay(def, cfg, s);
  const ex = plan.exercises.filter((e) => e.sets[0]?.weight > 0);
  // one Hevy block per slot, in slot order, so two slots on the same lift stay separate
  const w: HevyWorkout = {
    id: `w${n}`, title: "w", start_time: `2026-02-01T12:00:00Z`, end_time: `2026-02-01T13:00:00Z`,
    exercises: ex.map((e) => ({ title: LIFTS[e.lift].hevy[0], exercise_template_id: "x", sets: e.sets.map((x) => ({ type: "normal" as const, weight_kg: toKg(x.weight, "lb"), reps: x.reps })) })),
  };
  return applyWorkout(def, cfg, s, w, s.dayIndex);
}
const run = (def: ProgramDef, cfg: ProgramConfig, sessions: number, s = initialState(def, cfg)) => { for (let i = 0; i < sessions; i++) s = doNext(def, cfg, s, i); return s; };
const ws = (def: ProgramDef, cfg: ProgramConfig, s: ProgramState, day: number, slotId: string) => planDay(def, cfg, s, day).exercises.find((e) => e.slotId === slotId)?.sets.map((x) => x.weight);

describe("5/3/1 for Beginners", () => {
  const { def, cfg } = setup(wendlerBeginners, { squat: 285, bench: 205, deadlift: 345, ohp: 130 });

  it("two lifts a day with 5/3/1 + FSL 5×5 and push/pull/core", () => {
    const s = initialState(def, cfg);
    const d1 = planDay(def, cfg, s, 0);
    expect(d1.exercises.map((e) => e.lift)).toEqual(["squat", "squat", "bench", "bench", "dip", "chinUp", "lunge"]);
    expect(ws(def, cfg, s, 0, "b1-squat")).toEqual([185, 215, 240]); // 65/75/85% of 285
    expect(d1.exercises[0].sets[2].amrap).toBe(true);
    expect(ws(def, cfg, s, 0, "b1-squat-fsl")).toEqual(Array(5).fill(185));
    expect(ws(def, cfg, s, 0, "b1-bench")).toEqual([135, 155, 175]);
  });

  it("week 3 is 5/3/1+ and the TM goes up every 3 weeks with no deload", () => {
    let s = run(def, cfg, 6);
    expect(planDay(def, cfg, s, 1).week).toBe(2);
    expect(ws(def, cfg, s, 1, "b2-deadlift")).toEqual([260, 295, 330]); // 75/85/95% of 345
    expect(ws(def, cfg, s, 1, "b2-deadlift-fsl")).toEqual(Array(5).fill(260));
    s = run(def, cfg, 3, s);
    expect(s.tms).toEqual({ squat: 295, bench: 210, deadlift: 355, ohp: 135 });
    expect(planDay(def, cfg, s).week).toBe(0);
  });
});

describe("Building the Monolith", () => {
  const { def, cfg } = setup(monolith, { squat: 270, bench: 190, deadlift: 330, ohp: 125 });

  it("week 1 loads match the template", () => {
    const s = initialState(def, cfg);
    expect(ws(def, cfg, s, 0, "mo1-sq")).toEqual([190, 215, 245, 245, 245, 245, 245]); // 70/80/90 then 5×5 @ 90
    expect(ws(def, cfg, s, 0, "mo1-ohp")).toEqual([90, 100, 115, 90]);
    expect(planDay(def, cfg, s, 0).exercises[1].sets[3].amrap).toBe(true);
    expect(ws(def, cfg, s, 1, "mo2-dl")).toEqual([230, 265, 295, 295, 295]);
    expect(planDay(def, cfg, s, 2).exercises[0].sets.map((x) => [x.weight, x.reps])).toEqual([[190, 5], [215, 5], [245, 5], [120, 20]]); // 20 reps @ 45%
    expect(ws(def, cfg, s, 2, "mo3-ohp")).toEqual(Array(10).fill(90)); // 10×5 @ 70%
    expect(planDay(def, cfg, s, 1).exercises.map((e) => e.lift)).toEqual(["deadlift", "bench", "dbRow", "bicepCurl"]);
  });

  it("raises TMs after week 3 and finishes after 6 weeks", () => {
    let s = run(def, cfg, 6);
    expect(planDay(def, cfg, s, 1).exercises.map((e) => e.slotId).slice(0, 2)).toEqual(["mo2-dl-tm", "mo2-bp-tm"]);
    s = run(def, cfg, 3, s);
    expect(s.tms).toEqual({ squat: 280, bench: 195, deadlift: 340, ohp: 130 });
    expect(ws(def, cfg, s, 2, "mo3-ohp")).toEqual(Array(12).fill(80)); // week 4: 12×5 @ 60% of 130 = 78 → 80
    s = run(def, cfg, 8, s);
    expect(s.complete).toBeFalsy();
    s = run(def, cfg, 1, s);
    expect(s.complete).toBe(true);
    expect(s.tms).toEqual({ squat: 280, bench: 195, deadlift: 340, ohp: 130 });
  });
});

describe("BBB 3-Month Challenge", () => {
  const { def, cfg } = setup(bbbChallenge, { squat: 285, bench: 205, deadlift: 345, ohp: 130 });

  it("5/3/1 for prescribed reps, then 5×10 at 50 → 60 → 70%", () => {
    let s = initialState(def, cfg);
    const d = planDay(def, cfg, s, 3);
    expect(d.exercises.map((e) => e.slotId)).toEqual(["bc4-main", "bc4-bbb", "bc4-acc", "bc4-abs"]);
    expect(d.exercises[0].sets.some((x) => x.amrap)).toBe(false);
    expect(ws(def, cfg, s, 3, "bc4-bbb")).toEqual(Array(5).fill(145)); // 50% of 285 = 142.5
    s = run(def, cfg, 12, s); // month 1 weeks 1–3
    expect(planDay(def, cfg, s, 3).exercises.map((e) => e.slotId)).toEqual(["bc4-main-tm", "bc4-acc", "bc4-abs"]); // deload: no BBB
    s = run(def, cfg, 4, s);
    expect(s.tms).toEqual({ squat: 295, bench: 210, deadlift: 355, ohp: 135 });
    expect(ws(def, cfg, s, 3, "bc4-bbb")).toEqual(Array(5).fill(175)); // month 2: 60% of 295 = 177
    s = run(def, cfg, 16, s);
    expect(ws(def, cfg, s, 3, "bc4-bbb")).toEqual(Array(5).fill(215)); // month 3: 70% of 305 = 213.5
    s = run(def, cfg, 16, s);
    expect(s.complete).toBe(true);
    expect(s.tms.squat).toBe(305);
  });

  it("without deloads it's nine weeks", () => {
    const t = setup(bbbChallenge, { squat: 285, bench: 205, deadlift: 345, ohp: 130 }, { deload: "off" });
    expect(t.def.cycle!.weeks).toBe(9);
    expect(run(t.def, t.cfg, 36).complete).toBe(true);
  });
});

describe("5's PRO", () => {
  const tms = { squat: 270, bench: 190, deadlift: 330, ohp: 125 };

  it("every main set is 5 reps; FSL / BBS / SSL supplemental", () => {
    const fsl = setup(fivesPro, tms);
    const s = initialState(fsl.def, fsl.cfg);
    const d = planDay(fsl.def, fsl.cfg, s, 0);
    expect(d.exercises[0].sets.map((x) => [x.weight, x.reps, x.amrap])).toEqual([[175, 5, false], [205, 5, false], [230, 5, false]]);
    expect(ws(fsl.def, fsl.cfg, s, 0, "fp1-supp")).toEqual(Array(5).fill(175));
    expect(d.exercises.map((e) => e.lift)).toEqual(["squat", "squat", "dip", "chinUp", "abWheel"]);
    const bbs = setup(fivesPro, tms, { supp: "bbs", acc: "off" });
    expect(ws(bbs.def, bbs.cfg, initialState(bbs.def, bbs.cfg), 0, "fp1-supp")).toEqual(Array(10).fill(175));
    expect(planDay(bbs.def, bbs.cfg, initialState(bbs.def, bbs.cfg), 0).exercises).toHaveLength(2);
    const ssl = setup(fivesPro, tms, { supp: "ssl" });
    expect(ws(ssl.def, ssl.cfg, initialState(ssl.def, ssl.cfg), 0, "fp1-supp")).toEqual(Array(5).fill(205));
  });

  it("TM up after each 3-week cycle", () => {
    const { def, cfg } = setup(fivesPro, tms);
    expect(run(def, cfg, 12).tms).toEqual({ squat: 280, bench: 195, deadlift: 340, ohp: 130 });
  });
});

describe("5/3/1 2-day / 3-day", () => {
  const tms = { squat: 270, bench: 190, deadlift: 330, ohp: 125 };

  it("3-day rotates four lifts through three sessions a week", () => {
    const { def, cfg } = setup(wendlerShort, tms);
    expect(def.sessionsPerWeek).toBe(3);
    expect(def.days.map((d) => d.slots[0].lift)).toEqual(["ohp", "deadlift", "bench", "squat"]);
    let s = run(def, cfg, 4);
    expect(planDay(def, cfg, s).week).toBe(1); // 5th session (2nd calendar week) is press, 3s week
    expect(ws(def, cfg, s, 0, "r1-ohp")).toEqual([90, 100, 115]);
    s = run(def, cfg, 12, s);
    expect(s.tms).toEqual({ squat: 280, bench: 195, deadlift: 340, ohp: 130 });
  });

  it("2-day pairs squat+bench and deadlift+press", () => {
    const { def, cfg } = setup(wendlerShort, tms, { days: "2", supp: "bbb" });
    expect(def.days.map((d) => d.slots.map((x) => x.lift))).toEqual([["squat", "squat", "bench", "bench"], ["deadlift", "deadlift", "ohp", "ohp"]]);
    expect(ws(def, cfg, initialState(def, cfg), 0, "s1-squat-supp")).toEqual(Array(5).fill(135));
    expect(run(def, cfg, 8).tms).toEqual({ squat: 280, bench: 195, deadlift: 340, ohp: 130 });
  });
});
