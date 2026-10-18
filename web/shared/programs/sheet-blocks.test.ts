import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { allSlots, applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramDef, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { candito6, clarence14, complete16 } from "./sheet-blocks";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const title = (lift: string) => LIFTS[lift].hevy[0];

function setup(t: ProgramTemplate, maxes?: Record<string, number>, options: Record<string, string> = {}) {
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: maxes ?? t.defaults!("lb").trainingMaxes!, increments: {} };
  const def = t.build(opts);
  return { cfg, def };
}

/** Plan a given day id ("W4D3") as if that week had been reached. */
function plan(def: ProgramDef, cfg: ProgramConfig, dayId: string, state?: ProgramState) {
  const i = def.days.findIndex((d) => d.id === dayId);
  expect(i).toBeGreaterThanOrEqual(0);
  const week = Number(dayId.slice(1, dayId.indexOf("D"))) - 1;
  return planDay(def, cfg, { ...(state ?? initialState(def, cfg)), rotations: week }, i);
}
const loads = (def: ProgramDef, cfg: ProgramConfig, dayId: string, lift: string, k = 0) =>
  plan(def, cfg, dayId).exercises.filter((e) => e.lift === lift)[k].sets.map((s) => s.weight);

/** Log every scheduled day as prescribed (percent loads, or 100 for RPE / fixed work) until the program completes. */
function runAll(def: ProgramDef, cfg: ProgramConfig) {
  let s = initialState(def, cfg);
  let n = 0;
  while (!s.complete && n < 200) {
    const p = planDay(def, cfg, s);
    const ex = p.exercises.filter((e) => LIFTS[e.lift]?.hevy.length).map((e): [string, [number, number][]] => [title(e.lift), e.sets.map((x) => [x.weight || 100, x.reps])]);
    s = applyWorkout(def, cfg, s, W(`w${n}`, "2026-02-01", ex), s.dayIndex);
    n++;
  }
  return { s, n };
}

const uniqueIds = (def: ProgramDef) => {
  const ids = allSlots(def).map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(def.days.map((d) => d.id)).size).toBe(def.days.length);
};

