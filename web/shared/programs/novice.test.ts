import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { allSlots, applyWorkout, initialState, matchDay, planDay, type ProgramConfig, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { NOVICE_TEMPLATES, allpro, billStarr, greyskull, icf55, madcow, redditBbr, startingStrength, stronglifts, texasMethod } from "./novice";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);

function setup(t: ProgramTemplate, options: Record<string, string> = {}, unit: "lb" | "kg" = "lb") {
  const d = t.defaults?.(unit) ?? {};
  const cfg: ProgramConfig = {
    templateId: t.id, unit, startDate: "2026-01-01",
    options: { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options },
    startWeights: d.startWeights ?? {}, trainingMaxes: d.trainingMaxes ?? {}, increments: d.increments ?? {},
  };
  const def = t.build(cfg.options);
  return { cfg, def, s: initialState(def, cfg) };
}
const weights = (x: { sets: { weight: number; reps: number }[] }) => x.sets.map((s) => [s.weight, s.reps]);

describe("novice templates", () => {
  it("every template and option builds, plans every day, and has defaults for every slot", () => {
    for (const t of NOVICE_TEMPLATES) {
      expect(t.category === "novice" || t.category === "strength").toBe(true);
      const variants = [{}, ...t.options.flatMap((o) => o.choices.map((c) => ({ [o.key]: c.value })))];
      for (const v of variants) {
        for (const unit of ["lb", "kg"] as const) {
          const { cfg, def, s } = setup(t, v, unit);
          for (const slot of allSlots(def)) {
            expect(LIFTS[slot.lift], `${t.id} ${slot.lift}`).toBeDefined();
            if (slot.progression.kind === "percent") expect(cfg.trainingMaxes[slot.progression.tmLift], `${t.id} TM ${slot.progression.tmLift}`).toBeGreaterThan(0);
            else if (slot.progression.kind !== "fixed") expect(cfg.startWeights[slot.id], `${t.id} start ${slot.id}`).toBeDefined();
          }
          def.days.forEach((_, i) => expect(planDay(def, cfg, s, i).dayId).toBe(def.days[i].id));
        }
      }
    }
  });
});

describe("StrongLifts 5×5", () => {
  it("squat progresses across A and B; deadlift +10; three misses deload 10%", () => {
    const { cfg, def } = setup(stronglifts);
    let s = initialState(def, cfg);
    expect(weights(planDay(def, cfg, s, 0).exercises[0])).toEqual(rep(5, 135, 5));
    s = applyWorkout(def, cfg, s, W("a", "2026-01-02", [["Squat (Barbell)", rep(5, 135, 5)], ["Bench Press (Barbell)", rep(5, 95, 5)], ["Bent Over Row (Barbell)", rep(5, 85, 5)]]), 0);
    expect(s.slots.sq.weight).toBe(140);
    expect(planDay(def, cfg, s, 1).exercises[0].sets[0].weight).toBe(140);
    const b = W("b", "2026-01-04", [["Squat (Barbell)", rep(5, 140, 5, 3)], ["Overhead Press (Barbell)", rep(5, 65, 5)], ["Deadlift (Barbell)", rep(1, 155, 5)]]);
    expect(matchDay(def, cfg, s, b)).toBe(1);
    s = applyWorkout(def, cfg, s, b, 1);
    expect(s.slots.dl.weight).toBe(165);
    expect(s.slots.sq).toMatchObject({ weight: 140, fails: 1 });
    s = applyWorkout(def, cfg, s, W("a2", "2026-01-06", [["Squat (Barbell)", rep(5, 140, 5, 3)]]), 0);
    expect(s.slots.sq.weight).toBe(140);
    s = applyWorkout(def, cfg, s, W("b2", "2026-01-08", [["Squat (Barbell)", rep(5, 140, 5, 3)]]), 1);
    expect(s.slots.sq.weight).toBe(125); // 140 × 0.9 = 126 → 125
  });
});

