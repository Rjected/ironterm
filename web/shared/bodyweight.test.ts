import { describe, expect, it } from "vitest";
import { bodyweightTrend, mergeWeighIns, strengthVsBodyweight, trendAt, type WeighIn } from "./bodyweight";
import type { LiftPoint } from "./stats";
import { addDays } from "./stats";

const series = (start: string, days: number, kg: (i: number) => number, source: WeighIn["source"] = "manual"): WeighIn[] =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), kg: kg(i), source }));

describe("mergeWeighIns", () => {
  it("one reading per day, manual > hevy > whoop, earliest timed reading within a source", () => {
    const m = mergeWeighIns([
      { date: "2026-01-01", kg: 80, source: "whoop" },
      { date: "2026-01-01", kg: 81, source: "hevy" },
      { date: "2026-01-02T07:00:00Z", kg: 79, source: "whoop" },
      { date: "2026-01-03", kg: 82, source: "manual", time: "20:00" },
      { date: "2026-01-03", kg: 81.2, source: "manual", time: "06:30" },
      { date: "2026-01-03", kg: 85, source: "hevy" },
      { date: "2026-01-04", kg: 8, source: "manual" }, // typo
    ]);
    expect(m.map((d) => [d.date, d.kg, d.source])).toEqual([["2026-01-01", 81, "hevy"], ["2026-01-02", 79, "whoop"], ["2026-01-03", 81.2, "manual"]]);
    expect(m[0].sources).toEqual(["hevy", "whoop"]);
  });
  it("custom priority and averaging of untimed duplicates", () => {
    const m = mergeWeighIns([{ date: "2026-01-01", kg: 80, source: "hevy" }, { date: "2026-01-01", kg: 81, source: "hevy" }, { date: "2026-01-01", kg: 90, source: "manual" }], { priority: ["hevy", "manual", "whoop"] });
    expect(m[0]).toMatchObject({ kg: 80.5, source: "hevy" });
  });
});

describe("bodyweightTrend", () => {
  it("Hacker's Diet EWMA with α = 0.1 on daily data", () => {
    const t = bodyweightTrend(series("2026-01-01", 3, (i) => [80, 81, 79][i]));
    expect(t.points.map((p) => +p.trend.toFixed(4))).toEqual([80, 80.1, 79.99]);
  });
  it("gap-aware: a g-day gap weights the new reading 1 − 0.9^g", () => {
    const t = bodyweightTrend([{ date: "2026-01-01", kg: 80, source: "manual" }, { date: "2026-01-11", kg: 90, source: "manual" }]);
    expect(t.points[1].trend).toBeCloseTo(80 + (1 - 0.9 ** 10) * 10, 6);
    // a long break is almost a reset
    const r = bodyweightTrend([{ date: "2026-01-01", kg: 80, source: "manual" }, { date: "2026-03-01", kg: 90, source: "manual" }]);
    expect(r.points[1].trend).toBeGreaterThan(89.9);
  });
  it("steady loss of 0.5 kg/week → cutting, rate ≈ −0.5, 4-week change ≈ −2", () => {
    const t = bodyweightTrend(series("2026-01-01", 120, (i) => 90 - (0.5 / 7) * i + (i % 2 ? 0.4 : -0.4)));
    expect(t.weeklyRate!).toBeCloseTo(-0.5, 1);
    expect(t.weeklyRatePct!).toBeCloseTo((-0.5 / t.latest!.trend) * 100, 1);
    expect(t.change4w!).toBeCloseTo(-2, 0);
    expect(t.phase).toBe("cutting");
  });
  it("phases by % BW/week; lb output", () => {
    expect(bodyweightTrend(series("2026-01-01", 90, () => 80)).phase).toBe("maintaining");
    const bulk = bodyweightTrend(series("2026-01-01", 120, (i) => 70 + (0.35 / 7) * i), { unit: "lb" });
    expect(bulk.phase).toBe("bulking");
    expect(bulk.latest!.raw).toBeCloseTo((70 + 0.05 * 119) * 2.20462, 2);
  });
  it("no rate without a week of data; no phase when stale", () => {
    const t = bodyweightTrend(series("2026-01-01", 3, () => 80));
    expect(t.weeklyRate).toBeNull();
    expect(t.phase).toBeNull();
    expect(t.change4w).toBeNull();
    expect(bodyweightTrend(series("2026-01-01", 60, () => 80), { today: "2026-06-01" }).phase).toBeNull();
    expect(bodyweightTrend([]).latest).toBeNull();
  });
});

describe("trendAt / strengthVsBodyweight", () => {
  const t = bodyweightTrend([{ date: "2026-01-01", kg: 100, source: "manual" }, { date: "2026-01-02", kg: 100, source: "manual" }, { date: "2026-01-21", kg: 100, source: "manual" }]);
  it("interpolates and refuses far-away dates", () => {
    expect(trendAt(t, "2026-01-10")).toBeCloseTo(100);
    expect(trendAt(t, "2026-02-15")).toBeCloseTo(100);
    expect(trendAt(t, "2026-04-01")).toBeNull();
  });
  it("e1RM ÷ trend bodyweight", () => {
    const lp = (date: string, e1rm: number): LiftPoint => ({ date, workoutId: date, e1rm, topWeight: e1rm, topReps: 1, volume: e1rm, sets: [] });
    const r = strengthVsBodyweight(t, [lp("2026-01-05", 150), lp("2026-01-20", 200), lp("2026-09-01", 220)]);
    expect(r.map((x) => +x.ratio.toFixed(2))).toEqual([1.5, 2]);
  });
});
