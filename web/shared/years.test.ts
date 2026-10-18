import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { workoutYears } from "./stats";

const W = (start: string): HevyWorkout => ({ id: start, title: "x", start_time: start, end_time: start, exercises: [] });

describe("workoutYears (HISTORY, STATS)", () => {
  it("files a New Year's Eve evening session under the year it happened locally", () => {
    // 9 pm on 31 Dec in New York is already 1 Jan in UTC
    const ws = [W("2026-01-01T02:00:00Z"), W("2025-06-01T12:00:00Z")];
    expect(workoutYears(ws, "America/New_York")).toEqual([{ year: "2025", n: 2 }]);
    // and the other way round in Tokyo
    expect(workoutYears([W("2025-12-31T20:00:00Z")], "Asia/Tokyo")).toEqual([{ year: "2026", n: 1 }]);
  });
  it("is newest first and empty for no workouts", () => {
    expect(workoutYears([W("2024-03-01T12:00:00Z"), W("2026-03-01T12:00:00Z")], "UTC").map((y) => y.year)).toEqual(["2026", "2024"]);
    expect(workoutYears([], "UTC")).toEqual([]);
  });
});