describe("Starting Strength", () => {
  it("phase 3 alternates deadlift and power clean with chin-ups on B", () => {
    const { cfg, def, s } = setup(startingStrength, { phase: "3" });
    expect(def.days.map((d) => d.slots.map((x) => x.lift))).toEqual([
      ["squat", "ohp", "deadlift"], ["squat", "bench", "chinUp"], ["squat", "ohp", "powerClean"], ["squat", "bench", "chinUp"],
    ]);
    expect(weights(planDay(def, cfg, s, 2).exercises[2])).toEqual(rep(5, 75, 3));
    const n = applyWorkout(def, cfg, s, W("a", "2026-01-02", [["Squat (Barbell)", rep(3, 135, 5)], ["Overhead Press (Barbell)", rep(3, 65, 5)], ["Deadlift (Barbell)", rep(1, 155, 5)]]), 0);
    expect(n.slots).toMatchObject({ sq: { weight: 140 }, press: { weight: 70 }, dl: { weight: 165 } });
  });
});

describe("GreySkull family", () => {
  it("10+ on the AMRAP doubles the jump; a miss resets 10%", () => {
    const { cfg, def } = setup(greyskull, { arms: "off" });
    let s = initialState(def, cfg);
    s = applyWorkout(def, cfg, s, W("a", "2026-01-02", [["Bench Press (Barbell)", rep(3, 95, 5, 12)]]), 0);
    expect(s.slots.bench.weight).toBe(100); // +2.5 × 2
    s = applyWorkout(def, cfg, s, W("a2", "2026-01-06", [["Bench Press (Barbell)", rep(3, 100, 5, 7)]]), 0);
    expect(s.slots.bench.weight).toBe(102.5);
    s = applyWorkout(def, cfg, s, W("a3", "2026-01-09", [["Bench Press (Barbell)", rep(3, 102.5, 5, 3)]]), 0);
    expect(s.slots.bench.weight).toBe(92.5); // 102.5 × 0.9 = 92.25 → 92.5 (microplates)
  });

  it("BBR: deadlift 1×5 gets +5, bodyweight chin-ups earn added weight", () => {
    const { cfg, def, s } = setup(redditBbr);
    expect(planDay(def, cfg, s, 1).exercises[2].scheme).toBe("1×5+");
    const n = applyWorkout(def, cfg, s, W("b", "2026-01-02", [["Chin Up", rep(3, 0, 5, 8)], ["Overhead Press (Barbell)", rep(3, 65, 5, 6)], ["Deadlift (Barbell)", rep(1, 155, 5)]]), 1);
    expect(n.slots).toMatchObject({ chin: { weight: 2.5 }, ohp: { weight: 67.5 }, dl: { weight: 160 } });
  });
});

describe("Ice Cream Fitness 5×5", () => {
  it("rows are one progression across both days; accessories add 5 lb", () => {
    const { cfg, def } = setup(icf55);
    let s = initialState(def, cfg);
    s = applyWorkout(def, cfg, s, W("a", "2026-01-02", [["Bent Over Row (Barbell)", rep(5, 85, 5)], ["Bicep Curl (Barbell)", rep(3, 45, 8)]]), 0);
    expect(planDay(def, cfg, s, 1).exercises.find((e) => e.slotId === "row")!.sets[0].weight).toBe(90);
    expect(s.slots.curl.weight).toBe(50);
  });
});

describe("Madcow 5×5", () => {
  it("ramps to the 5RM in week 4 with a +2.5% Friday triple, and completes after 12 weeks", () => {
    const { cfg, def } = setup(madcow);
    let s: ProgramState = initialState(def, cfg);
    // week 1: top = 245 × 1.025^-3 = 227.5 → 230
    expect(weights(planDay(def, cfg, s, 0).exercises[0])).toEqual([[115, 5], [140, 5], [170, 5], [200, 5], [230, 5]]);
    for (let i = 0; i < 9; i++) s = applyWorkout(def, cfg, s, W(`w${i}`, "2026-01-02", [["Squat (Barbell)", rep(5, 200, 5)]]), s.dayIndex);
    expect(s.rotations).toBe(3);
    expect(weights(planDay(def, cfg, s, 0).exercises[0])).toEqual([[125, 5], [155, 5], [185, 5], [215, 5], [245, 5]]);
    expect(weights(planDay(def, cfg, s, 1).exercises[0])).toEqual([[125, 5], [155, 5], [185, 5], [185, 5]]);
    expect(weights(planDay(def, cfg, s, 2).exercises[0])).toEqual([[125, 5], [155, 5], [185, 5], [215, 5], [250, 3], [185, 8]]);
    for (let i = 9; i < 36; i++) s = applyWorkout(def, cfg, s, W(`w${i}`, "2026-01-02", [["Squat (Barbell)", rep(5, 200, 5)]]), s.dayIndex);
    expect(s.complete).toBe(true);
  });
});

