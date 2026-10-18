import { describe, expect, it } from "vitest";
import type { HevySet, HevyWorkout } from "./hevy";
import { yearInReview } from "./review";

const S = (kg: number, reps: number, type: HevySet["type"] = "normal"): HevySet => ({ type, weight_kg: kg, reps });
const W = (id: string, start: string, mins: number, ex: [string, HevySet[]][]): HevyWorkout => ({
  id, title: id, start_time: start, end_time: new Date(Date.parse(start) + mins * 60000).toISOString(),
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets })),
});
const SQ = "Squat (Barbell)", BP = "Bench Press (Barbell)";
const bike = (m: number, s: number): [string, HevySet[]] => ["Recumbent Bike", [{ type: "normal", weight_kg: null, reps: null, distance_meters: m, duration_seconds: s }]];

const ws: HevyWorkout[] = [
  // 2024
  W("p1", "2024-03-04T17:00:00Z", 60, [[SQ, [S(100, 5), S(100, 5)]]]),
  W("p2", "2024-03-06T17:00:00Z", 60, [[BP, [S(80, 5)]], bike(1609.344, 600)]),
  // 2025: week of Jan 6 has 3 sessions on consecutive days, then week of Jan 13 has 3
  W("a", "2025-01-06T07:00:00Z", 60, [[SQ, [S(60, 5, "warmup"), S(100, 5), S(105, 5)]]]), // e1RM PR 122.5
  W("b", "2025-01-07T07:30:00Z", 30, [bike(1609.344 * 4, 1800)]),
  W("c", "2025-01-08T18:00:00Z", 90, [[BP, [S(80, 8)]], ["Plank", [{ type: "normal", weight_kg: null, reps: null, duration_seconds: 60 }]]]),
  W("d", "2025-01-13T07:00:00Z", 60, [[SQ, [S(95, 5)]]]),
  W("e", "2025-01-15T07:00:00Z", 60, [[SQ, [S(110, 3)]]]), // e1RM 121 < 122.5, but 3-rep PR
  W("f", "2025-01-17T07:00:00Z", 60, [["Custom Thing", [S(20, 10)]]]),
  W("g", "2025-03-10T07:00:00Z", 60, [[SQ, [S(120, 5)]]]), // e1RM PR 140
  // 2026
  W("n", "2026-01-02T07:00:00Z", 60, [[SQ, [S(130, 5)]]]),
];

