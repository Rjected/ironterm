import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { addDays } from "./stats";
import { e1rmFrom, impliedRpe, loadFor, pctAt, personalChart, standardChart, standardPct } from "./rpe";

describe("standard RTS chart", () => {
  it("matches published values", () => {
    expect(standardPct(1, 10)).toBe(1);
    expect(standardPct(1, 9)).toBeCloseTo(0.955, 4);
    expect(standardPct(3, 8)).toBeCloseTo(0.863, 4);
    expect(standardPct(5, 8)).toBeCloseTo(0.811, 4);
    expect(standardPct(10, 10)).toBeCloseTo(0.739, 4);
    expect(standardPct(12, 6)).toBeCloseTo(0.572, 4);
    expect(standardPct(1, 9.5)).toBeCloseTo(0.978, 4);
  });

  it("full 12×9 table, monotone in reps and RPE", () => {
    const c = standardChart();
    expect(c.pct).toHaveLength(12);
    for (const row of c.pct) expect(row).toHaveLength(9);
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 9; j++) {
        if (i) expect(c.pct[i][j]).toBeLessThan(c.pct[i - 1][j]);
        if (j) expect(c.pct[i][j]).toBeGreaterThan(c.pct[i][j - 1]);
      }
    expect(c.pct[4][4]).toBeCloseTo(0.811, 4); // 5 @ 8
  });

  it("loadFor ↔ e1rmFrom round-trip, including between cells and off the table", () => {
    const c = standardChart();
    expect(loadFor(c, 200, 5, 8)).toBeCloseTo(162.2, 1);
    for (const [r, e] of [[3, 8], [5, 8.25], [2.5, 9], [14, 7], [4, 5.5]]) {
      const w = loadFor(c, 180, r, e);
      expect(e1rmFrom(c, w, r, e)).toBeCloseTo(180, 6);
    }
    expect(pctAt(c, 14, 10)).toBeLessThan(pctAt(c, 12, 10));
  });

  it("impliedRpe inverts the chart", () => {
    expect(impliedRpe(0.863, 3)).toBeCloseTo(8, 2);
    expect(impliedRpe(0.811, 5)).toBeCloseTo(8, 2);
  });
});

// Each session: an RPE-free anchor 100×5 (Epley e1RM 116.67) plus `n` sets of 5 @ 8 at `obs` of that.
const REF = 100 * (1 + 5 / 30);
const sessions = (count: number, obs: number, rpe = 8): HevyWorkout[] =>
  Array.from({ length: count }, (_, i) => {
    const d = addDays("2026-06-01", i * 3);
    return {
      id: `w${i}`, title: "w", start_time: `${d}T12:00:00Z`, end_time: `${d}T13:00:00Z`,
      exercises: [{ title: "Squat (Barbell)", exercise_template_id: "x", sets: [
        { type: "normal", weight_kg: 100, reps: 5, rpe: null },
        { type: "normal", weight_kg: REF * obs, reps: 5, rpe },
      ] }],
    };
  });

describe("personalChart", () => {
  const std = standardPct(5, 8); // 0.811
  const obs = 0.822;

  it("no RPE data → standard chart", () => {
    const c = personalChart(sessions(5, obs).map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.slice(0, 1) })) })), "squat", "kg");
    expect(c.totalSamples).toBe(0);
    expect(c.pct).toEqual(standardChart().pct);
    expect(c.summary).toMatch(/standard chart/);
  });

  it("few samples stay near the standard value; many move toward what you lift", () => {
    const few = personalChart(sessions(2, obs), "squat", "kg", { pooled: false });
    const many = personalChart(sessions(30, obs), "squat", "kg", { pooled: false });
    expect(few.samples[4][4]).toBe(2);
    expect(many.samples[4][4]).toBe(30);
    expect(few.observed[4][4]).toBeCloseTo(obs, 6);
    const f = few.pct[4][4], m = many.pct[4][4];
    expect(f).toBeCloseTo((6 * std + 2 * obs) / 8, 6);
    expect(m).toBeCloseTo((6 * std + 30 * obs) / 36, 6);
    expect(Math.abs(f - std)).toBeLessThan(Math.abs(f - obs));
    expect(Math.abs(m - obs)).toBeLessThan(Math.abs(m - std));
    // untouched cells stay standard without pooling
    expect(many.pct[0][8]).toBe(1);
  });

  it("reports the overall offset and pools it into empty cells", () => {
    const c = personalChart(sessions(30, obs), "squat", "kg");
    expect(c.offsetPct).toBeCloseTo(obs - std, 6);
    expect(c.offsetRpe).toBeGreaterThan(0.25);
    expect(c.summary).toMatch(/grind harder/);
    expect(c.pct[2][4]).toBeGreaterThan(standardPct(3, 8)); // empty cell nudged up
    expect(c.pct[2][4] - standardPct(3, 8)).toBeLessThan(obs - std);
  });

  it("easier-than-chart lifter gets a negative offset", () => {
    const c = personalChart(sessions(20, 0.78), "squat", "kg");
    expect(c.offsetRpe).toBeLessThan(-0.25);
    expect(c.summary).toMatch(/harder than the chart/);
  });

  it("round-trips with a personal chart", () => {
    const c = personalChart(sessions(30, obs), "squat", "kg");
    const w = loadFor(c, 150, 5, 8);
    expect(w).toBeGreaterThan(loadFor(standardChart(), 150, 5, 8));
    expect(e1rmFrom(c, w, 5, 8)).toBeCloseTo(150, 6);
  });
});