describe("Bill Starr 5×5", () => {
  it("heavy / light / medium ramps and weekly top-set increases", () => {
    const { cfg, def } = setup(billStarr);
    let s = initialState(def, cfg);
    expect(weights(planDay(def, cfg, s, 0).exercises[2])).toEqual([[115, 5], [140, 5], [170, 5], [195, 5], [225, 5]]);
    expect(planDay(def, cfg, s, 1).exercises[2].sets[4].weight).toBe(180);
    expect(planDay(def, cfg, s, 2).exercises[2].sets[4].weight).toBe(205); // 202.5 → 205
    for (let d = 0; d < 3; d++) s = applyWorkout(def, cfg, s, W(`d${d}`, "2026-01-02", [["Squat (Barbell)", rep(5, 200, 5)]]), d);
    expect(s.tms).toMatchObject({ squat: 235, bench: 170, powerClean: 140 });
  });
});

describe("Texas Method", () => {
  it("volume at 90%, light at 80% of Monday, Friday PR raises the target", () => {
    const { cfg, def } = setup(texasMethod);
    let s = initialState(def, cfg);
    expect(weights(planDay(def, cfg, s, 0).exercises[0])).toEqual(rep(5, 250, 5)); // 275 × .9 = 247.5 → 250
    const wed = planDay(def, cfg, s, 1).exercises;
    expect(weights(wed[0])).toEqual(rep(2, 200, 5)); // 275 × .72 = 198 → 200
    expect(wed[1].lift).toBe("ohp");
    expect(wed[1].sets[0].weight).toBe(110); // 135 × .81
    s = applyWorkout(def, cfg, s, W("fri", "2026-01-02", [["Squat (Barbell)", [[275, 5]]], ["Bench Press (Barbell)", [[205, 4]]], ["Power Clean", rep(5, 155, 3)]]), 2);
    expect(s.tms).toMatchObject({ squat: 280, bench: 205 });
    expect(s.slots.pc.weight).toBe(160);
    // next pass is press week
    expect(def.days[s.dayIndex].id).toBe("W2MON");
    expect(planDay(def, cfg, s).exercises.map((e) => e.lift)).toEqual(["squat", "ohp", "deadlift"]);
    expect(planDay(def, cfg, s).exercises[0].sets[0].weight).toBe(250); // 280 × .9 = 252 → 250
  });
});

describe("AllPro Simple Beginner", () => {
  it("reps climb 8→12 at 100/90/80%, and 12s on week 5 heavy day add 10%", () => {
    const { cfg, def } = setup(allpro);
    let s = initialState(def, cfg);
    expect(weights(planDay(def, cfg, s, 0).exercises[0])).toEqual(rep(2, 135, 8));
    expect(planDay(def, cfg, s, 2).exercises[0].sets[0].weight).toBe(120); // 121.5
    expect(planDay(def, cfg, s, 3).exercises[0].sets[0].weight).toBe(110); // 108
    for (let i = 0; i < 12; i++) s = applyWorkout(def, cfg, s, W(`w${i}`, "2026-01-02", [["Squat (Barbell)", rep(2, 135, 12)]]), s.dayIndex);
    expect(s.tms.squat).toBe(135); // no bumps in weeks 1–4
    expect(def.days[s.dayIndex].id).toBe("H5");
    expect(weights(planDay(def, cfg, s).exercises[0])).toEqual(rep(2, 135, 12));
    const fail = applyWorkout(def, cfg, s, W("h5f", "2026-01-30", [["Squat (Barbell)", [[135, 11], [135, 10]]]]), s.dayIndex);
    expect(fail.tms.squat).toBe(135);
    s = applyWorkout(def, cfg, s, W("h5", "2026-01-30", [["Squat (Barbell)", rep(2, 135, 12)]]), s.dayIndex);
    expect(s.tms.squat).toBe(148.5) // TM changes are exact; planned loads round; // +13.5 → 15
  });
});
