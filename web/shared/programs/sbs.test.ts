import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { sbsHypertrophy, sbsNoviceHypertrophy, sbsRir, sbsRtf } from "./sbs";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);

function setup(t: ProgramTemplate, options: Record<string, string> = {}) {
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const d = t.defaults!("lb");
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit: "lb", startDate: "2026-01-01", startWeights: d.startWeights ?? {}, trainingMaxes: d.trainingMaxes ?? {} };
  return { cfg, def: t.build(opts) };
}

/** Log the planned session exactly as prescribed (AMRAP = target reps). */
function asPlanned(def: ReturnType<typeof setup>["def"], cfg: ProgramConfig, s: ProgramState, n: number): HevyWorkout {
  const p = planDay(def, cfg, s);
  return W(`w${n}`, `2026-01-01`, p.exercises.map((e) => [LIFTS[e.lift].hevy[0], e.sets.map((x) => [x.weight, x.reps] as [number, number])]));
}

describe("SBS Strength RTF", () => {
  it("builds every days-per-week option with 10 lifts a week (8 at 2x)", () => {
    for (const d of ["2", "3", "4", "5", "6"]) {
      const def = sbsRtf.build({ days: d });
      const lifts = def.days.filter((x) => x.id.startsWith("D") && !x.id.startsWith("DL")).flatMap((x) => x.slots.map((s) => s.lift));
      const n = d === "2" ? 8 : 10;
      expect(new Set(lifts).size).toBe(n);
      expect(lifts.length).toBe(n);
      expect(def.sessionsPerWeek).toBe(Number(d));
      const ids = def.days.flatMap((x) => x.slots.map((s) => s.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("week 1 day 1: squat 4×5 + 1×10+ @ 70%, incline 4×7 + 1×14+ @ 60%", () => {
    const { cfg, def } = setup(sbsRtf);
    const p = planDay(def, cfg, initialState(def, cfg));
    expect(p.weekName).toBe("Block 1 · Week 1");
    const [sq, inc] = p.exercises;
    expect(sq.lift).toBe("squat");
    // 315 × 0.70 = 220.5 → 220 (sheet rounds to 2.5)
    expect(sq.sets.map((s) => [s.weight, s.reps, s.amrap])).toEqual([[220, 5, false], [220, 5, false], [220, 5, false], [220, 5, false], [220, 10, true]]);
    // incline max 190 × 0.60 = 114 → 115
    expect(inc.lift).toBe("inclineBench");
    expect(inc.sets.map((s) => s.reps)).toEqual([7, 7, 7, 7, 14]);
    expect(inc.sets[0].weight).toBe(115);
  });

  it("block 3 week 6 (week 20): squat 4×1 + 1×1+ @ 95%", () => {
    const { cfg, def } = setup(sbsRtf);
    const s = { ...initialState(def, cfg), rotations: 19 };
    const sq = planDay(def, cfg, s, 0).exercises[0];
    expect(sq.sets.map((x) => x.reps)).toEqual([1, 1, 1, 1, 1]);
    expect(sq.sets[0].pct).toBe(0.95);
    expect(sq.sets[0].weight).toBe(300); // 315 × .95 = 299.25 → 300
  });

  it("reps over target raise the max, reps under lower it", () => {
    const { cfg, def } = setup(sbsRtf);
    const s0 = initialState(def, cfg);
    // 13 on a 10+ target: +3 → +1.5% of 315 = 4.725 (the max isn't rounded; loads are)
    const up = applyWorkout(def, cfg, s0, W("a", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5, 13)]]), 0);
    expect(up.tms.squat).toBeCloseTo(319.72, 2);
    expect(up.log[0].results[0].outcome).toBe("tm-up");
    // 8 on a 10+ target: −2 → −5% of 315 = 15.75
    const down = applyWorkout(def, cfg, s0, W("b", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5, 8)]]), 0);
    expect(down.tms.squat).toBeCloseTo(299.25, 2);
    // hit the target exactly: max holds
    const hold = applyWorkout(def, cfg, s0, W("c", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5, 10)]]), 0);
    expect(hold.tms.squat).toBe(315);
  });

  it("runs 21 weeks: deloads are 5×5 @ 60/50% with no max change, then completes", () => {
    const { cfg, def } = setup(sbsRtf);
    let s = initialState(def, cfg);
    let n = 0;
    while (!s.complete && n < 200) {
      const p = planDay(def, cfg, s);
      if (p.week === 6) {
        expect(p.dayId.startsWith("DL")).toBe(true);
        expect(p.weekName).toBe("Block 1 · Deload");
        const sq = p.exercises.find((e) => e.lift === "squat");
        if (sq) expect(sq.sets.map((x) => [x.weight, x.reps])).toEqual(Array(5).fill([190, 5])); // 315 × .6 = 189 → 190
        const aux = p.exercises.find((e) => e.tier === "SUPP")!;
        expect(aux.sets[0].pct).toBe(0.5);
      }
      s = applyWorkout(def, cfg, s, asPlanned(def, cfg, s, n), s.dayIndex);
      n++;
    }
    expect(s.complete).toBe(true);
    expect(n).toBe(21 * 4);
    expect(s.tms.squat).toBe(315); // every AMRAP exactly on target
  });

  it("replay follows the log through Hevy titles", () => {
    const { cfg, def } = setup(sbsRtf);
    const s = replay(def, cfg, [
      W("1", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5, 12)], ["Incline Bench Press (Barbell)", rep(5, 115, 7, 14)], ["Sumo Deadlift", rep(5, 220, 7, 14)]]),
      W("2", "2026-01-03", [["Bench Press (Barbell)", rep(5, 157.5, 5, 11)]]),
    ]);
    expect(s.tms.squat).toBeCloseTo(318.15, 2); // +2 → +1% = 3.15
    expect(s.tms.bench).toBeCloseTo(226.13, 2); // +1 → +0.5% = 1.125
    expect(s.dayIndex).toBe(2 * 2); // D1, DL1, D2, DL2 → next is D3
  });
});

