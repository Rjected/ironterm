import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { applyWorkout, initialState, matchDay, planDay, replay, type ProgramConfig } from "./program";
import { buildProgram, defaultConfig } from "./programs";
import { demoData } from "./demo";
import { toKg } from "./units";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);

function gz(): { cfg: ProgramConfig; def: NonNullable<ReturnType<typeof buildProgram>> } {
  const cfg = defaultConfig("gzclp", "lb", "2026-01-01");
  cfg.options.curls = "off";
  return { cfg, def: buildProgram(cfg)! };
}

describe("GZCLP", () => {
  it("adds weight on success and keeps the stage", () => {
    const { cfg, def } = gz();
    const s = applyWorkout(def, cfg, initialState(def, cfg), W("w1", "2026-01-02", [["Squat (Barbell)", rep(5, 185, 3, 7)], ["Bench Press (Barbell)", rep(3, 145, 10)], ["Lat Pulldown (Cable)", rep(3, 42.5, 15, 20)]]), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ weight: 195, stage: 0 });
    expect(s.slots["a1-t2"]).toMatchObject({ weight: 150, stage: 0 });
    expect(s.slots["a1-t3"]).toMatchObject({ weight: 42.5 }); // 20 < 25, hold
    expect(s.dayIndex).toBe(1);
  });

  it("T1 steps 5x3 → 6x2 → 10x1 → retest at 85%", () => {
    const { cfg, def } = gz();
    let s = initialState(def, cfg);
    const fail = (sets: [number, number][]) => W("f", "2026-01-02", [["Squat (Barbell)", sets]]);
    s = applyWorkout(def, cfg, s, fail(rep(5, 185, 3, 2)), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ weight: 185, stage: 1 });
    s = applyWorkout(def, cfg, s, fail(rep(6, 185, 2, 1)), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ weight: 185, stage: 2 });
    s = applyWorkout(def, cfg, s, fail(rep(10, 185, 1, 0)), 0);
    expect(s.slots["a1-t1"].retest).toBe(true);
    expect(planDay(def, cfg, s, 0).exercises[0].scheme).toBe("5RM TEST");
    s = applyWorkout(def, cfg, s, fail([[135, 5], [185, 5], [215, 5], [225, 3]]), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ weight: 185, stage: 0, retest: false }); // 215 × .85 = 182.75 → 185
  });

  it("T2 resets to 3x10 above the previous 3x10 start", () => {
    const { cfg, def } = gz();
    let s = initialState(def, cfg);
    const b = (sets: [number, number][]) => W("b", "2026-01-02", [["Squat (Barbell)", rep(5, 185, 3)], ["Bench Press (Barbell)", sets]]);
    s = applyWorkout(def, cfg, s, b(rep(3, 145, 10, 8)), 0);
    s = applyWorkout(def, cfg, s, b(rep(3, 145, 8, 5)), 0);
    s = applyWorkout(def, cfg, s, b(rep(3, 145, 6, 4)), 0);
    expect(s.slots["a1-t2"]).toMatchObject({ stage: 0, weight: 155, stage0Weight: 155 });
  });

  it("matches workouts to days by main lift, even out of order", () => {
    const { cfg, def } = gz();
    const s = initialState(def, cfg);
    expect(matchDay(def, cfg, s, W("x", "2026-01-02", [["Deadlift (Barbell)", rep(5, 225, 3)], ["Overhead Press (Barbell)", rep(3, 65, 10)]]))).toBe(3);
    expect(matchDay(def, cfg, s, W("y", "2026-01-02", [["Bicep Curl (Dumbbell)", rep(3, 20, 12)]]))).toBe(-1);
  });

  it("replay ignores workouts before startDate and applies adjustments", () => {
    const { cfg, def } = gz();
    cfg.adjustments = [{ date: "2026-01-01T00:00:00Z", slotId: "a1-t1", weight: 200 }];
    const s = replay(def, cfg, [W("old", "2025-12-01", [["Squat (Barbell)", rep(5, 100, 3)]]), W("new", "2026-01-05", [["Squat (Barbell)", rep(5, 200, 3)]])]);
    expect(s.slots["a1-t1"].weight).toBe(210);
    expect(s.log).toHaveLength(1);
  });
});

describe("5/3/1", () => {
  it("cycles weeks and bumps TMs after a full cycle", () => {
    const cfg = defaultConfig("531", "lb", "2026-01-01");
    const def = buildProgram(cfg)!;
    let s = initialState(def, cfg);
    expect(planDay(def, cfg, s, 0).exercises[0].sets.map((x) => x.weight)).toEqual([75, 85, 100]); // 115 TM: 65/75/85%
    const lifts = ["Overhead Press (Barbell)", "Deadlift (Barbell)", "Bench Press (Barbell)", "Squat (Barbell)"];
    for (let wk = 0; wk < 4; wk++)
      for (let d = 0; d < 4; d++) s = applyWorkout(def, cfg, s, W(`w${wk}${d}`, "2026-01-02", [[lifts[d], rep(3, 999, 5)]]), d);
    expect(s.tms).toMatchObject({ ohp: 120, bench: 190, squat: 260, deadlift: 310 });
    expect(planDay(def, cfg, s, 0).week).toBe(0);
  });
});

describe("nSuns", () => {
  it("bumps TM from the 1+ set", () => {
    const cfg = defaultConfig("nsuns5", "lb", "2026-01-01");
    const def = buildProgram(cfg)!;
    const s0 = initialState(def, cfg);
    const p = planDay(def, cfg, s0, 1);
    const sets = p.exercises[0].sets.map((x, i) => [x.weight, i === 2 ? 5 : x.reps] as [number, number]);
    const s = applyWorkout(def, cfg, s0, W("sq", "2026-01-02", [["Squat (Barbell)", sets]]), 1);
    // 4–5 reps on lower = 2 × 5 lb, applied when the week ends (as in the sheet)
    expect(s.tms.squat).toBe(250);
    expect(s.pendingTm?.squat).toBe(10);
  });
});

describe("demo", () => {
  it("generates a year that replays to the same state", () => {
    const { workouts, config } = demoData("2026-10-17");
    expect(workouts.length).toBeGreaterThan(150);
    const def = buildProgram(config)!;
    const s = replay(def, config, workouts);
    expect(s.log.length).toBeGreaterThan(150);
    expect(s.slots["a1-t1"].weight).toBeGreaterThan(config.startWeights["a1-t1"]);
  });
});
