import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { coanPhillipi, russianSquat, smolovJr } from "./specialization";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number) => Array.from({ length: n }, () => [lb, reps] as [number, number]);
const SQ = "Squat (Barbell)";
const DL = "Deadlift (Barbell)";

function setup(t: ProgramTemplate, tms: Record<string, number>, options: Record<string, string> = {}) {
  const opts = Object.fromEntries(t.options.map((o) => [o.key, o.default]));
  const cfg: ProgramConfig = { templateId: t.id, options: { ...opts, ...options }, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: tms };
  return { cfg, def: t.build(cfg.options) };
}
const day = (d: number) => `2026-01-${String(d).padStart(2, "0")}`;

describe("templates build with defaults", () => {
  it.each([smolovJr, russianSquat, coanPhillipi])("$id", (t) => {
    const def = t.build(Object.fromEntries(t.options.map((o) => [o.key, o.default])));
    expect(def.cycle?.finite).toBe(true);
    expect(def.cycle?.weeks).toBe(t.weeks);
    const ids = def.days.flatMap((d) => d.slots.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(t.defaults?.("lb").trainingMaxes).toBeTruthy();
  });
});

describe("Smolov Jr", () => {
  it("prescribes 6×6@70, 7×5@75, 8×4@80, 10×3@85 of the 1RM", () => {
    const { cfg, def } = setup(smolovJr, { squat: 300 });
    const s = initialState(def, cfg);
    const plan = (i: number) => planDay(def, cfg, s, i).exercises[0];
    expect(plan(0).sets).toHaveLength(6);
    expect(plan(0).sets[0]).toMatchObject({ weight: 210, reps: 6 });
    expect(plan(1).sets).toHaveLength(7);
    expect(plan(1).sets[0]).toMatchObject({ weight: 225, reps: 5 });
    expect(plan(2).sets[0]).toMatchObject({ weight: 240, reps: 4 });
    expect(plan(3).sets).toHaveLength(10);
    expect(plan(3).sets[0]).toMatchObject({ weight: 255, reps: 3 });
  });

  it("weeks 2 and 3 add a fixed load on top of the %", () => {
    const { cfg, def } = setup(smolovJr, { squat: 300 });
    const wk = (n: number) => ({ ...initialState(def, cfg), rotations: n });
    expect(planDay(def, cfg, wk(1), 0).exercises[0]).toMatchObject({ scheme: "6×6" });
    expect(planDay(def, cfg, wk(1), 0).exercises[0].sets[0].weight).toBe(220); // 210 + 10
    expect(planDay(def, cfg, wk(2), 3).exercises[0].sets[0].weight).toBe(275); // 255 + 20
    const low = setup(smolovJr, { squat: 300 }, { add: "low" });
    expect(planDay(low.def, low.cfg, { ...initialState(low.def, low.cfg), rotations: 1 }, 0).exercises[0].sets[0].weight).toBe(215); // 210 + 5
    const k = { ...cfg, unit: "kg" as const, trainingMaxes: { squat: 140 } };
    expect(planDay(def, k, { ...initialState(def, k), rotations: 1 }, 0).exercises[0].sets[0].weight).toBe(102.5); // 98 + 5 = 103 → 102.5
  });

  it("bench variant and low increments", () => {
    const { cfg, def } = setup(smolovJr, { bench: 225 }, { lift: "bench", add: "low" });
    const ex = planDay(def, cfg, initialState(def, cfg), 3).exercises[0];
    expect(ex.lift).toBe("bench");
    expect(ex.sets[0].weight).toBe(190); // 225 × .85 = 191.25 → 190
    expect(def.cycle?.weekNames?.[2]).toContain("+10 lb");
  });

  it("walks 3 weeks of 4 days and completes", () => {
    const { cfg, def } = setup(smolovJr, { squat: 300 });
    const ws: HevyWorkout[] = [];
    const schemes: [number, number, number][] = [[6, 6, 210], [7, 5, 225], [8, 4, 240], [10, 3, 255]];
    for (let w = 0; w < 3; w++) schemes.forEach(([n, r, lb], d) => ws.push(W(`w${w}d${d}`, day(1 + w * 7 + d * 2), [[SQ, rep(n, lb + w * 10, r)]])));
    const mid = replay(def, cfg, ws.slice(0, 5));
    expect(planDay(def, cfg, mid).week).toBe(1);
    expect(mid.dayIndex).toBe(1);
    const s = replay(def, cfg, ws);
    expect(s.complete).toBe(true);
    expect(s.log).toHaveLength(12);
    expect(s.log.map((l) => l.dayId).slice(0, 4)).toEqual(["D1", "D2", "D3", "D4"]);
  });
});

describe("Russian Squat Routine", () => {
  const { cfg, def } = setup(russianSquat, { squat: 300 });

  it("week 1 is 6×2, 6×3, 6×2 at 80%", () => {
    const s = initialState(def, cfg);
    expect(planDay(def, cfg, s, 0).exercises[0].scheme).toBe("6×2");
    expect(planDay(def, cfg, s, 0).exercises[0].sets[0].weight).toBe(240);
    expect(planDay(def, cfg, s, 1).exercises[0].scheme).toBe("6×3");
  });

  it("ramps volume then intensity to a 105% single and completes", () => {
    const ws: HevyWorkout[] = [];
    for (let w = 0; w < 6; w++) for (let d = 0; d < 3; d++) ws.push(W(`w${w}d${d}`, `2026-0${1 + Math.floor((w * 7 + d * 2) / 28)}-${String(1 + ((w * 7 + d * 2) % 28)).padStart(2, "0")}`, [[SQ, rep(6, 240, 2)]]));
    // after week 3 → week 4 day 1 = 5×5 @ 85%
    let s = replay(def, cfg, ws.slice(0, 9));
    let ex = planDay(def, cfg, s).exercises[0];
    expect(planDay(def, cfg, s).week).toBe(3);
    expect(ex.scheme).toBe("5×5");
    expect(ex.sets[0].weight).toBe(255);
    // week 3 day 2 is 6×6
    s = replay(def, cfg, ws.slice(0, 7));
    expect(planDay(def, cfg, s).exercises[0].scheme).toBe("6×6");
    // last day: 1×1 @ 105% = 315
    s = replay(def, cfg, ws.slice(0, 17));
    ex = planDay(def, cfg, s).exercises[0];
    expect(ex.sets).toEqual([expect.objectContaining({ weight: 315, reps: 1 })]);
    s = replay(def, cfg, ws);
    expect(s.complete).toBe(true);
  });
});

describe("Coan–Phillipi", () => {
  const { cfg, def } = setup(coanPhillipi, { deadlift: 430 });

  it("week 1: 75%×2 heavy, 8×3 @ 60% speed, 3×8 assistance circuit", () => {
    const p = planDay(def, cfg, initialState(def, cfg));
    expect(p.dayId).toBe("P1");
    const [heavy, speed, ...acc] = p.exercises;
    expect(heavy.sets).toEqual([expect.objectContaining({ weight: 325, reps: 2 })]); // 322.5 → 325 (LiftVault sheet: 325)
    expect(speed.scheme).toBe("8×3");
    expect(speed.sets[0].weight).toBe(260); // 258 → 260
    expect(acc.map((a) => a.lift)).toEqual(["stiffLegDeadlift", "row", "latPulldown", "goodMorning"]);
    expect(acc[0].scheme).toBe("3×8");
  });

  it("moves through phases weekly, adds shrugs in week 5, pulls the goal in week 10", () => {
    const pull = (w: number, heavy: [number, number][], speed: [number, number][]) => W(`w${w}`, day(1 + w * 3), [[DL, heavy], [DL, speed]]);
    const ws = Array.from({ length: 10 }, (_, w) => pull(w, [[400, 2]], rep(3, 300, 3)));
    let s = replay(def, cfg, ws.slice(0, 4));
    let p = planDay(def, cfg, s);
    expect(p.dayId).toBe("P2");
    expect(p.exercises[0].scheme).toBe("3×3");
    expect(p.exercises[0].sets[0].weight).toBe(345); // 80% of 430 = 344
    const shrug = p.exercises.find((e) => e.lift === "shrug")!;
    expect(shrug.scheme).toBe("3×5");
    expect(shrug.sets[0].weight).toBe(245); // 60% of current (430/1.05 ≈ 409.5) ≈ 245.7
    s = replay(def, cfg, ws.slice(0, 8));
    p = planDay(def, cfg, s);
    expect(p.dayId).toBe("P4");
    expect(p.exercises.map((e) => e.lift)).toEqual(["deadlift", "deadlift", "shrug", "stiffLegDeadlift"]);
    expect(p.exercises[0].sets[0]).toMatchObject({ weight: 420, reps: 1 }); // 97.5% = 419.25
    s = replay(def, cfg, ws.slice(0, 9));
    p = planDay(def, cfg, s);
    expect(p.dayId).toBe("P5");
    expect(p.exercises[0].sets[0]).toMatchObject({ weight: 430, reps: 1 });
    expect(p.exercises[1].sets[0].weight).toBe(260);
    s = replay(def, cfg, ws);
    expect(s.complete).toBe(true);
  });

  it("logs heavy and speed pulls as separate slots", () => {
    const s = applyWorkout(def, cfg, initialState(def, cfg), W("a", day(2), [[DL, [[320, 2]]], [DL, rep(8, 260, 3)]]), 0);
    const r = s.log[0].results;
    expect(r.find((x) => x.slotId === "coan-p1-heavy")?.reps).toEqual([2]);
    expect(r.find((x) => x.slotId === "coan-p1-speed")?.reps).toHaveLength(8);
  });
});
