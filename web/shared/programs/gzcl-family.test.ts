import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { gzclFamily, gzclJnt2, gzclMethod, gzclRippler, gzclVdip } from "./gzcl-family";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const SQ = "Squat (Barbell)";

function setup(t: ProgramTemplate, tms: Record<string, number> = {}) {
  const d = t.defaults!("lb");
  const cfg: ProgramConfig = { templateId: t.id, options: {}, unit: "lb", startDate: "2026-01-01", startWeights: d.startWeights ?? {}, trainingMaxes: { ...d.trainingMaxes, ...tms } };
  return { cfg, def: t.build({}) };
}
const sets = (p: ReturnType<typeof planDay>, slotId: string) => p.exercises.find((e) => e.slotId === slotId)!.sets.map((s) => [s.weight, s.reps, s.amrap] as const);
const atWeek = (s: ProgramState, rotations: number, dayIndex: number): ProgramState => ({ ...s, rotations, dayIndex });

describe("GZCL family templates", () => {
  it("build, use gzcl- ids and unique slot ids, and have defaults for every non-percent slot", () => {
    for (const t of gzclFamily) {
      expect(t.id.startsWith("gzcl-")).toBe(true);
      expect(t.category).toBe("gzcl");
      const def = t.build({});
      const ids = def.days.flatMap((d) => d.slots.map((s) => s.id));
      expect(new Set(ids).size).toBe(ids.length);
      const d = t.defaults!("lb");
      for (const s of def.days.flatMap((x) => x.slots)) {
        if (s.progression.kind === "percent") expect(d.trainingMaxes?.[s.progression.tmLift], `${t.id} ${s.id}`).toBeGreaterThan(0);
        else expect(d.startWeights?.[s.id], `${t.id} ${s.id}`).toBeDefined();
      }
      expect(t.defaults!("kg").trainingMaxes!.squat).toBe(Math.round(d.trainingMaxes!.squat / 2.20462 / 2.5) * 2.5);
    }
  });
});

describe("Jacked & Tan 2.0", () => {
  const { def, cfg } = setup(gzclJnt2, { squat: 300, deadlift: 400 });
  it("week 1 squat: 10RM then 70%×6×3+ of TM; T2a deficit deadlift 4×10 @ 50% of deadlift TM", () => {
    const p = planDay(def, cfg, initialState(def, cfg));
    expect(p.dayId).toBe("D1");
    expect(sets(p, "d1-t1")).toEqual([[0, 10, false], [210, 6, false], [210, 6, false], [210, 6, true]]);
    expect(p.exercises[0].sets[0].rpe).toBe(9);
    expect(sets(p, "d1-t2a")).toEqual(Array(4).fill([200, 10, false]));
  });
  it("week 5: 2RM then 85%×2×4+; T2a 7×2 @ 80%", () => {
    const p = planDay(def, cfg, atWeek(initialState(def, cfg), 4, 0));
    expect(sets(p, "d1-t1").slice(1)).toEqual([[255, 2, false], [255, 2, false], [255, 2, false], [255, 2, true]]);
    expect(sets(p, "d1-t2a")).toEqual(Array(7).fill([320, 2, false]));
  });
  it("week 6 is a 1RM test that resets the TM to 90% of the single; T2a block 2 uses it", () => {
    let s = atWeek(initialState(def, cfg), 5, 1);
    expect(def.days[1].id).toBe("D1-test");
    const p = planDay(def, cfg, s);
    expect(p.exercises.map((e) => e.slotId)).toEqual(["d1-test"]);
    s = applyWorkout(def, cfg, s, W("t", "2026-02-10", [[SQ, [[225, 3], [275, 1], [315, 1], [350, 1]]]]), 1);
    expect(s.tms.squat).toBe(315);
    // week 7 day 3: front squat 5×6 @ 70% of its own TM; deficit DL on day 1 70% of deadlift TM
    const w7 = planDay(def, cfg, atWeek(s, 6, 0));
    expect(sets(w7, "d1-t2a")).toEqual(Array(5).fill([280, 6, false]));
  });
  it("week 7 drop sets are 85% of the day's 6RM (as a share of its e1RM), not of TM", () => {
    const p = planDay(def, cfg, atWeek(initialState(def, cfg), 6, 0));
    const drops = p.exercises[0].sets.slice(1);
    expect(drops).toHaveLength(5);
    expect(drops.every((x) => x.ofTop && x.reps === 3 && x.weight === 0)).toBe(true);
    // 6RM of 300 → e1RM 360 → 0.708 × 360 ≈ 255 = 85% of 300
    expect(Math.round(drops[0].pct! * 360)).toBe(255);
    expect(drops[4].amrap).toBe(true);
  });
  it("completes after the week-12 tests", () => {
    let s = atWeek(initialState(def, cfg), 11, 1);
    const lifts: [number, string][] = [[1, SQ], [3, "Bench Press (Barbell)"], [5, "Deadlift (Barbell)"], [7, "Overhead Press (Barbell)"]];
    for (const [i, title] of lifts) {
      expect(s.dayIndex).toBe(i);
      s = applyWorkout(def, cfg, s, W(`x${i}`, "2026-03-30", [[title, [[200, 1]]]]), i);
    }
    expect(s.complete).toBe(true);
  });
});

