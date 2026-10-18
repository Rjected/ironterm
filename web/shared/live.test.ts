import { describe, expect, it } from "vitest";
import { addSet, completeSet, current, progress, sessionFromPlan, toHevyWorkout, warmups } from "./live";
import { initialState, planDay, replay } from "./program";
import { buildProgram, defaultConfig } from "./programs";

describe("live session", () => {
  const cfg = defaultConfig("gzclp", "lb", "2026-01-01T00:00:00Z");
  const def = buildProgram(cfg)!;
  const plan = planDay(def, cfg, initialState(def, cfg));

  it("builds from the plan with warmups before the T1", () => {
    const s = sessionFromPlan(plan, "lb", def.name, "2026-01-02T15:00:00Z");
    const sq = s.exercises[0];
    expect(sq.lift).toBe("squat");
    expect(sq.sets.filter((x) => x.type === "warmup").map((x) => x.weight)).toEqual(warmups(185, "lb").map((x) => x.weight));
    expect(sq.sets.filter((x) => x.type !== "warmup")).toHaveLength(5);
    expect(sq.sets[sq.sets.length - 1].type).toBe("failure");
    expect(progress(s)).toMatchObject({ done: 0 });
  });

  it("completing a set starts rest and moves the cursor", () => {
    let s = sessionFromPlan(plan, "lb", def.name, "2026-01-02T15:00:00Z");
    const ex = s.exercises[0];
    s = completeSet(s, ex.id, 0, new Date("2026-01-02T15:05:00Z"));
    expect(s.restEndsAt).toBe("2026-01-02T15:06:00.000Z"); // warmup rest capped at 60s
    expect(current(s)).toEqual({ exId: ex.id, set: 1 });
    s = addSet(s, ex.id);
    expect(s.exercises[0].sets.length).toBe(ex.sets.length + 1);
  });

  it("finished session → Hevy body that replays as the tagged day", () => {
    let s = sessionFromPlan(plan, "lb", def.name, "2026-01-02T15:00:00Z");
    for (const ex of s.exercises) ex.sets.forEach((_, i) => { s = completeSet(s, ex.id, i); });
    const body = toHevyWorkout(s, (ex) => ex.lift, "2026-01-02T16:00:00Z");
    expect(body.workout.description).toContain("[ht:A1]");
    const titles: Record<string, string> = { squat: "Squat (Barbell)", bench: "Bench Press (Barbell)", latPulldown: "Lat Pulldown (Cable)", bicepCurl: "Bicep Curl (Dumbbell)" };
    const w = { id: "x", ...body.workout, exercises: body.workout.exercises.map((e) => ({ title: titles[e.exercise_template_id], exercise_template_id: e.exercise_template_id, sets: e.sets })) };
    const st = replay(def, cfg, [w]);
    expect(st.log[0].dayId).toBe("A1");
    expect(st.slots["a1-t1"].weight).toBe(195);
  });
});