describe("SBS Strength RIR", () => {
  it("week 1: 5×5 @ 70%, last set at RIR 3 (RPE 7)", () => {
    const { cfg, def } = setup(sbsRir);
    const sq = planDay(def, cfg, initialState(def, cfg)).exercises[0];
    expect(sq.sets.map((s) => [s.weight, s.reps])).toEqual(Array(5).fill([220, 5]));
    expect(sq.sets[4]).toMatchObject({ amrap: true, rpe: 7 });
  });

  it("week 17 at 90%: singles, last set RIR 1", () => {
    const { cfg, def } = setup(sbsRir);
    const sq = planDay(def, cfg, { ...initialState(def, cfg), rotations: 16 }, 0).exercises[0];
    expect(sq.sets.map((s) => s.reps)).toEqual([1, 1, 1, 1, 1]);
    expect(sq.sets[4].rpe).toBe(9);
  });

  it("reps past the listed number count as RIR above target", () => {
    const { cfg, def } = setup(sbsRir);
    const s = applyWorkout(def, cfg, initialState(def, cfg), W("a", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5, 7)]]), 0);
    expect(s.tms.squat).toBeCloseTo(318.15, 2); // 2 above → +1%
  });

  // Source rules (Last Set RIR doc): failed sets/reps → −5%; completed but RIR below target → −2%;
  // RIR = target → 0; target + 3 → +1.5%.
  it("missing reps or sets is −5%, RIR below target is −2% however far below", () => {
    const { cfg, def } = setup(sbsRir);
    const s0 = initialState(def, cfg);
    const short = applyWorkout(def, cfg, s0, W("b", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 4)]]), 0);
    expect(short.tms.squat).toBeCloseTo(299.25, 2);
    const dropped = applyWorkout(def, cfg, s0, W("c", "2026-01-02", [["Squat (Barbell)", [[220, 5], [220, 5], [220, 5], [220, 5]]]]), 0);
    expect(dropped.tms.squat).toBeCloseTo(299.25, 2);
    // all 5×5 done, RPE 9.5 logged on the last set: RIR 0.5 vs target 3 → −2% (not −5%)
    const rpe = (x: number): HevyWorkout => ({ ...W("d", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5)]]), exercises: [{ title: "Squat (Barbell)", exercise_template_id: "x", sets: rep(5, 220, 5).map(([lb, r], i) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps: r, rpe: i === 4 ? x : null })) }] });
    expect(applyWorkout(def, cfg, s0, rpe(9.5), 0).tms.squat).toBeCloseTo(308.7, 2);
    // RPE 7 = RIR 3 = target → hold; RPE 4 = RIR 6 = target + 3 → +1.5%
    expect(applyWorkout(def, cfg, s0, rpe(7), 0).tms.squat).toBe(315);
    expect(applyWorkout(def, cfg, s0, rpe(4), 0).tms.squat).toBeCloseTo(319.72, 2);
    // no RPE logged and exactly the listed reps: assume you stopped at the target → hold
    expect(applyWorkout(def, cfg, s0, W("e", "2026-01-02", [["Squat (Barbell)", rep(5, 220, 5)]]), 0).tms.squat).toBe(315);
  });
});

