import { describe, expect, it } from "vitest";
import { describeProgram, rulesText } from "../describe";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { applyWorkout, initialState, planDay, programLength, type ProgramConfig, type ProgramDef, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { bwfRR, CLASSIC_TEMPLATES, goldenSix, hepburn, regPark, superSquats } from "./classic";

function setup(t: ProgramTemplate) {
  const d = t.defaults?.("lb") ?? {};
  const cfg: ProgramConfig = { templateId: t.id, options: {}, unit: "lb", startDate: "2026-01-01", startWeights: d.startWeights ?? {}, trainingMaxes: {}, increments: {} };
  const def = t.build({});
  return { def, cfg, s: initialState(def, cfg) };
}

/** Log the next session: each exercise's planned sets, with `reps` overriding per lift (array per set). */
function log(def: ProgramDef, cfg: ProgramConfig, s: ProgramState, n: number, reps: Record<string, number[]> = {}): ProgramState {
  const plan = planDay(def, cfg, s);
  const w: HevyWorkout = {
    id: `w${n}`, title: "w", start_time: `2026-02-${String(1 + n).padStart(2, "0")}T12:00:00Z`, end_time: `2026-02-${String(1 + n).padStart(2, "0")}T13:00:00Z`,
    exercises: plan.exercises.filter((e) => LIFTS[e.lift].hevy.length).map((e) => ({
      title: LIFTS[e.lift].hevy[0], exercise_template_id: "x",
      sets: e.sets.map((x, i) => ({ type: "normal" as const, weight_kg: toKg(x.weight, "lb"), reps: reps[e.slotId]?.[i] ?? x.repsMax ?? x.reps })),
    })),
  };
  return applyWorkout(def, cfg, s, w, s.dayIndex);
}
const weightOf = (def: ProgramDef, cfg: ProgramConfig, s: ProgramState, slot: string) => planDay(def, cfg, s).exercises.find((e) => e.slotId === slot)?.sets[0].weight;

describe("classic programs", () => {
  it("all build with defaults for every loaded slot, and plan cleanly", () => {
    for (const t of CLASSIC_TEMPLATES) {
      const { def, cfg, s } = setup(t);
      for (let i = 0; i < def.days.length; i++) expect(planDay(def, cfg, s, i).exercises.length, t.id).toBeGreaterThan(0);
      expect(rulesText(describeProgram(def, { unit: "lb" })), t.id).not.toMatch(/one days/);
    }
  });

  it("Reg Park: three work sets of 5; all made → +10 squat/deadlift, +5 bench; a miss holds", () => {
    const { def, cfg, s } = setup(regPark);
    expect(planDay(def, cfg, s).exercises.map((e) => [e.lift, e.scheme])).toEqual([["backExtension", "3×10"], ["squat", "3×5"], ["bench", "3×5"], ["deadlift", "3×5"]]);
    let t = log(def, cfg, s, 0);
    expect([weightOf(def, cfg, t, "rp-sq"), weightOf(def, cfg, t, "rp-bp"), weightOf(def, cfg, t, "rp-dl")]).toEqual([165, 120, 195]);
    t = log(def, cfg, t, 1, { "rp-sq": [5, 5, 3] });
    expect(weightOf(def, cfg, t, "rp-sq")).toBe(165);
    expect(programLength(regPark).kind).toBe("ongoing");
  });

  it("Super Squats: 1×20 squat +5 lb a session for six weeks, then it's done", () => {
    const { def, cfg, s } = setup(superSquats);
    const d = planDay(def, cfg, s);
    expect(d.exercises.map((e) => e.lift)).toEqual(["ohp", "bench", "row", "squat", "pullover", "stiffLegDeadlift", "barbellCurl", "calfRaise"]);
    expect(d.exercises[3].scheme).toBe("1×20");
    let t = s;
    for (let i = 0; i < 3; i++) t = log(def, cfg, t, i);
    expect(weightOf(def, cfg, t, "ss-squat")).toBe(170);
    t = log(def, cfg, t, 3, { "ss-squat": [17] });
    expect(weightOf(def, cfg, t, "ss-squat")).toBe(170);
    for (let i = 4; i < 18; i++) t = log(def, cfg, t, i);
    expect(t.complete).toBe(true);
    expect(programLength(superSquats)).toEqual({ kind: "block", weeks: 6 });
  });

  it("Hepburn: 8×2–3 power and 3×6–8 pump; add weight only when every set reaches the top", () => {
    const { def, cfg, s } = setup(hepburn);
    const d = planDay(def, cfg, s);
    expect(d.exercises.map((e) => [e.slotId, e.scheme, e.sets[0].weight])).toEqual([
      ["hb-sq-power", "8×2–3", 250], ["hb-sq-pump", "3×6–8", 190], ["hb-bp-power", "8×2–3", 180], ["hb-bp-pump", "3×6–8", 135],
    ]);
    // a session building toward 8×3 holds the weight
    let t = log(def, cfg, s, 0, { "hb-sq-power": [3, 3, 3, 2, 2, 2, 2, 2], "hb-sq-pump": [7, 6, 6] });
    expect(t.slots["hb-sq-power"].weight).toBe(250);
    expect(t.slots["hb-sq-pump"].weight).toBe(190);
    // bench went all the way (planned reps at the top of the range) → +5
    expect(t.slots["hb-bp-power"].weight).toBe(185);
    t = log(def, cfg, t, 1);
    t = log(def, cfg, t, 2);
    expect(t.slots["hb-sq-power"].weight).toBe(260);
  });

  it("Golden Six: 4×10 squat and press, 3×10 bench and curl, max-rep chins and sit-ups", () => {
    const { def, cfg, s } = setup(goldenSix);
    expect(planDay(def, cfg, s).exercises.map((e) => [e.lift, e.scheme])).toEqual([
      ["squat", "4×10"], ["wideBench", "3×10"], ["chinUp", "3×1+"], ["ohp", "4×10"], ["barbellCurl", "3×10"], ["sitUp", "3×1+"],
    ]);
    const t = log(def, cfg, s, 0);
    expect(weightOf(def, cfg, t, "g6-sq")).toBe(145);
    expect(weightOf(def, cfg, t, "g6-ohp")).toBe(80);
  });

  it("BWF Recommended Routine: three pairs at 3×5–8 and the core triplet at 3×8–12, in the bodyweight category", () => {
    const { def, cfg, s } = setup(bwfRR);
    expect(bwfRR.category).toBe("bodyweight");
    const d = planDay(def, cfg, s);
    expect(d.exercises.map((e) => e.lift)).toEqual(["pullUp", "bulgarianSplitSquat", "dip", "nordicCurl", "invertedRow", "pushUp", "abWheel", "pallofPress", "backExtension"]);
    expect(d.exercises.slice(0, 6).every((e) => e.scheme === "3×5–8")).toBe(true);
    expect(d.exercises.slice(6).every((e) => e.scheme === "3×8–12")).toBe(true);
    expect(d.exercises[0].note).toContain("At 3×8, move to the next one");
  });
});
