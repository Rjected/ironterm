import { describe, expect, it } from "vitest";
import { cardioSessions, cardioStats, formatDuration, formatPace, isCardioExercise, isCardioTitle, METERS_PER_MI, weeklyCardioVsLifting, type HrSession } from "./cardio";
import type { HevyExercise, HevySet, HevyWorkout } from "./hevy";

const cardioSet = (meters: number | null, sec: number | null): HevySet => ({ type: "normal", weight_kg: null, reps: null, distance_meters: meters, duration_seconds: sec });
const liftSet = (kg: number, reps: number): HevySet => ({ type: "normal", weight_kg: kg, reps });
const ex = (title: string, sets: HevySet[]): HevyExercise => ({ title, exercise_template_id: title, sets });
const W = (id: string, start: string, mins: number, exercises: HevyExercise[]): HevyWorkout => ({
  id, title: id, start_time: start, end_time: new Date(Date.parse(start) + mins * 60000).toISOString(), exercises,
});
const mi = (n: number) => n * METERS_PER_MI;

describe("cardio detection", () => {
  it("uses titles and set shape", () => {
    expect(isCardioTitle("Recumbent Bike")).toBe(true);
    expect(isCardioTitle("stair machine (floors)")).toBe(true);
    expect(isCardioTitle("Plank")).toBe(false);
    expect(isCardioExercise(ex("Spinning", [cardioSet(null, 2400)]))).toBe(true);
    expect(isCardioExercise(ex("My Custom Row", [cardioSet(2000, 480)]))).toBe(true);
    expect(isCardioExercise(ex("Plank", [cardioSet(null, 60)]))).toBe(false);
    expect(isCardioExercise(ex("Farmers Walk", [{ type: "normal", weight_kg: 40, reps: null, distance_meters: 30 }]))).toBe(false);
    expect(isCardioExercise(ex("Squat (Barbell)", [liftSet(100, 5)]))).toBe(false);
  });
});

describe("cardioStats", () => {
  const ws = [
    W("a", "2026-09-01T21:00:00Z", 60, [ex("Squat (Barbell)", [liftSet(100, 5), liftSet(100, 5)]), ex("Recumbent Bike", [cardioSet(mi(4), 1800)])]),
    W("b", "2026-09-03T21:00:00Z", 30, [ex("Recumbent Bike", [cardioSet(0, 1800)])]), // time only
    W("c", "2026-09-10T21:00:00Z", 45, [ex("Recumbent Bike", [cardioSet(mi(8), 3720)])]), // 7:45 /mi
    W("d", "2026-09-11T21:00:00Z", 50, [ex("Spinning", [cardioSet(null, 2400)]), ex("Spinning", [cardioSet(null, 300)])]),
  ];
  const s = cardioStats(ws, "UTC", "mi");
  const bike = s.activities.find((a) => a.activity === "Recumbent Bike")!;

  it("totals time and distance, pace ignores time-only sessions", () => {
    expect(bike.sessions).toBe(3);
    expect(bike.timeOnlySessions).toBe(1);
    expect(bike.totalMinutes).toBe(122);
    expect(bike.totalDistance).toBeCloseTo(12);
    expect(bike.avgSpeed).toBeCloseTo(12 / (5520 / 3600)); // 12 mi in 92 min
    expect(bike.avgPace).toBeCloseTo(460);
    expect(formatPace(bike.avgPace, "mi")).toBe("7:40 /mi");
  });

  it("best efforts", () => {
    expect(bike.longest).toMatchObject({ workoutId: "c", seconds: 3720 });
    expect(bike.farthest?.distance).toBeCloseTo(8);
    expect(bike.fastest[0].effort).toMatchObject({ workoutId: "a", pace: expect.closeTo(450, 6) }); // 7:30 beats 7:45
    expect(bike.fastest[2].minDistance).toBe(6.2);
    expect(bike.fastest[2].effort?.workoutId).toBe("c");
  });

  it("merges same-titled exercises in one workout, km units", () => {
    const spin = s.activities.find((a) => a.activity === "Spinning")!;
    expect(spin).toMatchObject({ sessions: 1, totalSeconds: 2700, avgPace: null });
    expect(cardioStats(ws, "UTC", "km").activities[0].totalDistance).toBeCloseTo(12 * 1.609344);
  });

  it("weekly minutes and cardio vs lifting", () => {
    expect(bike.weekly).toEqual([
      { week: "2026-08-31", minutes: 60, distance: expect.closeTo(4, 6) },
      { week: "2026-09-07", minutes: 62, distance: expect.closeTo(8, 6) },
    ]);
    const split = weeklyCardioVsLifting(ws, "UTC");
    expect(split[0]).toMatchObject({ week: "2026-08-31", cardioMin: 60, liftingMin: 30, zone2Min: null });
    expect(split[1]).toMatchObject({ week: "2026-09-07", cardioMin: 107, liftingMin: 5 });
    expect(s.totals).toMatchObject({ sessions: 4, workouts: 4, minutes: 167, zone2Min: null });
  });

  it("fills empty weeks", () => {
    const split = weeklyCardioVsLifting([ws[0], W("z", "2026-09-22T12:00:00Z", 10, [])], "UTC");
    expect(split.map((x) => x.week)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });
});

describe("zone 2 from HR sessions", () => {
  const w = W("a", "2026-09-01T21:00:00Z", 60, [ex("Squat (Barbell)", [liftSet(100, 5)]), ex("Recumbent Bike", [cardioSet(mi(4), 1800)])]);
  it("scales zone-2 ms by overlap and caps at cardio time", () => {
    // HR session covers the whole hour; 20 of its minutes in zone 2
    const hr: HrSession[] = [{ start: "2026-09-01T21:00:00Z", end: "2026-09-01T22:00:00Z", avgHr: 128, strain: 9.1, zones: [0, 0, 20 * 60000, 0, 0, 0] }];
    const [s] = cardioSessions([w], "UTC", hr);
    expect(s.zone2Min).toBeCloseTo(20);
    expect(s.hr).toMatchObject({ avgHr: 128, strain: 9.1 });
    const big: HrSession[] = [{ ...hr[0], zones: [0, 0, 50 * 60000] }];
    expect(cardioSessions([w], "UTC", big)[0].zone2Min).toBeCloseTo(30);
    // HR session runs twice as long as the workout → half of its zone-2 time counts
    const long: HrSession[] = [{ ...hr[0], end: "2026-09-01T23:00:00Z" }];
    expect(cardioSessions([w], "UTC", long)[0].zone2Min).toBeCloseTo(10);
  });
  it("estimates from avgHr vs max HR without zones; null without overlap", () => {
    const hr: HrSession[] = [{ start: "2026-09-01T21:30:00Z", end: "2026-09-01T22:00:00Z", avgHr: 120 }];
    expect(cardioSessions([w], "UTC", hr, { maxHr: 185 })[0].zone2Min).toBeCloseTo(30); // 65 %
    expect(cardioSessions([w], "UTC", hr)[0].zone2Min).toBeUndefined();
    expect(cardioSessions([w], "UTC", [{ start: "2026-09-02T10:00:00Z", end: "2026-09-02T11:00:00Z", zones: [0, 0, 1] }])[0].hr).toBeUndefined();
  });
});

describe("formatting", () => {
  it("durations", () => {
    expect(formatDuration(3903)).toBe("1:05:03");
    expect(formatDuration(1930)).toBe("32:10");
    expect(formatPace(null, "km")).toBe("—");
  });
});
