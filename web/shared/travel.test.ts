import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { initialState, planDay, rampLength, rampNeed, replay } from "./program";
import { buildProgram, defaultConfig } from "./programs";
import { applyRamp, onTrip, rampFactors, rampInfo, returnStats, travelDays, travelSessions, type Trip } from "./travel";
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
    expect(s.log[1].results[0].note).toContain("re-entry 1/6 after 21 days");
    // squat and bench each got one exposure; squat needs 4 (lower body ramps slower), bench 3
    expect(s.reentry).toMatchObject({ gapDays: 21, total: 6, done: 1, seen: { squat: 1, bench: 1 } });
  });

  it("hitting the pre-break weight during re-entry still counts", () => {
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), a1("2026-01-19", 195, [3, 3, 3, 3, 5], 150)];
    expect(replay(def, cfg, ws).slots["a1-t1"].weight).toBe(205);
  });

  it("a break you're still on shows up in the next plan, lighter", () => {
    const s = replay(def, cfg, [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145)], { today: "2026-01-20" });
    // squat/deadlift are on 2 of 4 days and need 4 exposures: the ramp runs to its cap, 2 × 3
    expect(s.reentry).toMatchObject({ gapDays: 15, total: 6, done: 0 });
    const p = applyRamp(planDay(def, cfg, s, 0), s.reentry!, "lb", def);
    expect(p.exercises[0].sets[0].weight).toBe(170); // 195 × 0.88 → 170
    expect(p.exercises[0].sets.some((x) => x.amrap)).toBe(false);
    expect(p.exercises[0].sets.length).toBe(3); // squat 5×3+ → 3 sets: legs get less volume too
    expect(p.exercises[1].sets.length).toBe(2); // bench 3×10 → 2 sets
    expect(p.exercises[1].sets[0].reps).toBe(8);
    expect(p.exercises[0].note).toContain("Re-entry 1/6 after 15 days off: 88% load, ~50% volume");
    expect(p.exercises[0].note).toContain("Back Squat ramps slower (88%, ~40% volume)");
  });

  it("ramp factors climb back to 100%", () => {
    expect(rampFactors({ gapDays: 12, total: 2, done: 0 })).toEqual({ load: 0.92, volume: 0.6 });
    expect(rampFactors({ gapDays: 30, total: 4, done: 3 }).load).toBeCloseTo(0.955, 3);
  });

  it("each lift ramps by its own exposures; legs need one more", () => {
    const r = { gapDays: 30, total: 6, done: 2, seen: { bench: 3, squat: 3 } };
    expect(rampNeed(r, "bench")).toBe(4);
    expect(rampNeed(r, "squat")).toBe(5);
    expect(rampFactors(r, "bench").load).toBeCloseTo(0.82 + 0.18 * 0.75, 3);
    expect(rampFactors(r, "squat").load).toBeCloseTo(0.82 + 0.18 * 0.6, 3);
    expect(rampFactors(r, "squat").volume).toBeLessThan(rampFactors(r, "bench").volume);
    // a lift not trained during the ramp yet starts at the bottom
    expect(rampFactors(r, "ohp")).toEqual({ load: 0.82, volume: 0.5 });
  });

  it("longer breaks ramp longer and start lighter", () => {
    expect([10, 20, 40, 80, 200].map((g) => rampLength(g))).toEqual([2, 3, 4, 6, 8]);
    expect(rampFactors({ gapDays: 80, total: 6, done: 0 }).load).toBe(0.78);
    expect(rampFactors({ gapDays: 200, total: 8, done: 0 }).load).toBe(0.72);
  });

  it("a day without squat doesn't move the squat ramp", () => {
    const b1 = (date: string) => W(date, [["Overhead Press (Barbell)", rep(5, 70, 3)], ["Deadlift (Barbell)", rep(3, 120, 10)]]);
    const s = replay(def, cfg, [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), b1("2026-01-26")]);
    expect(s.reentry?.seen).toEqual({ ohp: 1, deadlift: 1 });
    const p = applyRamp(planDay(def, cfg, s, 2), s.reentry!, "lb", def); // A2: bench T1, squat T2
    expect(p.exercises.find((e) => e.lift === "squat")!.sets.length).toBe(1); // 3×10 at 40% volume
  });

  it("hitting your normal weight ends that lift's ramp early", () => {
    // first session back: squat at the full 195 for 5×3 → squat is back; bench at 130 isn't
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), a1("2026-01-26", 195, [3, 3, 3, 3, 3], 130)];
    const s = replay(def, cfg, ws);
    expect(s.reentry?.seen?.squat).toBe(4);
    expect(s.reentry?.seen?.bench).toBe(1);
    const p = applyRamp(planDay(def, cfg, s, 0), s.reentry!, "lb", def);
    expect(p.exercises[0].sets[0].weight).toBe(s.slots["a1-t1"].weight); // full squat weight
    expect(p.exercises[0].sets.length).toBe(5);
    expect(p.exercises[1].sets[0].weight).toBeLessThan(s.slots["a1-t2"].weight);
  });

  it("the ramp ends as soon as every main lift is back", () => {
    const b1 = (date: string, ohp: number, dl: number) => W(date, [["Overhead Press (Barbell)", rep(5, ohp, 3)], ["Deadlift (Barbell)", rep(3, dl, 10)]]);
    const a2 = (date: string, bench: number, sq: number) => W(date, [["Bench Press (Barbell)", rep(5, bench, 3)], ["Squat (Barbell)", rep(3, sq, 10)]]);
    const ws = [a1("2026-01-05", 185, [3, 3, 3, 3, 6], 145), b1("2026-01-07", 95, 205), a2("2026-01-09", 135, 150),
      // 3 weeks off, then everything at full weight
      W("2026-01-31", [["Deadlift (Barbell)", rep(5, 245, 3)], ["Overhead Press (Barbell)", rep(3, 70, 10)]]),
      a1("2026-02-02", 195, [3, 3, 3, 3, 3], 150), b1("2026-02-04", 100, 215), a2("2026-02-06", 140, 160)];
    const s = replay(def, cfg, ws);
    expect(s.log.length).toBe(7);
    expect(s.reentry).toBeUndefined();
  });

  it("explains the ramp in words: where you are, slower lifts, lifts already back", () => {
    const r = { gapDays: 21, total: 6, done: 1, seen: { squat: 1, bench: 1, deadlift: 4 } };
    const info = rampInfo(r, ["squat", "bench", "deadlift"], "gzclp");
    expect(info.headline).toBe("Session 2 of 6 back after 21 days off");
    expect(info.text).toBe(
      "Session 2 of 6 back after 21 days off: 92% load, ~67% volume, no all-out sets. " +
      "Back Squat ramps slower (91%, ~55% volume): legs get more sore, so they get one more light session. " +
      "Deadlift is back to full. " +
      "These sessions can't count against your progression; hit your normal weight and that lift is done ramping.");
    expect(info.lifts.map((x) => [x.lift, x.slower, x.back])).toEqual([["squat", true, false], ["bench", false, false], ["deadlift", true, true]]);
    expect(info.suggest).toEqual([]);
  });

  it("suggests a comeback block after a month or more off, unless you're on one", () => {
    const r = { gapDays: 45, total: 4, done: 0, seen: {} };
    expect(rampInfo(r, ["squat"], "gzclp").suggest).toEqual([
      { templateId: "comeback", name: "Return to Training", weeks: "3" }, { templateId: "comeback-squat", name: "Squat Comeback", weeks: "3" }]);
    expect(rampInfo(r, ["squat"], "gzclp").text).toContain("a short comeback block (Return to Training or Squat Comeback)");
    expect(rampInfo({ ...r, gapDays: 120 }, ["squat"]).suggest[0].weeks).toBe("4");
    expect(rampInfo(r, ["squat"], "comeback-squat").suggest).toEqual([]);
    expect(rampInfo({ ...r, gapDays: 20 }, ["squat"]).suggest).toEqual([]);
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
