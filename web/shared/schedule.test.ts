import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { initialState } from "./program";
import { buildProgram, defaultConfig } from "./programs";
import { dow, upcoming, weekStatus } from "./schedule";

const W = (date: string): HevyWorkout => ({ id: date, title: date, start_time: `${date}T17:00:00Z`, end_time: `${date}T18:00:00Z`, exercises: [] });

describe("schedule", () => {
  it("dow is Monday-based", () => {
    expect(dow("2026-10-12")).toBe(0); // Monday
    expect(dow("2026-10-18")).toBe(6); // Sunday
  });

  it("lays GZCLP days onto Mon/Tue/Thu/Fri in rotation order", () => {
    const cfg = defaultConfig("gzclp", "lb", "2026-01-01");
    const def = buildProgram(cfg)!;
    const u = upcoming(def, initialState(def, cfg), [0, 1, 3, 4], "2026-10-17", false, 6); // Saturday
    expect(u.map((x) => [x.date, x.dayId])).toEqual([
      ["2026-10-19", "A1"], ["2026-10-20", "B1"], ["2026-10-22", "A2"], ["2026-10-23", "B2"], ["2026-10-26", "A1"], ["2026-10-27", "B1"],
    ]);
  });

  it("finite programs stop at the end", () => {
    const cfg = defaultConfig("smolov-jr", "lb", "2026-01-01");
    const def = buildProgram(cfg)!;
    expect(upcoming(def, initialState(def, cfg), [0, 2, 4, 5], "2026-10-12", false, 50)).toHaveLength(12);
  });

  it("week status counts done vs expected by today", () => {
    // Thursday; trained Mon only with Mon/Tue/Thu/Fri plan → 1 behind before training today
    const s = weekStatus([W("2026-10-12")], "UTC", [0, 1, 3, 4], "2026-10-15");
    expect(s).toMatchObject({ planned: 4, done: 1, left: 2, delta: -1 });
    expect(s.label).toContain("1 behind");
  });
});
