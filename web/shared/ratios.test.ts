import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { currentBests, RATIO_DEFS, strengthBalance } from "./ratios";
import { toKg } from "./units";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const today = "2026-10-01";

describe("strengthBalance", () => {
  const ws = [
    W("old", "2025-06-01", [["Squat (Barbell)", [[500, 1]]]]), // outside 12 months
    W("a", "2026-09-01", [
      ["Squat (Barbell)", [[400, 1]]],
      ["Deadlift (Barbell)", [[480, 1]]], // 1.20 balanced
      ["Bench Press (Barbell)", [[300, 1]]], // 0.75 balanced
      ["Overhead Press (Barbell)", [[150, 1]]], // 0.50 of bench → low
      ["Front Squat", [[340, 1]]], // 0.85 balanced
      ["Bent Over Row (Barbell)", [[315, 1]]], // 1.05 of bench → high (bench lagging)
      ["Bench Press (Barbell)", [[200, 20]]], // >10 reps ignored
    ]),
  ];
  const b = strengthBalance(ws, "lb", { today });
  const r = (id: string) => b.ratios.find((x) => x.id === id)!;
  it("uses last-12-month bests from ≤10-rep sets", () => {
    expect(b.bests.squat.e1rm).toBeCloseTo(400, 6);
    expect(b.bests.bench.e1rm).toBeCloseTo(300, 6);
    expect(currentBests(ws, ["squat"], "lb", "2025-01-01").squat.e1rm).toBeCloseTo(500, 6);
  });
  it("classifies ratios against reference ranges", () => {
    expect(r("dl/squat")).toMatchObject({ status: "balanced", lagging: null });
    expect(r("dl/squat").ratio).toBeCloseTo(1.2, 6);
    expect(r("bench/squat").status).toBe("balanced");
    expect(r("front/back").status).toBe("balanced");
    expect(r("ohp/bench")).toMatchObject({ status: "low", lagging: "ohp" });
    expect(r("ohp/bench").note).toMatch(/Overhead Press is 50% of your Bench Press.*lagging/);
    expect(r("row/bench")).toMatchObject({ status: "high", lagging: "bench" });
    expect(b.ratios.find((x) => x.id === "pause/tng bench")).toBeUndefined(); // never trained
  });
  it("profile, weakest, lagging, summary", () => {
    expect(b.profile).toEqual({ squat: 1, bench: 0.75, deadlift: 1.2, ohp: 0.375 });
    expect(b.weakest!.id).toBe("ohp/bench"); // 0.05 below range vs 0.05 above but larger rel. to ref
    expect(b.lagging.sort()).toEqual(["bench", "ohp"]);
    expect(b.summary).toMatch(/2 of 5 ratios/);
  });
  it("flags stale comparisons and handles no data", () => {
    const s = strengthBalance([
      W("x", "2025-11-01", [["Squat (Barbell)", [[400, 1]]]]),
      W("y", "2026-09-01", [["Deadlift (Barbell)", [[480, 1]]]]),
    ], "lb", { today });
    expect(s.ratios[0].stale).toBe(true);
    expect(s.ratios[0].note).toMatch(/months apart/);
    expect(strengthBalance([], "lb", { today }).summary).toMatch(/Not enough/);
  });
  it("every reference has a source and a sane range", () => {
    for (const d of RATIO_DEFS) { expect(d.source).toBeTruthy(); expect(d.lo).toBeLessThanOrEqual(d.ref); expect(d.hi).toBeGreaterThanOrEqual(d.ref); }
  });
});
