// Tests for the generic progression kinds, using tiny inline programs.
import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramDef, type SlotDef } from "./program";
import { toKg } from "./units";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number | number[]) => Array.from({ length: n }, (_, i) => [lb, Array.isArray(reps) ? reps[i] : reps] as [number, number]);
const SQ = "Squat (Barbell)";
const cfg = (over: Partial<ProgramConfig> = {}): ProgramConfig => ({ templateId: "t", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: {}, ...over });
const one = (slot: SlotDef, extra: Partial<ProgramDef> = {}): ProgramDef => ({ templateId: "t", name: "t", sessionsPerWeek: 3, days: [{ id: "A", name: "A", slots: [slot] }], ...extra });

describe("stages: StrongLifts-style 3 strikes then deload", () => {
  const def = one({ id: "sq", lift: "squat", tier: "MAIN", progression: { kind: "stages", stages: [{ sets: 5, reps: 5, amrap: false }], advance: { type: "baseVolume" }, onFinalFail: { type: "deload", pct: 0.1 }, increment: { lb: 5, kg: 2.5 }, failsBeforeAction: 3 } });
  const c = cfg({ startWeights: { sq: 200 } });
  it("retries twice, deloads 10% on the third miss", () => {
    let s = initialState(def, c);
    const miss = W("m", "2026-01-02", [[SQ, rep(5, 200, [5, 5, 5, 4, 3])]]);
    s = applyWorkout(def, c, s, miss, 0);
    expect(s.slots.sq).toMatchObject({ weight: 200, fails: 1 });
    expect(s.log[0].results[0].outcome).toBe("fail");
    s = applyWorkout(def, c, s, miss, 0);
    s = applyWorkout(def, c, s, miss, 0);
    expect(s.slots.sq).toMatchObject({ weight: 180, fails: 0 });
    s = applyWorkout(def, c, s, W("ok", "2026-01-09", [[SQ, rep(5, 180, 5)]]), 0);
    expect(s.slots.sq.weight).toBe(185);
  });
});

describe("stages: GreySkull AMRAP bonus", () => {
  const def = one({ id: "b", lift: "bench", tier: "MAIN", progression: { kind: "stages", stages: [{ sets: 3, reps: 5, amrap: true }], advance: { type: "baseVolume" }, onFinalFail: { type: "deload", pct: 0.1 }, increment: { lb: 2.5, kg: 1.25 }, amrapBonus: { reps: 10, increments: 2 } } });
  const c = cfg({ startWeights: { b: 135 } });
  it("doubles the jump for 10+ on the last set", () => {
    const s = applyWorkout(def, c, initialState(def, c), W("x", "2026-01-02", [["Bench Press (Barbell)", [[135, 5], [135, 5], [135, 11]]]]), 0);
    expect(s.slots.b.weight).toBe(140);
  });
});

describe("double progression", () => {
  const def = one({ id: "r", lift: "dbRow", tier: "ACC", progression: { kind: "double", sets: 3, reps: [8, 12], increment: { lb: 5, kg: 2 } } });
  const c = cfg({ startWeights: { r: 60 } });
  it("holds until every set hits the top, then adds weight; follows the weight used", () => {
    let s = initialState(def, c);
    expect(planDay(def, c, s).exercises[0].scheme).toBe("3×8–12");
    s = applyWorkout(def, c, s, W("a", "2026-01-02", [["Dumbbell Row", rep(3, 60, [12, 11, 10])]]), 0);
    expect(s.slots.r.weight).toBe(60);
    s = applyWorkout(def, c, s, W("b", "2026-01-04", [["Dumbbell Row", rep(3, 60, 12)]]), 0);
    expect(s.slots.r.weight).toBe(65);
    s = applyWorkout(def, c, s, W("c", "2026-01-06", [["Dumbbell Row", rep(3, 70, 9)]]), 0);
    expect(s.slots.r.weight).toBe(70);
  });
});

describe("percent: SBS-style reps vs target moves TM by %", () => {
  const def = one({ id: "s", lift: "squat", tier: "MAIN", progression: {
    kind: "percent", tmLift: "squat", weeks: [[...rep(4, 0, 0).map(() => ({ pct: 0.75, reps: 6 })), { pct: 0.75, reps: 6, amrap: true, target: 10 }]],
    tmRule: { type: "amrapVsTarget", setIndex: 4, table: [{ diff: -99, pct: -0.05 }, { diff: -1, pct: -0.02 }, { diff: 0, pct: 0 }, { diff: 1, pct: 0.005 }, { diff: 2, pct: 0.01 }, { diff: 3, pct: 0.015 }, { diff: 4, pct: 0.02 }, { diff: 5, pct: 0.03 }] },
  } });
  const c = cfg({ trainingMaxes: { squat: 300 } });
  it("+3 reps → +1.5%, −1 → −2%", () => {
    const s0 = initialState(def, c);
    const w = planDay(def, c, s0).exercises[0].sets[0].weight;
    expect(w).toBe(225);
    const up = applyWorkout(def, c, s0, W("u", "2026-01-02", [[SQ, [...rep(4, 225, 6), [225, 13]]]]), 0);
    expect(up.tms.squat).toBe(304.5); // 300 × 1.5%, not rounded (loads are rounded when planned)
    const down = applyWorkout(def, c, s0, W("d", "2026-01-02", [[SQ, [...rep(4, 225, 6), [225, 9]]]]), 0);
    expect(down.tms.squat).toBe(294);
  });
});

