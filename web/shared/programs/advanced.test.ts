import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { calgary8, e1rmPct, juggernaut, rpePct, rtsGeneralized } from "./advanced";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);

function setup(t: ProgramTemplate, options: Record<string, string> = {}) {
  const d = t.defaults!("lb");
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit: "lb", startDate: "2026-01-01", startWeights: d.startWeights ?? {}, trainingMaxes: d.trainingMaxes ?? {}, increments: {} };
  return { cfg, def: t.build(opts) };
}
const dayIdx = (def: ReturnType<ProgramTemplate["build"]>, id: string) => def.days.findIndex((d) => d.id === id);
const plan = (t: ProgramTemplate, dayId: string, opts?: Record<string, string>) => {
  const { cfg, def } = setup(t, opts);
  const s = initialState(def, cfg);
  const week = def.days[dayIdx(def, dayId)].weeks![0];
  return planDay(def, cfg, { ...s, rotations: week }, dayIdx(def, dayId));
};

describe("RPE chart", () => {
  it("matches the RTS chart and converts Epley to chart e1RM", () => {
    expect(rpePct(1, 10)).toBe(1);
    expect(rpePct(1, 9)).toBe(0.955);
    expect(rpePct(5, 8)).toBeCloseTo(0.811, 6);
    expect(rpePct(3, 8)).toBeCloseTo(0.863, 6);
    // 300 × 3 @8: chart e1RM 300 / .863 = 347.6; Epley 330 × pct ≈ the same
    expect(300 * 1.1 * e1rmPct(3, 8)).toBeCloseTo(347.6, 0);
  });
});

describe("Juggernaut 2.0", () => {
  it("builds 16 weeks × 4 days with the sheet's percentages", () => {
    const { def } = setup(juggernaut);
    expect(def.days).toHaveLength(64);
    // squat TM 285. 10s accumulation: 5×10 @ 60% (last AMRAP) → 171 → CEILING 175 (the sheet rounds up)
    const acc = plan(juggernaut, "W1D1").exercises[0];
    expect(acc.sets.map((s) => s.weight)).toEqual([175, 175, 175, 175, 175]);
    expect(acc.sets[4].amrap).toBe(true);
    // 10s intensification: 55%×5, 62.5%×5, 3×10 @ 67.5%
    expect(plan(juggernaut, "W2D1").exercises[0].sets.map((s) => [s.pct, s.reps])).toEqual([[0.55, 5], [0.625, 5], [0.675, 10], [0.675, 10], [0.675, 10]]);
    // 3s realization: 50/60/70/75/80/85 ramp, 90% × 3+
    const r3 = plan(juggernaut, "W15D1").exercises[0].sets;
    expect(r3.map((s) => s.pct)).toEqual([0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]);
    expect(r3[6]).toMatchObject({ reps: 3, amrap: true, weight: 260 }); // 285 × .9 = 256.5 → 260
    // 5s accumulation is 6×5 @ 70%
    expect(plan(juggernaut, "W9D2").exercises[0].sets).toHaveLength(6);
  });

  // LiftVault sheet: new TM = CEILING(TM + (reps − standard) × 5 lb lower / 2.5 lb upper), no cap and
  // no floor; the deload week still uses the old TM.
  it("realization AMRAP moves the TM by (reps − standard) × 5 / 2.5 lb either way, from the next wave", () => {
    const { def } = setup(juggernaut);
    const cfg: ProgramConfig = { templateId: "juggernaut", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: { squat: 405, bench: 240, deadlift: 500, ohp: 135 } };
    let s = { ...initialState(def, cfg), rotations: 2, dayIndex: dayIdx(def, "W3D1") };
    // 10s realization squat @ 75% of 405 = 303.75 → 305: 22 reps = 12 over → +60 (no cap)
    s = applyWorkout(def, cfg, s, W("r1", "2026-01-15", [["Squat (Barbell)", [[305, 22]]]]), dayIdx(def, "W3D1"));
    // bench @ 75% of 240 = 180: 13 reps = 3 over → 247.5 → CEILING 250
    s = applyWorkout(def, cfg, s, W("r2", "2026-01-16", [["Bench Press (Barbell)", [[180, 13]]]]), dayIdx(def, "W3D2"));
    // deadlift 8 reps = 2 short → −10
    s = applyWorkout(def, cfg, s, W("r3", "2026-01-17", [["Deadlift (Barbell)", [[375, 8]]]]), dayIdx(def, "W3D3"));
    s = applyWorkout(def, cfg, s, W("r4", "2026-01-18", [["Overhead Press (Barbell)", [[105, 10]]]]), dayIdx(def, "W3D4"));
    expect(s.tms).toMatchObject({ squat: 405, bench: 240, deadlift: 500, ohp: 135 });
    // deload week runs off the old TM: 60% of 405 = 243 → 245
    expect(planDay(def, cfg, s).exercises[0].sets.map((x) => x.weight)).toEqual([165, 205, 245]);
    for (const d of [1, 2, 3, 4]) s = applyWorkout(def, cfg, s, W(`d${d}`, "2026-01-22", [["Squat (Barbell)", [[100, 5]]]]), dayIdx(def, `W4D${d}`));
    expect(s.tms).toMatchObject({ squat: 465, bench: 250, deadlift: 490, ohp: 135 });
    // accumulation AMRAPs never move the TM
    let a = initialState(def, cfg);
    a = applyWorkout(def, cfg, a, W("a", "2026-01-02", [["Squat (Barbell)", rep(5, 245, 10, 20)]]), dayIdx(def, "W1D1"));
    expect(a.tms.squat).toBe(405);
  });

  it("completes after 16 weeks", () => {
    const { cfg, def } = setup(juggernaut);
    const lifts = ["Squat (Barbell)", "Bench Press (Barbell)", "Deadlift (Barbell)", "Overhead Press (Barbell)"];
    const ws: HevyWorkout[] = [];
    for (let wk = 0; wk < 16; wk++) for (let d = 0; d < 4; d++) {
      const date = new Date(Date.UTC(2026, 0, 2 + wk * 7 + d)).toISOString().slice(0, 10);
      ws.push(W(`w${wk}${d}`, date, [[lifts[d], rep(3, 100, 5)]]));
    }
    const s = replay(def, cfg, ws);
    expect(s.log).toHaveLength(64);
    expect(s.complete).toBe(true);
  });
});

