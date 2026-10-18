import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { initialState, isScheduled, planDay, replay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { returnToTraining, squatComeback } from "./comeback";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const TMS = { squat: 300, bench: 200, deadlift: 400, ohp: 120 };

function setup(t: ProgramTemplate, options: Record<string, string> = {}) {
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: TMS };
  return { cfg, def: t.build(opts) };
}
/** Every session of program week `wk` (0-based), in order. */
function week(t: ProgramTemplate, wk: number, options: Record<string, string> = {}) {
  const { cfg, def } = setup(t, options);
  const st = { ...initialState(def, cfg), rotations: wk };
  return def.days.map((d, i) => (isScheduled(d, wk) ? planDay(def, cfg, st, i) : null)).filter((p) => !!p);
}
const squats = (p: ReturnType<typeof week>[number]) => p.exercises.filter((e) => e.lift === "squat" || e.lift === "pauseSquat");

describe("comeback templates build", () => {
  it.each([returnToTraining, squatComeback])("$id: every option, finite, matches its length", (t) => {
    for (const weeks of ["2", "3", "4"]) for (const days of ["3", "4"]) {
      const { def } = setup(t, { weeks, days });
      expect(def.cycle).toMatchObject({ weeks: Number(weeks), finite: true });
      expect(def.builtInRamp).toBe(true);
      expect(def.maxLabel).toBe("Pre-break e1RM");
      expect(def.notes?.at(-1)).toContain("go back to your regular program");
      for (const d of def.days) expect(new Set(d.slots.map((x) => x.id)).size).toBe(d.slots.length);
    }
    expect(setup(t).def.cycle?.weeks).toBe(t.weeks);
  });
});

describe("Return to Training", () => {
  it("squats every session, starting light with few sets and building to ~88%", () => {
    const w1 = week(returnToTraining, 0, { weeks: "4" });
    expect(w1).toHaveLength(3);
    for (const p of w1) expect(squats(p)).toHaveLength(1);
    expect(squats(w1[0])[0].sets).toHaveLength(2);
    expect(squats(w1[0])[0].sets[0]).toMatchObject({ weight: 210, reps: 5, amrap: false, rpe: 6 }); // 70% of 300
    expect(squats(w1[1])[0].sets[0].weight).toBe(180); // light day 60%
    const w4 = week(returnToTraining, 3, { weeks: "4" });
    expect(squats(w4[2])[0].sets[0]).toMatchObject({ weight: 265, reps: 3 }); // 88% → 264 → 265
    for (const wk of [0, 1, 2, 3]) for (const p of week(returnToTraining, wk, { weeks: "4" })) for (const e of p.exercises) expect(e.sets.length).toBeLessThanOrEqual(4);
  });

  it("shorter breaks start further along the same ramp", () => {
    expect(squats(week(returnToTraining, 0, { weeks: "2" })[0])[0].sets[0].weight).toBe(240); // 80%
    expect(squats(week(returnToTraining, 0, { weeks: "3" })[0])[0].sets[0].weight).toBe(225); // 75%
    expect(squats(week(returnToTraining, 1, { weeks: "2" })[2])[0].sets[0].weight).toBe(265); // ends at 88% either way
  });

  it("no re-entry ramp on top, maxes don't move, and the block completes", () => {
    const { cfg, def } = setup(returnToTraining, { weeks: "2" });
    const sq = (lb: number, n: number, r: number): [string, [number, number][]] => ["Squat (Barbell)", Array.from({ length: n }, () => [lb, r] as [number, number])];
    // logged a month after the last training: still no reentry
    const ws = [0, 2, 4, 7, 9, 11].map((d, i) => W(`w${i}`, `2026-02-${String(2 + d).padStart(2, "0")}`, [sq(250, 3, 5)]));
    const s = replay(def, cfg, ws, { today: "2026-03-30" });
    expect(s.reentry).toBeUndefined();
    expect(s.tms).toEqual(TMS);
    expect(s.complete).toBe(true);
  });
});

describe("Squat Comeback", () => {
  it("squats every session, 3–4 times a week, never more than 3 sets", () => {
    for (const days of ["3", "4"]) for (const weeks of ["2", "3", "4"]) for (let wk = 0; wk < Number(weeks); wk++) {
      const ps = week(squatComeback, wk, { days, weeks });
      expect(ps).toHaveLength(Number(days));
      for (const p of ps) {
        expect(squats(p)).toHaveLength(1);
        expect(squats(p)[0].sets.length).toBeLessThanOrEqual(3);
        expect(squats(p)[0].sets.some((x) => x.amrap)).toBe(false);
      }
    }
  });

  it("loads climb from ~70% to ~88% of the pre-break e1RM", () => {
    const top = (wk: number, weeks: string) => Math.max(...week(squatComeback, wk, { weeks }).flatMap((p) => squats(p)[0].sets.map((x) => x.weight)));
    expect(squats(week(squatComeback, 0, { weeks: "4" })[0])[0].sets[0].weight).toBe(210); // 70%
    expect(top(0, "4")).toBe(225); // 75% triples
    expect(top(3, "4")).toBe(265); // 88% triples
    expect(top(2, "3")).toBe(265);
  });

  it("slow lowering and pauses come in after the first week", () => {
    const light = (wk: number, weeks: string) => week(squatComeback, wk, { weeks })[1];
    expect(squats(light(0, "4"))[0].lift).toBe("squat");
    expect(squats(light(1, "4"))[0]).toMatchObject({ lift: "pauseSquat" });
    expect(squats(light(1, "4"))[0].note).toContain("3 seconds down");
    expect(squats(light(1, "4"))[0].sets[0].weight).toBe(180); // still % of the squat e1RM
    // shorter blocks start past week 1 of the ramp
    expect(squats(light(0, "3"))[0].lift).toBe("pauseSquat");
    expect(squats(light(0, "2"))[0].lift).toBe("pauseSquat");
  });

  it("three-day option drops the speed day", () => {
    expect(week(squatComeback, 0, { days: "3" }).map((p) => p.dayId)).toEqual(["D1", "D2T", "D3"]);
    expect(week(squatComeback, 0, { days: "4", weeks: "4" }).map((p) => p.dayId)).toEqual(["D1", "D2", "D3", "D4"]);
  });
});
