import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { nsuns4, nsuns6Deadlift, nsuns6Squat } from "./nsuns-variants";
import { nsuns } from "./nsuns";

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

describe("nSuns 4-day OHP (nSuns' reply in the r/Fitness thread: all reps done → TM +5 lb)", () => {
  const t = setup(nsuns4, { squat: 225, bench: 190, deadlift: 285, ohp: 105 });
  const ohp = (last: number): [number, number][] => [[55, 6], [65, 5], [75, 3], [75, 5], [75, 7], [75, 4], [75, 6], [75, last]];
  const week = (last: number) => {
    let s = initialState(t.def, t.cfg);
    s = applyWorkout(t.def, t.cfg, s, W("d1", "2026-01-05", [["Bench Press (Barbell)", [[125, 8]]], ["Overhead Press (Barbell)", ohp(last)]]), 0);
    expect(s.tms.ohp).toBe(105); // lands at the end of the week
    for (const [i, title] of [[1, "Squat (Barbell)"], [2, "Bench Press (Barbell)"], [3, "Deadlift (Barbell)"]] as const) s = applyWorkout(t.def, t.cfg, s, W(`d${i}`, "2026-01-06", [[title, [[100, 1]]]]), i);
    return s.tms.ohp;
  };
  it("every rep of Monday's OHP → +5 lb next week; one short → holds", () => {
    expect(week(8)).toBe(110);
    expect(week(7)).toBe(105);
  });
});

describe("nSuns 6-day", () => {
  it("Saturday is MROUND(TM × 72.5%) and MROUND(TM × 56.25%), from the sheet's formulas", () => {
    const t = setup(nsuns6Squat, { squat: 300, bench: 200, deadlift: 300, ohp: 100 });
    expect(weights(t, 5, 0)).toEqual(Array(8).fill(220)); // 217.5 → 220 (65%/0.9 gave 215)
    expect(weights(t, 5, 1)).toEqual(Array(6).fill(170)); // 168.75 → 170
  });

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

// nSuns LP Complete Bundle, "5 Day LP" tab in kg mode (TMs squat 450, bench 312.5, deadlift 540,
// press 202.5; every set MROUND(TM × %, 2.5)). Progression text: 1+ set 0–1 reps none, 2–3 +5 lb,
// 4–5 +5–10 lb, more than 5 +10–15 lb (upper body at the low end, lower body at the high end).
describe("nSuns 5-day against the sheet", () => {
  const def = nsuns.build({});
  const cfg: ProgramConfig = { templateId: "nsuns5", options: {}, unit: "kg", startDate: "2026-01-01", startWeights: {}, trainingMaxes: { squat: 450, bench: 312.5, deadlift: 540, ohp: 202.5 } };
  const w = (day: number, ex: number) => planDay(def, cfg, initialState(def, cfg), day).exercises[ex].sets.map((x) => x.weight);
  it("every day's T1 and T2 loads", () => {
    expect(w(0, 0)).toEqual([202.5, 235, 265, 265, 265, 250, 235, 220, 202.5]);
    expect(w(1, 0)).toEqual([337.5, 382.5, 427.5, 405, 382.5, 360, 337.5, 315, 292.5]);
    expect(w(1, 1)).toEqual([270, 325, 377.5, 377.5, 377.5, 377.5, 377.5, 377.5]);
    expect(w(2, 0)).toEqual([152.5, 172.5, 192.5, 182.5, 172.5, 162.5, 152.5, 142.5, 132.5]);
    expect(w(2, 1)).toEqual([125, 157.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5]);
    expect(w(3, 0)).toEqual([405, 460, 512.5, 485, 460, 432.5, 405, 377.5, 350]);
    expect(w(3, 1)).toEqual([157.5, 202.5, 247.5, 247.5, 247.5, 247.5, 247.5, 247.5]);
    expect(w(4, 0)).toEqual([235, 265, 297.5, 282.5, 265, 250, 235, 220, 202.5]);
    expect(w(4, 1)).toEqual([125, 157.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5]);
  });
  it("1+ reps → TM increments at the end of the week (lb)", () => {
    const lb: ProgramConfig = { ...cfg, unit: "lb", trainingMaxes: { squat: 300, bench: 200, deadlift: 400, ohp: 100 } };
    let s = initialState(def, lb);
    const one = (day: number, title: string, reps: number) => {
      const sets = planDay(def, lb, s, day).exercises[0].sets.map((x, i) => [x.weight, i === 2 ? reps : x.reps] as [number, number]);
      s = applyWorkout(def, lb, s, W(`d${day}`, "2026-01-05", [[title, sets]]), day);
    };
    one(0, "Bench Press (Barbell)", 8);
    one(1, "Squat (Barbell)", 3); // lower 2–3 → +5
    one(2, "Overhead Press (Barbell)", 6); // upper 6+ → +10
    one(3, "Deadlift (Barbell)", 5); // lower 4–5 → +10
    expect(s.tms).toMatchObject({ squat: 300, ohp: 100, deadlift: 400 });
    one(4, "Bench Press (Barbell)", 1); // 0–1 → none
    expect(s.tms).toMatchObject({ squat: 305, ohp: 110, deadlift: 410, bench: 200 });
  });
});
