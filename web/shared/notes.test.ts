import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { applyNotes, exerciseNote, joinDescription, splitDescription, toHevyUpdate } from "./notes";

const w: HevyWorkout = {
  id: "w1", title: "GZCLP · A1", description: "felt strong\n[ht:A1]", start_time: "2026-10-01T22:00:00Z", end_time: "2026-10-01T23:10:00Z",
  exercises: [
    { title: "Squat (Barbell)", exercise_template_id: "D04AC939", notes: "T1 5×3+", superset_id: null, sets: [{ type: "warmup", weight_kg: 20, reps: 10 }, { type: "normal", weight_kg: 140, reps: 3, rpe: 8.5 }] },
    { title: "Running", exercise_template_id: "AC1BB830", notes: null, sets: [{ type: "normal", weight_kg: null, reps: null, distance_meters: 3000, duration_seconds: 900 }] },
  ],
};

describe("notes", () => {
  it("splits and rejoins the hidden program-day tag", () => {
    expect(splitDescription(w.description)).toEqual({ text: "felt strong", tag: "[ht:A1]" });
    expect(splitDescription("[ht:B2]")).toEqual({ text: "", tag: "[ht:B2]" });
    expect(splitDescription(null)).toEqual({ text: "", tag: "" });
    expect(joinDescription("  new  ", "[ht:A1]")).toBe("new\n[ht:A1]");
    expect(joinDescription("", "")).toBe("");
  });

  it("edits notes, keeps the tag and every set", () => {
    const out = applyNotes(w, { description: "knee ok, belt on top set", exercises: ["moved fast", "  "] });
    expect(out.description).toBe("knee ok, belt on top set\n[ht:A1]");
    expect(out.exercises.map((e) => e.notes)).toEqual(["moved fast", null]);
    expect(out.exercises[0].sets).toEqual(w.exercises[0].sets);
    expect(w.exercises[0].notes).toBe("T1 5×3+"); // original untouched
    expect(() => applyNotes(w, { description: "", exercises: ["x"] })).toThrow(/exercise count/);
  });

  it("builds a faithful PUT body", () => {
    const body = toHevyUpdate(applyNotes(w, { description: "", exercises: ["a", null] })).workout;
    expect(body.description).toBe("[ht:A1]");
    expect(body.start_time).toBe(w.start_time);
    expect(body.exercises[0]).toEqual({
      exercise_template_id: "D04AC939", superset_id: null, notes: "a",
      sets: [
        { type: "warmup", weight_kg: 20, reps: 10, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
        { type: "normal", weight_kg: 140, reps: 3, distance_meters: null, duration_seconds: null, rpe: 8.5, custom_metric: null },
      ],
    });
    expect(body.exercises[1].sets[0]).toMatchObject({ distance_meters: 3000, duration_seconds: 900, weight_kg: null });
    expect("is_private" in body).toBe(false);
  });

  it("puts your exercise note before the program scheme", () => {
    expect(exerciseNote("grindy", "T1", "5×3+")).toBe("grindy · T1 5×3+");
    expect(exerciseNote(undefined, "T2", "3×10")).toBe("T2 3×10");
    expect(exerciseNote("  ", undefined, undefined)).toBeNull();
  });
});
