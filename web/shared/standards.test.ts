import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { dots, dotsCoefficient, ipfGl, strengthProfile, strengthTier, wilks, wilks2020, wilksCoefficient } from "./standards";

describe("points formulas", () => {
  it("classic Wilks matches the published coefficient table", () => {
    // Wilks table values: men 100 kg 0.6086, men 90 kg 0.6384, women 60 kg 1.1149
    expect(wilksCoefficient(100, "male")).toBeCloseTo(0.6086, 4);
    expect(wilksCoefficient(90, "male")).toBeCloseTo(0.6384, 4);
    expect(wilksCoefficient(60, "female")).toBeCloseTo(1.1149, 4);
    expect(wilks(600, 90, "male")).toBeCloseTo(383.04, 1);
  });

  it("DOTS", () => {
    // Values from the published quartic (Konertz 2019) as OpenPowerlifting computes them
    expect(dots(1000, 100, "male")).toBeCloseTo(615.52, 1);
    expect(dots(700, 90, "male")).toBeCloseTo(452.62, 1);
    expect(dots(400, 60, "female")).toBeCloseTo(443.42, 1);
    // bodyweight is clamped at the ends of the fitted range
    expect(dotsCoefficient(250, "male")).toBe(dotsCoefficient(210, "male"));
    expect(dotsCoefficient(30, "female")).toBe(dotsCoefficient(40, "female"));
  });

  it("Wilks 2020", () => {
    expect(wilks2020(1000, 100, "male")).toBeCloseTo(729.36, 1);
    expect(wilks2020(400, 60, "female")).toBeCloseTo(527.61, 1);
  });

  it("IPF GL points", () => {
    expect(ipfGl(1000, 100, "male")).toBeCloseTo(126.33, 1);
    expect(ipfGl(800, 93, "male")).toBeCloseTo(104.66, 1);
    expect(ipfGl(500, 63, "female")).toBeCloseTo(109.39, 1);
    expect(ipfGl(200, 93, "male", "raw", "bench")).toBeGreaterThan(ipfGl(200, 93, "male", "equipped", "bench"));
    expect(ipfGl(500, 30, "male")).toBe(0);
  });

  it("points rank a lighter lifter's equal total higher", () => {
    for (const f of [dots, wilks, wilks2020, ipfGl]) expect(f(600, 75, "male")).toBeGreaterThan(f(600, 100, "male"));
  });
});

describe("strength tiers", () => {
  it("bodyweight ratio → tier and next target", () => {
    expect(strengthTier("squat", 180, 90, "male")).toMatchObject({ ratio: 2, tier: "Intermediate", next: "Advanced", nextKg: 202.5 });
    expect(strengthTier("squat", 180, 90, "male").progress).toBeCloseTo(2 / 3);
    expect(strengthTier("bench", 30, 90, "male")).toMatchObject({ tier: null, next: "Beginner", nextKg: 45 });
    expect(strengthTier("deadlift", 300, 90, "male")).toMatchObject({ tier: "Elite", next: null, progress: 1 });
    expect(strengthTier("ohp", 60, 60, "female").tier).toBe("Elite");
    expect(strengthTier("bench", 112.5, 90, "male").tier).toBe("Intermediate"); // exactly 1.25×
  });
});

describe("strengthProfile", () => {
  const W = (id: string, date: string, ex: [string, number, number][]): HevyWorkout => ({
    id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
    exercises: ex.map(([title, kg, reps]) => ({ title, exercise_template_id: title, sets: [{ type: "normal" as const, weight_kg: kg, reps }] })),
  });
  const ws = [
    W("1", "2025-01-01", [["Squat (Barbell)", 140, 5], ["Bench Press (Barbell)", 100, 3], ["Deadlift (Barbell)", 180, 1]]),
    W("2", "2025-06-01", [["Squat (Barbell)", 150, 1], ["Bench Press (Barbell)", 60, 20], ["Deadlift (Barbell)", 190, 2]]),
  ];
  it("total from best e1RMs, high-rep sets excluded", () => {
    const p = strengthProfile(ws, 90, "male");
    expect(p.lifts.squat.e1rmKg).toBeCloseTo(140 * (1 + 5 / 30));
    expect(p.lifts.bench.e1rmKg).toBeCloseTo(110); // the 20-rep set would be 100
    expect(p.lifts.deadlift).toMatchObject({ e1rmKg: expect.closeTo(190 * (1 + 2 / 30), 6), date: "2025-06-01" });
    expect(p.lifts.ohp).toMatchObject({ e1rmKg: null, tier: null });
    const total = 140 * (1 + 5 / 30) + 110 + 190 * (1 + 2 / 30);
    expect(p.totalKg).toBeCloseTo(total);
    expect(p.dots).toBeCloseTo(dots(total, 90, "male"));
    expect(p.ipfGl).toBeCloseTo(ipfGl(total, 90, "male"));
    expect(p.lifts.deadlift.tier?.tier).toBe("Intermediate");
    expect(strengthProfile(ws, 90, "male", { since: "2025-03-01" }).lifts.squat.e1rmKg).toBe(150);
  });
});
