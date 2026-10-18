import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { initialState, planDay, replay } from "./program";
import { buildProgram, defaultConfig } from "./programs";
import { applyRamp, onTrip, rampFactors, returnStats, travelDays, travelSessions, type Trip } from "./travel";
import { toKg } from "./units";

const W = (date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id: date, title: date, start_time: `${date}T17:00:00Z`, end_time: `${date}T18:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);

describe("re-entry", () => {
  const cfg = defaultConfig("gzclp", "lb", "2026-01-01");
  cfg.options.curls = "off";
  const def = buildProgram(cfg)!;
  const a1 = (date: string, sq: number, sqReps: number[], bench: number) =>
    W(date, [["Squat (Barbell)", sqReps.map((r) => [sq, r] as [number, number])], ["Bench Press (Barbell)", rep(3, bench, 10)]]);

  it("a lighter session after a break doesn't lower the weight or step down", () => {
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), a1("2026-01-26", 165, [3, 3, 3, 2], 130)];
    const s = replay(def, cfg, ws);
    expect(s.slots["a1-t1"]).toMatchObject({ weight: 195, stage: 0 }); // not 165+10, not 6×2+
    expect(s.slots["a1-t2"].weight).toBe(150);
    expect(s.log[1].results[0].outcome).toBe("hold");
    expect(s.log[1].results[0].note).toContain("re-entry 1/3 after 21 days");
    expect(s.reentry).toMatchObject({ gapDays: 21, total: 3, done: 1 });
  });

  it("hitting the pre-break weight during re-entry still counts", () => {
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), a1("2026-01-19", 195, [3, 3, 3, 3, 5], 150)];
    expect(replay(def, cfg, ws).slots["a1-t1"].weight).toBe(205);
  });

  it("a break you're still on shows up in the next plan, lighter", () => {
    const s = replay(def, cfg, [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145)], { today: "2026-01-20" });
    expect(s.reentry).toMatchObject({ gapDays: 15, total: 3, done: 0 });
    const p = applyRamp(planDay(def, cfg, s, 0), s.reentry!, "lb", def);
    expect(p.exercises[0].sets[0].weight).toBe(170); // 195 × 0.88 → 170
    expect(p.exercises[0].sets.some((x) => x.amrap)).toBe(false);
    expect(p.exercises[1].sets.length).toBe(2); // 3×10 → 2 sets
    expect(p.exercises[1].sets[0].reps).toBe(8);
  });

  it("ramp factors climb back to 100%", () => {
    expect(rampFactors({ gapDays: 12, total: 2, done: 0 })).toEqual({ load: 0.92, volume: 0.6 });
    expect(rampFactors({ gapDays: 30, total: 4, done: 3 }).load).toBeCloseTo(0.955, 3);
  });

  it("re-entry can be turned off", () => {
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), a1("2026-01-26", 165, [3, 3, 3, 2], 130)];
    expect(replay(def, cfg, ws, { reentry: false }).slots["a1-t1"].stage).toBe(1);
  });
});

describe("trips", () => {
  const trip: Trip = { id: "t", name: "Santa Cruz", start: "2026-09-16", end: "2026-09-28", gym: "hotel", equipment: { dumbbells: 50, bench: true, cable: true }, perWeek: 2 };
  it("finds the trip for a date and spaces maintenance days", () => {
    expect(onTrip([trip], "2026-09-20")?.name).toBe("Santa Cruz");
    expect(onTrip([trip], "2026-09-29")).toBeNull();
    expect(travelDays(trip)).toEqual(["2026-09-17", "2026-09-20", "2026-09-23", "2026-09-26"]);
  });

  it("builds A/B sessions that fit the equipment, loads capped by the dumbbells", () => {
    const [a, b] = travelSessions(trip, (l) => ({ squat: 260, bench: 210, deadlift: 300, ohp: 115 })[l] ?? null, "lb");
    expect(a.exercises.map((e) => e.lift)).toEqual(["gobletSquat", "dbRdl", "dbBench", "cableRow", "lateralRaise"]);
    expect(a.exercises[0].sets[0].weight).toBe(50); // 0.25 × 260 = 65 → capped at 50
    expect(b.exercises[0].lift).toBe("bulgarianSplitSquat");
    const none = travelSessions({ ...trip, gym: "none" }, () => null, "lb");
    expect(none[0].exercises.map((e) => e.lift)).toEqual(["lunge", "gluteHamRaise", "pushUp", "invertedRow"]);
  });
});

describe("return stats", () => {
  it("measures the first session back vs before", () => {
    const sq = (d: string, w: number) => W(d, [["Squat (Barbell)", rep(3, w, 5)]]);
    const ws = [sq("2025-01-01", 250), sq("2025-01-04", 255), sq("2025-01-20", 245), sq("2025-01-23", 255), sq("2025-01-26", 260)];
    const r = returnStats(ws, "squat", "lb", "UTC");
    expect(r.breaks).toBe(1);
    expect(r.firstSession).toBeCloseTo(245 / 255, 3);
    expect(r.sessionsToRecover).toBe(2);
  });
});