describe("The Rippler", () => {
  const { def, cfg } = setup(gzclRippler, { bench: 200, inclineBench: 150 });
  it("weeks 1–4 match the wiki: T1 85%×5×3, 90%×3×4+, 87.5%×4×3, 92.5%×2×5; T2 80%×6×5 … 82.5%×6×4", () => {
    const s0 = initialState(def, cfg);
    const wk = (w: number) => planDay(def, cfg, atWeek(s0, w, 0));
    expect(sets(wk(0), "d1-t1")).toEqual(Array(3).fill([170, 5, false]));
    expect(sets(wk(1), "d1-t1")).toEqual([[180, 3, false], [180, 3, false], [180, 3, false], [180, 3, true]]);
    expect(sets(wk(2), "d1-t1")).toEqual(Array(3).fill([175, 4, false]));
    expect(sets(wk(3), "d1-t1")).toEqual(Array(5).fill([185, 2, false]));
    expect(sets(wk(0), "d1-t2")).toEqual(Array(5).fill([120, 6, false]));
    expect(sets(wk(2), "d1-t2").at(-1)).toEqual([135, 4, true]);
    expect(sets(wk(3), "d1-t2")).toEqual(Array(4).fill([125, 6, false]));
  });
  it("drops T2 in weeks 11–12 and finishes after 12 weeks", () => {
    let s = atWeek(initialState(def, cfg), 11, 0);
    expect(planDay(def, cfg, s).exercises.map((e) => e.tier)).toEqual(["T1", "T3", "T3"]);
    const titles = ["Bench Press (Barbell)", SQ, "Overhead Press (Barbell)", "Deadlift (Barbell)"];
    titles.forEach((t, i) => { s = applyWorkout(def, cfg, s, W(`r${i}`, "2026-03-30", [[t, [[200, 1]]]]), i); });
    expect(s.complete).toBe(true);
  });
});

describe("The GZCL Method", () => {
  const { def, cfg } = setup(gzclMethod, { squat: 300, bench: 200 });
  it("squat wave from the post: 3×5@85, 4×3@90, 3@87.5/2×2@92.5/3×1@97.5, retest 90/95/100+", () => {
    const s0 = initialState(def, cfg);
    const wk = (w: number) => sets(planDay(def, cfg, atWeek(s0, w, 0)), "d1-t1");
    expect(wk(0)).toEqual(Array(3).fill([255, 5, false]));
    expect(wk(1)).toEqual(Array(4).fill([270, 3, false]));
    expect(wk(2)).toEqual([[265, 3, false], [280, 2, false], [280, 2, false], [295, 1, false], [295, 1, false], [295, 1, false]]);
    expect(wk(3)).toEqual([[270, 3, false], [285, 2, false], [300, 1, true]]);
    expect(sets(planDay(def, cfg, atWeek(s0, 0, 0)), "d1-t2")).toEqual(Array(4).fill([195, 8, false]));
  });
  it("retest reps on the 100% set raise the goal weight; extra reps in week 1 don't", () => {
    let s = initialState(def, cfg);
    s = applyWorkout(def, cfg, s, W("a", "2026-01-05", [[SQ, [[255, 6], [255, 5], [255, 5]]]]), 0);
    expect(s.tms.squat).toBe(300);
    s = applyWorkout(def, cfg, atWeek(s, 3, 0), W("b", "2026-01-26", [[SQ, [[270, 3], [285, 2], [300, 3]]]]), 0);
    expect(s.tms.squat).toBe(310);
    s = applyWorkout(def, cfg, atWeek(s, 3, 0), W("c", "2026-02-23", [[SQ, [[280, 3], [295, 2], [310, 1]]]]), 0);
    expect(s.tms.squat).toBe(310);
  });
});

describe("VDIP", () => {
  const { def, cfg } = setup(gzclVdip, { squat: 300, stiffLegDeadlift: 200 });
  it("prescribes 3 max-rep sets at the working weight for T1/T2 and 4 for T3", () => {
    const p = planDay(def, cfg, initialState(def, cfg));
    expect(sets(p, "d1-t1")).toEqual(Array(3).fill([300, 5, true]));
    expect(sets(p, "d1-t2")).toEqual(Array(3).fill([200, 10, true]));
    expect(sets(p, "d1-t3a")).toHaveLength(4);
  });
  const SLDL = "Straight Leg Deadlift";
  const run = (sq: number[], sl: number[]) => {
    const s = initialState(def, cfg);
    return applyWorkout(def, cfg, s, W("v", "2026-01-05", [[SQ, sq.map((r) => [300, r] as [number, number])], [SLDL, sl.map((r) => [200, r] as [number, number])]]), 0).tms;
  };
  it("T1: 15+ → +10, 10–14 → +5, under 10 → −5%", () => {
    expect(run([6, 5, 4], [10, 10, 10]).squat).toBe(310);
    expect(run([6, 4, 4], [10, 10, 10]).squat).toBe(305);
    expect(run([4, 3, 2], [10, 10, 10]).squat).toBe(285);
  });
  it("T2: over 30 → +10, 25–30 → +5, 20–24 hold, under 20 → −5%", () => {
    expect(run([5, 5, 5], [12, 11, 10]).stiffLegDeadlift).toBe(210);
    expect(run([5, 5, 5], [10, 10, 10]).stiffLegDeadlift).toBe(205);
    expect(run([5, 5, 5], [9, 8, 7]).stiffLegDeadlift).toBe(200);
    expect(run([5, 5, 5], [7, 6, 5]).stiffLegDeadlift).toBe(190);
  });
});