describe("Candito 6 Week (vs the source sheet: 1RMs B185 S250 D295 lb)", () => {
  const { cfg, def } = setup(candito6, { squat: 250, bench: 185, deadlift: 295 });

  it("builds 22 sessions over 6 weeks", () => {
    expect(def.days).toHaveLength(22);
    expect(def.cycle).toMatchObject({ weeks: 6, finite: true });
    expect(def.maxLabel).toBe("1RM");
    uniqueIds(def);
  });

  it("matches every main-lift load in the sheet", () => {
    const sheet: [string, string, number[], number?][] = [
      ["W1D1", "squat", [200, 200, 200, 200]], ["W1D1", "deadlift", [235, 235]],
      ["W1D2", "bench", [95, 125, 140, 145]], ["W1D4", "squat", [175, 175, 175, 175]], ["W1D4", "deadlift", [205, 205]],
      ["W1D5", "bench", [150]],
      ["W2D1", "squat", [200, 205, 205, 205, 205, 205]], ["W2D2", "bench", [135, 145, 155]],
      ["W2D3", "squat", [205, ...Array(10).fill(195)]], ["W2D5", "bench", [145]],
      ["W3D1", "squat", [220, 220, 220]], ["W3D1", "deadlift", [260, 260]], ["W3D2", "bench", [155, 155, 155]],
      ["W3D3", "squat", [225]], ["W3D4", "bench", [160, 160, 160]],
      ["W4D1", "squat", [220, 225, 230]], ["W4D2", "bench", [155, 160, 165]],
      ["W4D3", "squat", [230, 240]], ["W4D3", "deadlift", [270, 280]], ["W4D4", "bench", [160, 165, 175]],
      ["W5D1", "squat", [245]], ["W5D1", "deadlift", [200, 205, 215]], ["W5D2", "bench", [180]], ["W5D3", "deadlift", [290]],
    ];
    for (const [day, lift, want] of sheet) expect([day, lift, loads(def, cfg, day, lift)]).toEqual([day, lift, want]);
  });

  it("week 1 day 1 squat is 4×6 @ 80% of 1RM, with accessories as fixed slots", () => {
    const p = plan(def, cfg, "W1D2");
    expect(p.exercises[0]).toMatchObject({ lift: "bench", tier: "MAIN" });
    const row = p.exercises.find((e) => e.lift === "cableRow")!;
    expect(row.sets).toHaveLength(4);
    expect(row.sets[0]).toMatchObject({ reps: 6, repsMax: 10 });
    expect(plan(def, cfg, "W1D1").exercises[0]).toMatchObject({ scheme: "4×6", sets: [{ pct: 0.8, weight: 200 }, {}, {}, {}] });
  });

  it("MR10 under 8 reps drops the squat max 2.5%; 8+ keeps it", () => {
    const i = def.days.findIndex((d) => d.id === "W2D1");
    const base = { ...initialState(def, cfg), rotations: 1, dayIndex: i };
    const bad = applyWorkout(def, cfg, base, W("a", "2026-01-12", [[title("squat"), [[200, 6], [205, 3], [205, 3], [205, 3], [205, 3], [205, 3]]]]), i);
    expect(bad.tms.squat).toBe(243.75);
    const ok = applyWorkout(def, cfg, base, W("b", "2026-01-12", [[title("squat"), [[200, 9], [205, 3], [205, 3], [205, 3], [205, 3], [205, 3]]]]), i);
    expect(ok.tms.squat).toBe(250);
  });

  it("week 5 1–4 rep set projects the new max (4 reps ≈ ×1.09)", () => {
    const i = def.days.findIndex((d) => d.id === "W5D1");
    const s = applyWorkout(def, cfg, { ...initialState(def, cfg), rotations: 4, dayIndex: i }, W("c", "2026-02-01", [[title("squat"), [[245, 4]]]]), i);
    expect(s.tms.squat).toBeCloseTo(265.69, 2); // 97.5% × 1.09 of 250
  });

  it("runs to completion, the week-6 max test sets the new 1RM", () => {
    const { s, n } = runAll(def, cfg);
    expect(n).toBe(22);
    expect(s.complete).toBe(true);
    const test = s.log[s.log.length - 1];
    expect(test.dayId).toBe("W6D1");
    expect(test.results.map((r) => r.lift)).toEqual(["squat", "bench", "deadlift"]);
    // the logged single becomes the new 1RM
    for (const r of test.results) expect(s.tms[r.lift]).toBe(r.weight);
  });

  it("week 6 options: deload repeats week 1 minus the last upper day; skip ends after 5 weeks", () => {
    const d = setup(candito6, undefined, { week6: "deload" }).def;
    expect(d.days.filter((x) => x.weeks?.includes(5)).map((x) => x.id)).toEqual(["W6D1", "W6D2", "W6D3", "W6D4"]);
    const k = setup(candito6, undefined, { week6: "skip" }).def;
    expect(k.cycle?.weeks).toBe(5);
    expect(k.days).toHaveLength(21);
  });

  it("replay matches logged workouts to the right days", () => {
    const s = replay(def, cfg, [
      W("1", "2026-01-04", [[title("squat"), [[200, 6], [200, 6], [200, 6], [200, 6]]], [title("deadlift"), [[235, 6], [235, 6]]]]),
      W("2", "2026-01-05", [[title("bench"), [[95, 10], [125, 10], [140, 8], [145, 6]]]]),
    ]);
    expect(s.log.map((l) => l.dayId)).toEqual(["W1D1", "W1D2"]);
    expect(s.dayIndex).toBe(2);
  });
});