describe("SBS day layouts (bundle 2x–6x tabs)", () => {
  const days = (t: ProgramTemplate, d: string) => t.build({ days: d }).days.filter((x) => !x.id.startsWith("DL")).map((x) => x.slots.map((s) => s.lift));
  it("Strength", () => {
    expect(days(sbsRtf, "2")).toEqual([["squat", "bench", "sumoDeadlift", "pushPress"], ["deadlift", "ohp", "frontSquat", "cgBench"]]);
    expect(days(sbsRtf, "3")).toEqual([["squat", "sumoDeadlift", "inclineBench"], ["bench", "ohp", "frontSquat"], ["deadlift", "cgBench", "pauseSquat", "pushPress"]]);
    expect(days(sbsRir, "4")).toEqual([["squat", "inclineBench", "sumoDeadlift"], ["bench", "frontSquat", "pushPress"], ["deadlift", "cgBench"], ["ohp", "pauseSquat"]]);
    expect(days(sbsRtf, "5")).toEqual([["squat", "pushPress"], ["bench", "frontSquat"], ["deadlift", "cgBench"], ["ohp", "pauseSquat"], ["inclineBench", "sumoDeadlift"]]);
    expect(days(sbsRtf, "6")).toEqual([["squat", "cgBench"], ["pushPress", "sumoDeadlift"], ["bench", "frontSquat"], ["inclineBench", "pauseSquat"], ["deadlift"], ["ohp"]]);
  });
  it("Hypertrophy (block pulls log as rack pulls)", () => {
    expect(days(sbsHypertrophy, "3")).toEqual([["squat", "rdl", "dbBench"], ["bench", "ohp", "legPress"], ["rackPull", "inclineBench", "hackSquat", "dbOhp"]]);
    expect(days(sbsHypertrophy, "6")).toEqual([["squat", "inclineBench"], ["dbOhp", "rdl"], ["bench", "legPress"], ["dbBench", "hackSquat"], ["rackPull"], ["ohp"]]);
  });
});

describe("SBS RTF / Hypertrophy failed sets", () => {
  it("a normal set short of its reps counts as 2+ short (−5%) even when the AMRAP beats the target", () => {
    const { cfg, def } = setup(sbsRtf);
    const s = applyWorkout(def, cfg, initialState(def, cfg), W("a", "2026-01-02", [["Squat (Barbell)", [[220, 5], [220, 5], [220, 3], [220, 5], [220, 12]]]]), 0);
    expect(s.tms.squat).toBeCloseTo(299.25, 2);
  });
});

describe("SBS Hypertrophy", () => {
  it("week 1: bench 3×10 + 1×12+ @ 70%, rounded to 5", () => {
    const { cfg, def } = setup(sbsHypertrophy);
    const s = initialState(def, cfg);
    const day = def.days.findIndex((d) => d.slots[0].lift === "bench" && d.id.startsWith("D") && !d.id.startsWith("DL"));
    const p = planDay(def, cfg, s, day);
    const b = p.exercises[0];
    expect(b.sets.map((x) => [x.weight, x.reps, x.amrap])).toEqual([[160, 10, false], [160, 10, false], [160, 10, false], [160, 12, true]]);
    // aux at 65%: 3×12 + 1×15+
    expect(p.exercises[1].sets.map((x) => x.reps)).toEqual([12, 12, 12, 15]);
  });

  it("week 13 tops out at 80% main: 3×6 + 1×8+", () => {
    const { cfg, def } = setup(sbsHypertrophy);
    const sq = planDay(def, cfg, { ...initialState(def, cfg), rotations: 12 }, 0).exercises[0];
    expect(sq.sets.map((x) => x.reps)).toEqual([6, 6, 6, 8]);
    expect(sq.sets[0].pct).toBe(0.8);
  });
});

describe("SBS Novice Hypertrophy", () => {
  it("3x tab: body-part split, each lift once a week", () => {
    const def = sbsNoviceHypertrophy.build({ days: "3" });
    expect(def.days.map((d) => d.slots.map((s) => s.lift))).toEqual([
      ["dbBench", "tBarRow", "machineShoulderPress", "latPulldown", "dbInclineBench", "cableRow", "preacherCurl", "skullcrusher"],
      ["squat", "rdl", "legPress", "gluteHamRaise", "splitSquat", "calfRaise", "rearDeltFly"],
      ["dbOhp", "pullUp", "legCurl", "seatedCalfRaise", "shrug", "chestFly", "lateralRaise"],
    ]);
    for (const d of ["4", "5"]) expect(sbsNoviceHypertrophy.build({ days: d }).days.flatMap((x) => x.slots).length).toBe(22);
  });

  it("sets → reps → +10% load; a miss repeats the week", () => {
    const { cfg, def } = setup(sbsNoviceHypertrophy);
    let s = initialState(def, cfg);
    const sq = (x: ProgramState) => planDay(def, cfg, x, 1).exercises[0];
    expect(sq(s).scheme).toBe("3×8");
    const seen: string[] = [];
    for (let k = 0; k < 9; k++) {
      const e = sq(s);
      seen.push(`${e.scheme}@${e.sets[0].weight}`);
      s = applyWorkout(def, cfg, s, W(`w${k}`, "2026-01-02", [["Squat (Barbell)", e.sets.map((x) => [x.weight, x.reps] as [number, number])]]), 1);
    }
    expect(seen).toEqual(["3×8@185", "4×8@185", "5×8@185", "3×10@185", "4×10@185", "5×10@185", "3×12@185", "4×12@185", "5×12@185"]);
    expect(sq(s).scheme).toBe("3×8");
    expect(sq(s).sets[0].weight).toBe(205); // 185 × 1.1 = 203.5 → 205 (5 lb rounding)
    // miss a rep at 3×8: same prescription next week
    const miss = applyWorkout(def, cfg, s, W("m", "2026-03-01", [["Squat (Barbell)", [[205, 8], [205, 8], [205, 6]]]]), 1);
    expect(miss.slots["a-squat"]).toMatchObject({ stage: 0, weight: 205 });
  });
});