describe("percent: RPE sets and e1RM TM", () => {
  const def = one({ id: "s", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ rpe: 8, reps: 3 }, { pct: 0.8, reps: 3 }]], tmRule: { type: "e1rm", setIndex: 0, pct: 0.9 } } });
  const c = cfg({ trainingMaxes: { squat: 300 } });
  it("RPE set has no load; e1RM of top set sets the new TM", () => {
    const s0 = initialState(def, c);
    const p = planDay(def, c, s0).exercises[0];
    expect(p.sets[0]).toMatchObject({ weight: 0, rpe: 8 });
    expect(p.sets[1].weight).toBe(240);
    const s = applyWorkout(def, c, s0, W("x", "2026-01-02", [[SQ, [[315, 3], [240, 3]]]]), 0);
    expect(s.tms.squat).toBe(310); // 315×(1+3/30)=346.5 ×0.9 = 311.85 → 310
  });
});

describe("finite block with per-week days", () => {
  const sl = (id: string, pct: number): SlotDef => ({ id, lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct, reps: 3 }]] } });
  const def: ProgramDef = {
    templateId: "t", name: "block", sessionsPerWeek: 2,
    cycle: { weeks: 2, finite: true },
    days: [
      { id: "W1D1", name: "", slots: [sl("a", 0.7)], weeks: [0] },
      { id: "W1D2", name: "", slots: [sl("b", 0.75)], weeks: [0] },
      { id: "W2D1", name: "", slots: [sl("c", 0.8)], weeks: [1] },
    ],
  };
  const c = cfg({ trainingMaxes: { squat: 300 } });
  it("walks only the scheduled days and completes", () => {
    const sq = (d: string, w: number) => W(d, d, [[SQ, rep(3, w, 3)]]);
    let s = replay(def, c, [sq("2026-01-02", 210)]);
    expect(def.days[s.dayIndex].id).toBe("W1D2");
    s = replay(def, c, [sq("2026-01-02", 210), sq("2026-01-04", 225)]);
    expect(def.days[s.dayIndex].id).toBe("W2D1");
    expect(planDay(def, c, s).week).toBe(1);
    s = replay(def, c, [sq("2026-01-02", 210), sq("2026-01-04", 225), sq("2026-01-09", 240)]);
    expect(s.complete).toBe(true);
  });
});

describe("AMRAP sets only have a floor", () => {
  const def = one({ id: "dl", lift: "deadlift", tier: "MAIN", progression: { kind: "stages", stages: [{ sets: 1, reps: 5, amrap: true }], advance: { type: "baseVolume" }, onFinalFail: { type: "deload", pct: 0.1 }, increment: { lb: 10, kg: 5 } } });
  const c = cfg({ startWeights: { dl: 225 } });
  it("1×5+ done for 8 counts as a success", () => {
    const s = applyWorkout(def, c, initialState(def, c), W("x", "2026-01-02", [["Deadlift (Barbell)", [[135, 5], [225, 8]]]]), 0);
    expect(s.log[0].results[0].outcome).toBe("success");
    expect(s.slots.dl.weight).toBe(235);
  });
});

describe("percent TM rules: allSets and weekEnd", () => {
  const mk = (applyAt?: "now" | "weekEnd"): ProgramDef => ({
    templateId: "t", name: "t", sessionsPerWeek: 2,
    days: [
      { id: "H", name: "", slots: [{ id: "h", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 1, reps: 12, amrap: true, target: 12 }, { pct: 1, reps: 12, amrap: true, target: 12 }]], tmRule: { type: "amrapVsTarget", setIndex: 0, allSets: true, applyAt, table: [{ diff: -99, increments: 0 }, { diff: 0, increments: 2 }] } } }] },
      { id: "L", name: "", slots: [{ id: "l", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 0.8, reps: 8 }]] } }] },
    ],
  });
  const c = cfg({ trainingMaxes: { squat: 200 } });
  it("needs every set at the target", () => {
    const def = mk();
    const s = applyWorkout(def, c, initialState(def, c), W("x", "2026-01-02", [[SQ, [[200, 12], [200, 10]]]]), 0);
    expect(s.tms.squat).toBe(200);
  });
  it("weekEnd defers the bump past the rest of the week", () => {
    const def = mk("weekEnd");
    let s = applyWorkout(def, c, initialState(def, c), W("x", "2026-01-02", [[SQ, [[200, 12], [200, 12]]]]), 0);
    expect(s.tms.squat).toBe(200);
    expect(planDay(def, c, s).exercises[0].sets[0].weight).toBe(160);
    s = applyWorkout(def, c, s, W("y", "2026-01-04", [[SQ, [[160, 8]]]]), 1);
    expect(s.tms.squat).toBe(210);
  });
});

describe("percent: totalReps rule (VDIP)", () => {
  const def = one({ id: "v", lift: "squat", tier: "T1", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 1, reps: 5, amrap: true }, { pct: 1, reps: 5, amrap: true }, { pct: 1, reps: 5, amrap: true }]], tmRule: { type: "totalReps", table: [{ minReps: 0, pct: -0.1 }, { minReps: 10, increments: 1 }, { minReps: 15, increments: 2 }] } } });
  const c = cfg({ trainingMaxes: { squat: 200 } });
  it("adds up reps across the sets", () => {
    const s = (reps: number[]) => applyWorkout(def, c, initialState(def, c), W("x", "2026-01-02", [[SQ, reps.map((r) => [200, r] as [number, number])]]), 0).tms.squat;
    expect(s([6, 5, 5])).toBe(210);
    expect(s([4, 4, 3])).toBe(205);
    expect(s([3, 3, 2])).toBe(180);
  });
});