describe("Clarence0 14 Week (vs the source sheet)", () => {
  const { cfg, def } = setup(clarence14);

  it("builds 53 sessions over 14 weeks with RPE-only main work", () => {
    expect(def.days).toHaveLength(53);
    uniqueIds(def);
    const d1 = plan(def, cfg, "W1D1");
    expect(d1.exercises[0]).toMatchObject({ lift: "squat", scheme: "4×7 @6" });
    expect(d1.exercises[0].sets[0]).toMatchObject({ weight: 0, rpe: 6 });
    expect(plan(def, cfg, "W2D1").exercises[0].sets[0].rpe).toBe(7.5);
    expect(def.days.find((d) => d.id === "W6D3")).toBeUndefined(); // deload day off
    expect(def.days.filter((d) => d.weeks?.[0] === 13).map((d) => d.id)).toEqual(["W14D1", "W14D2", "W14D3"]);
  });

  it("strict press is 4×AMRAP @ 65% of the OHP max (145 → 95)", () => {
    const ohp = plan(def, cfg, "W2D2").exercises.find((e) => e.lift === "ohp")!;
    expect(ohp.sets.map((s) => [s.weight, s.amrap])).toEqual(Array(4).fill([95, true]));
  });

  it("the week-5 8RM re-estimates the squat max", () => {
    const i = def.days.findIndex((d) => d.id === "W5D1");
    const s = applyWorkout(def, cfg, { ...initialState(def, cfg), rotations: 4, dayIndex: i }, W("x", "2026-02-02", [[title("squat"), [[275, 8]]]]), i);
    expect(s.tms.squat).toBe(350); // 275 × (1 + 8/30) = 348 → 350
  });

  it("runs to completion; the week-14 1RM sets the deadlift max", () => {
    const { s, n } = runAll(def, cfg);
    expect(n).toBe(53);
    expect(s.complete).toBe(true);
    expect(s.log[s.log.length - 1].dayId).toBe("W14D3");
  });
});

describe("Complete 16 Week / Calgary Barbell (vs the source sheet: maxes S255 B185 D315)", () => {
  const { cfg, def } = setup(complete16, { squat: 255, bench: 185, deadlift: 315, ohp: 135 });

  it("builds 64 sessions over 16 weeks", () => {
    expect(def.days).toHaveLength(64);
    uniqueIds(def);
  });

  it("matches the sheet's loads", () => {
    expect(loads(def, cfg, "W1D1", "squat")).toEqual([170, 170, 170, 170]);
    expect(loads(def, cfg, "W1D1", "bench")).toEqual([125, 125, 125, 125]);
    expect(loads(def, cfg, "W4D2", "deadlift")).toEqual(Array(5).fill(235));
    expect(loads(def, cfg, "W1D4", "pauseDeadlift")).toEqual([200, 200, 200]);
    expect(loads(def, cfg, "W1D4", "stiffLegDeadlift")).toEqual([125, 125, 125]);
    expect(loads(def, cfg, "W2D3", "pinSquat")).toEqual([180, 180, 180]);
    expect(loads(def, cfg, "W5D1", "squat")).toEqual([205, 205, 205, 175, 175]);
    expect(loads(def, cfg, "W7D2", "deadlift")).toEqual([270, 270, 270, 270, 270, 225, 225]);
    expect(loads(def, cfg, "W10D1", "bench")).toEqual([...Array(7).fill(155), 135, 135]);
    expect(loads(def, cfg, "W16D1", "bench")).toEqual([0, 155, 155, 155]);
    expect(loads(def, cfg, "W16D3", "squat")).toEqual([215, 200, 200]);
  });

  it("weeks 12–15: RPE top set then % back-offs; 1+NF sets show top + back-offs", () => {
    const sq = plan(def, cfg, "W12D1").exercises[0];
    expect(sq.sets[0]).toMatchObject({ weight: 0, rpe: 8, reps: 3 });
    expect(sq.sets.slice(1).map((s) => s.weight)).toEqual(Array(6).fill(165));
    const ps = plan(def, cfg, "W9D3").exercises[0];
    expect(ps.sets).toHaveLength(3);
    expect(ps.sets[0]).toMatchObject({ rpe: 9, reps: 4 });
  });

  it("runs to completion", () => {
    const { s, n } = runAll(def, cfg);
    expect(n).toBe(64);
    expect(s.complete).toBe(true);
    expect(s.log[s.log.length - 1].dayId).toBe("W16D4");
  });
});
