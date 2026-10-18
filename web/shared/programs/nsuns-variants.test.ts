import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { nsuns4, nsuns6Deadlift, nsuns6Squat } from "./nsuns-variants";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});

function setup(t: ProgramTemplate, tms?: Record<string, number>) {
  const def = t.build({});
  const cfg: ProgramConfig = { templateId: t.id, options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: tms ?? t.defaults!("lb").trainingMaxes!, increments: {} };
  return { def, cfg };
}
const weights = (t: ReturnType<typeof setup>, day: number, ex: number, s = initialState(t.def, t.cfg)) => planDay(t.def, t.cfg, s, day).exercises[ex].sets.map((x) => x.weight);
const reps = (t: ReturnType<typeof setup>, day: number, ex: number) => planDay(t.def, t.cfg, initialState(t.def, t.cfg), day).exercises[ex].sets.map((x) => `${x.reps}${x.amrap ? "+" : ""}`);

describe("nSuns 4-day", () => {
  // LiftVault sheet, 4 Day LP tab: TMs squat 225, bench 190, deadlift 285, press 105.
  const t = setup(nsuns4, { squat: 225, bench: 190, deadlift: 285, ohp: 105 });

  it("builds and matches the sheet's numbers", () => {
    expect(t.def.days.map((d) => d.slots[0].lift)).toEqual(["bench", "squat", "bench", "deadlift"]);
    expect(weights(t, 0, 0)).toEqual([125, 145, 160, 160, 160, 150, 145, 135, 125]);
    expect(reps(t, 0, 0)).toEqual(["8", "6", "4", "4", "4", "5", "6", "7", "8+"]);
    expect(weights(t, 0, 1)).toEqual([55, 65, 75, 75, 75, 75, 75, 75]);
    expect(weights(t, 1, 0)).toEqual([170, 190, 215, 205, 190, 180, 170, 160, 145]);
    expect(weights(t, 1, 1)).toEqual([145, 170, 200, 200, 200, 200, 200, 200]);
    expect(weights(t, 2, 0)).toEqual([145, 160, 180, 170, 160, 150, 145, 135, 125]);
    expect(weights(t, 2, 1)).toEqual([75, 95, 115, 115, 115, 115, 115, 115]);
    expect(weights(t, 3, 0)).toEqual([215, 240, 270, 255, 240, 230, 215, 200, 185]);
    expect(reps(t, 3, 0)).toEqual(["5", "3", "1+", "3", "3", "3", "3", "3", "3+"]);
    expect(weights(t, 3, 1)).toEqual([80, 100, 125, 125, 125, 125, 125, 125]);
  });

  it("bumps the TM at the end of the week from the 1+ set", () => {
    let s = initialState(t.def, t.cfg);
    const sq = planDay(t.def, t.cfg, s, 1).exercises[0].sets.map((x, i) => [x.weight, i === 2 ? 4 : x.reps] as [number, number]);
    const dl = planDay(t.def, t.cfg, s, 3).exercises[0].sets.map((x, i) => [x.weight, i === 2 ? 1 : x.reps] as [number, number]);
    s = applyWorkout(t.def, t.cfg, s, W("b1", "2026-01-05", [["Bench Press (Barbell)", [[125, 8]]]]), 0);
    s = applyWorkout(t.def, t.cfg, s, W("sq", "2026-01-06", [["Squat (Barbell)", sq]]), 1);
    expect(s.tms.squat).toBe(225); // pending until the week is done
    s = applyWorkout(t.def, t.cfg, s, W("b2", "2026-01-08", [["Bench Press (Barbell)", [[180, 7]]]]), 2);
    s = applyWorkout(t.def, t.cfg, s, W("dl", "2026-01-09", [["Deadlift (Barbell)", dl]]), 3);
    expect(s.rotations).toBe(1);
    expect(s.tms).toMatchObject({ squat: 235, deadlift: 285, bench: 200, ohp: 105 }); // 4 reps lower +10, 1 rep +0, 7 reps upper +10
  });
});

describe("nSuns 6-day", () => {
  // Sheet tabs: 1RMs squat 500, deadlift 600 → TMs 450 / 540, bench TM 315.
  const tms = { squat: 450, bench: 315, deadlift: 540, ohp: 205 };

  it("deadlift focus: Tue deadlift, Thu squat, Saturday 8×3 deadlift + 6×3 front squat", () => {
    const t = setup(nsuns6Deadlift, tms);
    expect(t.def.days.map((d) => d.slots[0].lift)).toEqual(["bench", "deadlift", "ohp", "squat", "bench", "deadlift"]);
    expect(weights(t, 1, 0)).toEqual([405, 460, 515, 485, 460, 430, 405, 380, 350]);
    expect(weights(t, 0, 0)).toEqual([205, 235, 270, 270, 270, 250, 235, 220, 205]);
    expect(weights(t, 5, 0)).toEqual(Array(8).fill(390));
    expect(reps(t, 5, 0)).toEqual(["3", "3", "3+", "3", "3", "3", "3", "3"]);
    expect(weights(t, 5, 1)).toEqual(Array(6).fill(255));
  });

  it("squat focus: Saturday 8×3 squat + 6×3 sumo", () => {
    const t = setup(nsuns6Squat, tms);
    expect(t.def.days.map((d) => d.slots[0].lift)).toEqual(["bench", "squat", "ohp", "deadlift", "bench", "squat"]);
    expect(weights(t, 1, 0)).toEqual([340, 385, 430, 405, 385, 360, 340, 315, 295]);
    expect(weights(t, 5, 0)).toEqual(Array(8).fill(325));
    expect(weights(t, 5, 1)).toEqual(Array(6).fill(305));
  });

  it("Saturday uses this week's TM; the bump lands next week", () => {
    const t = setup(nsuns6Squat, tms);
    let s = initialState(t.def, t.cfg);
    const sq = planDay(t.def, t.cfg, s, 1).exercises[0].sets.map((x, i) => [x.weight, i === 2 ? 6 : x.reps] as [number, number]);
    s = applyWorkout(t.def, t.cfg, s, W("sq", "2026-01-06", [["Squat (Barbell)", sq]]), 1);
    expect(planDay(t.def, t.cfg, s, 5).exercises[0].sets[0].weight).toBe(325);
    s = applyWorkout(t.def, t.cfg, s, W("sat", "2026-01-10", [["Squat (Barbell)", Array(8).fill([325, 3])]]), 5);
    expect(s.rotations).toBe(1);
    expect(s.tms.squat).toBe(465); // 6+ reps on a lower lift = 3 × 5 lb
  });
});
