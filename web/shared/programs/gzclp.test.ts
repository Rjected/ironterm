// GZCLP against Blacknoir's v4.5b5 sheet (LiftVault), Cody's "GZCL Applications & Adaptations"
// (2016), the r/gzcl wiki and the GZCLP infographic, checked 2026-10-18.
import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramState } from "../program";
import { toKg } from "../units";
import { gzclp } from "./gzclp";

const W = (id: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: "2026-01-05T12:00:00Z", end_time: "2026-01-05T13:00:00Z",
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const n = (k: number, lb: number, reps: number, last = reps) => Array.from({ length: k }, (_, i) => [lb, i === k - 1 ? last : reps] as [number, number]);
const BENCH = "Bench Press (Barbell)", SQ = "Squat (Barbell)", PD = "Lat Pulldown (Cable)";

const DEFAULTS = Object.fromEntries(gzclp.options.map((o) => [o.key, o.default]));

function setup() {
  const def = gzclp.build(DEFAULTS);
  const cfg: ProgramConfig = { templateId: "gzclp", options: DEFAULTS, unit: "lb", startDate: "2026-01-01", startWeights: { "a1-t1": 200, "a1-t2": 100, "a1-t3": 50, "b1-t1": 95, "b1-t2": 185, "b1-t3": 40, "a2-t1": 150, "a2-t2": 150, "a2-t3": 50, "b2-t1": 250, "b2-t2": 75, "b2-t3": 40 }, trainingMaxes: {} };
  return { def, cfg };
}

describe("GZCLP", () => {
  it("A1 / B1 / A2 / B2 rotation and tiers; curls are opt-in", () => {
    const { def } = setup();
    expect(def.days.map((d) => d.slots.map((s) => `${s.tier} ${s.lift}`))).toEqual([
      ["T1 squat", "T2 bench", "T3 latPulldown"], ["T1 ohp", "T2 deadlift", "T3 dbRow"],
      ["T1 bench", "T2 squat", "T3 latPulldown"], ["T1 deadlift", "T2 ohp", "T3 dbRow"],
    ]);
    expect(gzclp.build({ ...DEFAULTS, curls: "on" }).days[0].slots.map((s) => s.lift)).toContain("bicepCurl");
  });

  it("curls default off for new starts, but a saved config without the key keeps them", () => {
    expect(DEFAULTS.curls).toBe("off");
    expect(gzclp.build(DEFAULTS).days[0].slots.map((s) => s.lift)).not.toContain("bicepCurl");
    expect(gzclp.build({ days: "4", t1: "default", t2: "default", t3: "default" }).days[0].slots.map((s) => s.lift)).toContain("bicepCurl");
    expect(gzclp.build({}).days[0].slots.map((s) => s.lift)).toContain("bicepCurl");
  });

  it("T1: 5×3+ → 6×2+ → 10×1+ at the same weight, then retest a 5RM and restart at 85%", () => {
    const { def, cfg } = setup();
    let s = initialState(def, cfg);
    s = applyWorkout(def, cfg, s, W("a", [[SQ, n(5, 200, 3, 2)]]), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ stage: 1, weight: 200 });
    s = applyWorkout(def, cfg, { ...s, dayIndex: 0 }, W("b", [[SQ, n(6, 200, 2, 1)]]), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ stage: 2, weight: 200 });
    s = applyWorkout(def, cfg, { ...s, dayIndex: 0 }, W("c", [[SQ, n(10, 200, 1, 0).filter(([, r]) => r > 0)]]), 0);
    expect(s.slots["a1-t1"].retest).toBe(true);
    s = applyWorkout(def, cfg, { ...s, dayIndex: 0 }, W("d", [[SQ, [[135, 5], [185, 5], [215, 5]]]]), 0);
    expect(s.slots["a1-t1"]).toMatchObject({ stage: 0, weight: 185, retest: false }); // 85% of 215 = 182.75 → 185
  });

  // Cody: after failing 3×6, back to 3×10 "at a slightly heavier weight than previously used"
  // (no more than +20 lb); infographic: fail 3×10 at 100 → restart at 105–120.
  it("T2: 3×10 → 3×8 → 3×6, then back to 3×10 at the last 3×10 weight + 2 jumps", () => {
    const { def, cfg } = setup();
    let s: ProgramState = initialState(def, cfg);
    const bench = (w: number, sets: [number, number][]) => { s = applyWorkout(def, cfg, { ...s, dayIndex: 0 }, W(`b${w}`, [[BENCH, sets]]), 0); };
    bench(100, n(3, 100, 10));
    bench(105, n(3, 105, 10));
    bench(110, n(3, 110, 10, 7)); // miss 3×10 at 110 → 3×8 @ 110
    expect(s.slots["a1-t2"]).toMatchObject({ stage: 1, weight: 110 });
    bench(110, n(3, 110, 8));
    bench(115, n(3, 115, 8, 5)); // miss → 3×6 @ 115
    bench(115, n(3, 115, 6, 4)); // miss the last stage → reset
    expect(s.slots["a1-t2"]).toMatchObject({ stage: 0, weight: 120 }); // last 3×10 at 110 + 2 × 5 lb
    expect(planDay(def, cfg, { ...s, dayIndex: 0 }).exercises[1].scheme).toBe("3×10");
  });

  it("T3: add weight only when the sets go 15/15/25", () => {
    const { def, cfg } = setup();
    const s0 = initialState(def, cfg);
    const t3 = (sets: [number, number][]) => applyWorkout(def, cfg, s0, W("t", [[PD, sets]]), 0).slots["a1-t3"].weight;
    expect(t3([[50, 15], [50, 15], [50, 25]])).toBe(55);
    expect(t3([[50, 15], [50, 13], [50, 27]])).toBe(50); // a short middle set holds
    expect(t3([[50, 15], [50, 15], [50, 24]])).toBe(50);
  });
});
