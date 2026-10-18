import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../shared/hevy";
import { dailyCells } from "../shared/stats";
import { renderGraph } from "./graph";

const workout = (start: string, weight: number, reps: number): HevyWorkout =>
  ({
    id: start, title: "Test", start_time: start, end_time: start,
    exercises: [{ index: 0, title: "Squat", exercise_template_id: "squat", sets: [{ index: 0, type: "normal", weight_kg: weight, reps }] }],
  }) as unknown as HevyWorkout;

const rows = (s: string) => s.split("\n").slice(1, 8);

describe("renderGraph", () => {
  // 2024-01-10 is a Wednesday
  const today = "2024-01-10";

  it("ends the last column on today and leaves later days blank", () => {
    const out = rows(renderGraph(new Map(), today, 2, true));
    expect(out).toEqual(["    ..", "Mon ..", "    ..", "Wed ..", "    .", "Fri .", "    ."]);
  });

  it("shades days by quartile level, including cardio/bodyweight-only days", () => {
    const cells = dailyCells(
      [workout("2024-01-07T10:00:00Z", 0, 0), workout("2024-01-08T10:00:00Z", 100, 5), workout("2024-01-09T10:00:00Z", 100, 10), workout("2024-01-10T10:00:00Z", 100, 20)],
      "UTC",
    );
    const out = renderGraph(cells, today, 1, true);
    expect(rows(out)).toEqual(["    ░", "Mon ▒", "    ▓", "Wed █", "", "Fri", ""]);
    expect(out).toContain("4 days with workouts shown");
  });

  it("uses ANSI 256-colour backgrounds unless ascii", () => {
    const out = renderGraph(new Map(), today, 1, false);
    expect(out).toContain("\x1b[48;5;236m  \x1b[0m");
    expect(out).toContain("\x1b[48;5;46m  \x1b[0m"); // legend's brightest level
  });
});