describe("Calgary Barbell", () => {
  it("week 1 day 1: squat 3×3 @ 80% + 2×5 @ 68%, pause bench 4×3 @ 80% + 2×5 @ 68%, SLDL 4×9 @ RPE 8, side planks", () => {
    const p = plan(calgary8, "W1D1");
    expect(p.exercises.map((e) => e.lift)).toEqual(["squat", "bench", "stiffLegDeadlift", "sidePlank"]);
    expect(p.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([[250, 3], [250, 3], [250, 3], [215, 5], [215, 5]]); // 315 × .8 = 252, × .68 = 214
    expect(p.exercises[1].sets.map((s) => [s.weight, s.reps])).toEqual([[180, 3], [180, 3], [180, 3], [180, 3], [155, 5], [155, 5]]); // 225 × .8, × .68 = 153
    expect(p.exercises[2].sets).toHaveLength(4);
    expect(p.exercises[2].sets[0]).toMatchObject({ rpe: 8, reps: 9, weight: 0 });
  });

  it("week 4 day 4 / week 6 day 3 match the sheet (1+2F etc. expand to top set + extra sets)", () => {
    expect(plan(calgary8, "W4D4").exercises.map((e) => [e.lift, e.sets.length, e.sets[0].reps, e.sets[0].rpe])).toEqual([
      ["pauseDeadlift", 4, 2, 9], ["bench", 4, 5, 8], ["inclineBench", 4, 10, undefined], ["dbRow", 6, 8, undefined],
    ]);
    // Pin squat 1×2 @8, then 1+1F × 5 @9 → one slot, three sets
    const pin = plan(calgary8, "W6D3").exercises[0];
    expect(pin.sets.map((s) => [s.reps, s.rpe])).toEqual([[2, 8], [5, 9], [5, 9]]);
    expect(setup(calgary8, { taper: "off" }).def.cycle!.weeks).toBe(8);
    expect(setup(calgary8).def.cycle!.weeks).toBe(9);
  });

  it("top-set weeks: back-offs are % of today's e1RM; the 1RM stays as entered (the sheet's taper uses the static maxes)", () => {
    const { cfg, def } = setup(calgary8);
    const i = dayIdx(def, "W5D1");
    let s = { ...initialState(def, cfg), rotations: 4 };
    const sq = planDay(def, cfg, s, i).exercises[0];
    expect(sq.sets[0]).toMatchObject({ rpe: 8, reps: 3, weight: 0 });
    expect(sq.sets.slice(1).map((x) => [x.pct, x.reps, x.ofTop, x.weight])).toEqual(Array(6).fill([0.65, 5, true, 0])); // 6×5 @ 65% of today's e1RM
    s = applyWorkout(def, cfg, s, W("t", "2026-02-01", [["Squat (Barbell)", [[300, 3], ...rep(6, 205, 5)]]]), i);
    expect(s.tms.squat).toBe(315);
    // taper 5 days out: 3×2 @ 82% of the entered 315 = 258.3 → 260
    const taper = planDay(def, cfg, { ...s, rotations: 8 }, dayIdx(def, "W9D1")).exercises[0];
    expect(taper.sets[1]).toMatchObject({ weight: 260, reps: 2 });
  });

  it("taper: 3 days out squat is 1×1 @ 85% + 2×2 @ 78%", () => {
    const p = plan(calgary8, "W9D3");
    expect(p.dayName).toBe("Taper · 3 days out");
    expect(p.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([[270, 1], [245, 2], [245, 2]]);
  });

  it("finishes after the last week", () => {
    const { cfg, def } = setup(calgary8, { taper: "off" });
    let s = initialState(def, cfg);
    def.days.forEach((d, k) => { s = applyWorkout(def, cfg, s, W(`c${k}`, "2026-01-02", [["Squat (Barbell)", rep(3, 200, 3)]]), k); });
    expect(s.log).toHaveLength(32);
    expect(s.complete).toBe(true);
  });
});

describe("RTS Generalized Intermediate", () => {
  it("weeks 1–4 have four days, 5–8 three, week 9 is the taper/test", () => {
    const { def } = setup(rtsGeneralized);
    const per = Array.from({ length: 9 }, (_, w) => def.days.filter((d) => d.weeks![0] === w).length);
    expect(per).toEqual([4, 4, 4, 4, 3, 3, 3, 3, 3]);
  });

  it("week 1 is top sets only; week 3 squat x3 @9 with 6–9% load-drop back-offs off the e1RM", () => {
    const w1 = plan(rtsGeneralized, "W1D1").exercises;
    expect(w1.map((e) => e.lift)).toEqual(["squat", "bench", "pauseBench"]);
    expect(w1[0].sets).toEqual([{ weight: 0, reps: 4, rpe: 9, amrap: false, pct: undefined, repsMax: undefined }]);
    const sq = plan(rtsGeneralized, "W3D1").exercises[0];
    // back-offs: top set (3 @9 = 89.2% of e1RM) minus 7.5% → 82.5% of today's top-set e1RM, 4 sets
    // article: "drop the bar by X%": 7.5% off a top triple = 0.925 / 1.1 of its Epley e1RM
    expect(sq.sets.slice(1).map((s) => [s.pct, s.reps, s.ofTop])).toEqual(Array(4).fill([0.841, 3, true]));
  });

  it("the comp top set updates the max; week 9 tests it", () => {
    const { cfg, def } = setup(rtsGeneralized);
    let s = { ...initialState(def, cfg), rotations: 1 };
    // 280 × 5 @9: chart 5@9 = 83.7% → e1RM 334.5 → 335
    s = applyWorkout(def, cfg, s, W("a", "2026-01-08", [["Squat (Barbell)", [[280, 5], ...rep(3, 265, 5)]], ["Bench Press (Barbell)", [[200, 5]]]]), dayIdx(def, "W2D1"));
    expect(s.tms.squat).toBe(335);
    expect(planDay(def, cfg, { ...s, rotations: 8 }, dayIdx(def, "W9D1")).exercises[0].sets[0].weight).toBe(310); // 92% × 335 = 308
    s = applyWorkout(def, cfg, { ...s, rotations: 8 }, W("t", "2026-03-01", [["Squat (Barbell)", [[315, 1], [345, 1]]]]), dayIdx(def, "W9D3"));
    expect(s.tms.squat).toBe(345);
    expect(s.complete).toBe(true);
  });
});
