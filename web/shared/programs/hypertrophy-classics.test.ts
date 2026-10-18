import { describe, expect, it } from "vitest";
import { describeProgram, rulesText } from "../describe";
import { initialState, planDay, programLength, usesStartWeight, allSlots } from "../program";
import { broSplit, drSwolePplul, dumbbellPpl, gironda, HYPERTROPHY_CLASSICS } from "./hypertrophy-classics";
import { run, setup, ws } from "./testkit";

describe("hypertrophy classics", () => {
  it("every loaded slot has a default start weight, every day plans", () => {
    for (const t of HYPERTROPHY_CLASSICS) {
      const def = t.build(Object.fromEntries(t.options.map((o) => [o.key, o.default])));
      const d = t.defaults?.("lb");
      for (const s of allSlots(def)) if (usesStartWeight(s) && s.progression.kind === "double") expect(d?.startWeights?.[s.id], `${t.id} ${s.id}`).not.toBeUndefined();
      expect(rulesText(describeProgram(def, { unit: "lb" })), t.id).toBeTruthy();
    }
  });

  it("Dumbbell PPL: 3 sets to 12 (last as many as you can); weight goes up only at 3×12", () => {
    const sw = dumbbellPpl.defaults!("lb").startWeights!;
    const { def, cfg } = setup(dumbbellPpl, {}, {}, sw);
    let s = initialState(def, cfg);
    const push = planDay(def, cfg, s, 0);
    expect(push.exercises.map((e) => [e.lift, e.scheme])).toEqual([
      ["dbBench", "3×8–12+"], ["inclineFly", "3×8–12+"], ["arnoldPress", "3×8–12+"], ["overheadTricep", "3×8–12+"], ["hangingLegRaise", "3×8–12+"],
    ]);
    expect(def.sessionsPerWeek).toBe(6);
    expect(setup(dumbbellPpl, {}, { days: "3" }).def.sessionsPerWeek).toBe(3);
    s = run(def, cfg, 1, s); // logged at the top of the range
    expect(s.slots["dp-push-press"].weight).toBe(45);
    s = run(def, cfg, 1, s, 9); // pull day, AMRAP (last set) only 9
    expect(s.slots["dp-pull-row"].weight).toBe(40);
  });

  it("Dr. Swole PPLUL: five days, eight weeks with rising RPE", () => {
    const { def } = setup(drSwolePplul, {});
    expect(def.days.map((d) => d.id)).toEqual(["PULL", "PUSH", "LEGS", "UPPER", "LOWER"]);
    expect(def.days[1].slots.map((x) => [x.lift, x.progression.kind === "double" ? `${x.progression.sets}×${x.progression.reps.join("–")}` : ""])).toEqual([
      ["bench", "4×5–8"], ["dbInclineBench", "3×6–10"], ["skullcrusher", "3×8–12"], ["tricepPushdown", "3×10–15"], ["lateralRaise", "3×8–12"], ["lateralRaise", "3×10–15"],
    ]);
    expect(def.cycle?.weekNames?.[2]).toBe("Week 3 · RPE 9–10");
    expect(programLength(drSwolePplul)).toEqual({ kind: "block", weeks: 8 });
  });

  it("Bro Split: one body part a day, pyramids noted", () => {
    const { def, cfg } = setup(broSplit, {});
    const s = initialState(def, cfg);
    expect(def.days.map((d) => d.name)).toEqual(["Chest / Calves", "Back", "Legs", "Arms / Calves", "Shoulders"]);
    expect(planDay(def, cfg, s, 2).exercises[0]).toMatchObject({ lift: "squat", scheme: "5×6–15", note: "15, 10, 8, 8, 6" });
    expect(programLength(broSplit).kind).toBe("ongoing");
  });

  it("Gironda: 10 @50, 8 @75, 6 @100, 15 @35 of each exercise's 6RM", () => {
    const { def, cfg } = setup(gironda, { wideBench: 200, squat: 300 });
    const s = initialState(def, cfg);
    expect(ws(def, cfg, s, 0, "gir-wideBench")).toEqual([100, 150, 200, 70]);
    expect(ws(def, cfg, s, 1, "gir-squat")).toEqual([150, 225, 300, 105]);
    expect(planDay(def, cfg, s, 0).exercises[0].restSeconds).toBe(60);
    expect(setup(gironda, {}, { days: "5" }).def.sessionsPerWeek).toBe(5);
  });
});