describe("yearInReview", () => {
  const r = yearInReview(ws, 2025, "UTC", "kg", { templates: [{ id: "Custom Thing", title: "Custom Thing", primary_muscle_group: "forearms" }] });

  it("totals and year-over-year", () => {
    expect(r.totals).toMatchObject({ sessions: 7, sets: 9, reps: 5 + 5 + 8 + 5 + 3 + 10 + 5, trainingDays: 7 });
    expect(r.totals.hours).toBeCloseTo(7);
    expect(r.totals.tonnage).toBeCloseTo(500 + 525 + 640 + 475 + 330 + 200 + 600);
    expect(r.totals.cardioMinutes).toBe(30);
    expect(r.totals.cardioDistance).toBeCloseTo(4 * 1.609344); // kg user → km by default
    expect(r.prevTotals).toMatchObject({ sessions: 2, tonnage: 1400, cardioMinutes: 10 });
    expect(r.deltas.sessions).toEqual({ prev: 2, diff: 5, pct: 2.5 });
    expect(r.distUnit).toBe("km");
  });

  it("best month/week and streaks", () => {
    expect(r.bestMonth).toMatchObject({ month: "2025-01", sessions: 6 });
    expect(r.bestWeek).toMatchObject({ week: "2025-01-06", sessions: 3, tonnage: 1665 });
    expect(r.streaks.weeks).toEqual({ length: 2, start: "2025-01-06", end: "2025-01-13" });
    expect(r.streaks.days).toEqual({ length: 3, start: "2025-01-06", end: "2025-01-08" });
  });

  it("lifts and muscles", () => {
    expect(r.topLifts[0]).toMatchObject({ key: "squat", name: "Back Squat", sets: 5, sessions: 4 });
    expect(r.topLifts.find((l) => l.key === "title:Custom Thing")).toMatchObject({ name: "Custom Thing", sets: 1 });
    expect(r.topLifts.some((l) => l.name === "Recumbent Bike")).toBe(false);
    const m = Object.fromEntries(r.muscles.map((x) => [x.muscle, x.sets]));
    expect(m).toMatchObject({ quads: 5, chest: 1, abs: 1, forearms: 1, cardio: 1 });
  });

  it("PRs vs all prior history", () => {
    const sq = r.prs.find((p) => p.key === "squat")!;
    expect(sq.e1rm).toMatchObject({ value: 140, weight: 120, reps: 5, date: "2025-03-10", previous: expect.closeTo(100 * (1 + 5 / 30), 6) });
    expect(sq.e1rmPRCount).toBe(2);
    const rep = Object.fromEntries(sq.repPRs.map((x) => [x.reps, x]));
    expect(rep[5]).toMatchObject({ weight: 120, date: "2025-03-10", previous: 100 });
    expect(rep[3]).toMatchObject({ weight: 120, date: "2025-03-10" }); // 120×5 also beats the 110×3
    expect(rep[6]).toBeUndefined();
    const bp = r.prs.find((p) => p.key === "bench")!;
    expect(bp.e1rm).toMatchObject({ value: expect.closeTo(80 * (1 + 8 / 30), 6), previous: expect.closeTo(80 * (1 + 5 / 30), 6) });
    expect(bp.repPRs.map((x) => x.reps)).toEqual([6, 7, 8]); // 80×5 already held reps 1–5
    expect(r.prs.find((p) => p.key === "title:Custom Thing")?.e1rm?.previous).toBeNull();
  });

  it("first/last, favorite day and time, cardio", () => {
    expect(r.first).toEqual({ id: "a", title: "a", date: "2025-01-06" });
    expect(r.last?.id).toBe("g");
    expect(r.favoriteDay).toEqual({ day: "Monday", sessions: 3 });
    expect(r.favoriteTime).toEqual({ time: "morning", sessions: 6 });
    expect(r.byHour[18]).toBe(1);
    expect(r.cardio.totals).toMatchObject({ sessions: 1, minutes: 30, zone2Min: null });
    expect(r.cardio.activities[0].activity).toBe("Recumbent Bike");
  });

  it("time zone decides the year and hour", () => {
    const nye = [W("x", "2026-01-01T03:00:00Z", 60, [[SQ, [S(100, 5)]]])];
    expect(yearInReview(nye, 2025, "America/New_York", "lb").totals.sessions).toBe(1);
    expect(yearInReview(nye, 2025, "America/New_York", "lb").byHour[22]).toBe(1);
    expect(yearInReview(nye, 2025, "UTC", "lb").totals.sessions).toBe(0);
    expect(yearInReview(nye, 2025, "America/New_York", "lb").totals.tonnage).toBeCloseTo(500 * 2.20462262185);
  });

  it("caps forgotten timers", () => {
    const long = [W("x", "2025-02-01T10:00:00Z", 60 * 50, [[SQ, [S(100, 5)]]])];
    expect(yearInReview(long, 2025, "UTC", "kg").totals.hours).toBe(4);
    expect(yearInReview(long, 2025, "UTC", "kg", { maxSessionMinutes: 90 }).totals.hours).toBe(1.5);
  });

  it("empty year", () => {
    const e = yearInReview(ws, 2019, "UTC", "lb");
    expect(e).toMatchObject({ bestMonth: null, first: null, favoriteDay: null, prs: [], streaks: { weeks: null, days: null } });
  });
});
