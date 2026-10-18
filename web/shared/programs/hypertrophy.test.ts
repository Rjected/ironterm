import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { allSlots, applyWorkout, initialState, planDay, type ProgramConfig, type ProgramTemplate } from "../program";
import { toKg } from "../units";
import { HYPERTROPHY_TEMPLATES, NEW_LIFTS, canditoLinear, ivysaur448, lyleGbr, phat, phul, redditPpl } from "./hypertrophy";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number, last = reps) => Array.from({ length: n }, (_, i) => [lb, i === n - 1 ? last : reps] as [number, number]);
const SQ = "Squat (Barbell)", BP = "Bench Press (Barbell)", DL = "Deadlift (Barbell)", OHP = "Overhead Press (Barbell)", ROW = "Bent Over Row (Barbell)";

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
const ex = (plan: ReturnType<typeof planDay>, slotId: string) => plan.exercises.find((e) => e.slotId === slotId)!;

describe("hypertrophy templates", () => {
  it("every template and option builds, plans every day, and has defaults for every slot", () => {
    for (const t of HYPERTROPHY_TEMPLATES) {
      expect(t.category === "hypertrophy" || t.category === "strength" || t.category === "novice").toBe(true);
      const variants = [{}, ...t.options.flatMap((o) => o.choices.map((c) => ({ [o.key]: c.value })))];
      for (const v of variants) {
        for (const unit of ["lb", "kg"] as const) {
          const { cfg, def, s } = setup(t, v, unit);
          for (const slot of allSlots(def)) {
            expect(LIFTS[slot.lift] || NEW_LIFTS.includes(slot.lift), `${t.id} ${slot.lift}`).toBeTruthy();
            if (slot.progression.kind === "percent") expect(cfg.trainingMaxes[slot.progression.tmLift], `${t.id} TM ${slot.progression.tmLift}`).toBeGreaterThan(0);
            else expect(cfg.startWeights[slot.id], `${t.id} start ${slot.id}`).toBeDefined();
          }
          def.days.forEach((_, i) => expect(planDay(def, cfg, s, i).exercises.length).toBeGreaterThan(0));
        }
      }
    }
  });
});

describe("Reddit PPL", () => {
  it("main lifts as published: bench 4×5,1×5+, squat 2×5,1×5+, deadlift 1×5+", () => {
    const { cfg, def, s } = setup(redditPpl);
    expect(def.days.map((d) => d.id)).toEqual(["PULL1", "PUSH1", "LEGS1", "PULL2", "PUSH2", "LEGS2"]);
    expect(ex(planDay(def, cfg, s, 0), "pull-dl").scheme).toBe("1×5+");
    expect(ex(planDay(def, cfg, s, 1), "push-bench").scheme).toBe("5×5+");
    expect(ex(planDay(def, cfg, s, 2), "legs-sq").scheme).toBe("3×5+");
    expect(ex(planDay(def, cfg, s, 0), "pull-fp").scheme).toBe("5×15–20");
  });

  it("squat is one progression across both leg days; deadlift 1×8 → +10", () => {
    const { cfg, def } = setup(redditPpl);
    let s = initialState(def, cfg);
    s = applyWorkout(def, cfg, s, W("dl", "2026-01-02", [[DL, [[275, 8]]]]), 0);
    expect(s.slots["pull-dl"].weight).toBe(285);
    s = applyWorkout(def, cfg, s, W("legs", "2026-01-04", [[SQ, rep(3, 225, 5, 7)]]), 2);
    expect(s.slots["legs-sq"].weight).toBe(230);
    expect(ex(planDay(def, cfg, s, 5), "legs-sq").sets[0].weight).toBe(230);
  });

  it("three misses in a row on bench → 10% deload", () => {
    const { cfg, def } = setup(redditPpl);
    let s = initialState(def, cfg);
    const miss = W("m", "2026-01-03", [[BP, rep(5, 165, 5, 3)]]);
    s = applyWorkout(def, cfg, s, miss, 1);
    s = applyWorkout(def, cfg, s, miss, 1);
    expect(s.slots["push-bench"]).toMatchObject({ weight: 165, fails: 2 });
    s = applyWorkout(def, cfg, s, miss, 1);
    expect(s.slots["push-bench"].weight).toBe(150); // 148.5 → 150
  });
});

describe("PHUL", () => {
  it("power bench 3×3–5, double progression", () => {
    const { cfg, def } = setup(phul);
    let s = initialState(def, cfg);
    const b = ex(planDay(def, cfg, s, 0), "up-bench");
    expect(b.scheme).toBe("3×3–5");
    expect(b.sets[0].weight).toBe(190);
    s = applyWorkout(def, cfg, s, W("a", "2026-01-02", [[BP, rep(3, 190, 5, 4)]]), 0);
    expect(s.slots["up-bench"].weight).toBe(190);
    s = applyWorkout(def, cfg, s, W("b", "2026-01-09", [[BP, rep(3, 190, 5)]]), 0);
    expect(s.slots["up-bench"].weight).toBe(195);
  });
});

describe("PHAT", () => {
  it("speed squats are 6×3 at 70% of the power-day weight, and follow it up", () => {
    const { cfg, def } = setup(phat);
    let s = initialState(def, cfg);
    expect(cfg.trainingMaxes.squat).toBe(285);
    const speed = ex(planDay(def, cfg, s, 3), "lh-sq");
    expect(speed.sets).toHaveLength(6);
    expect(speed.sets[0]).toMatchObject({ weight: 200, reps: 3 }); // 285 × .7 = 199.5
    expect(ex(planDay(def, cfg, s, 4), "ca-dbb-speed").sets[0].weight).toBe(55); // 80 × .7 = 56 → 55 (5 lb DBs)
    // 5,5,4 → not every set hit 5: hold
    s = applyWorkout(def, cfg, s, W("p1", "2026-01-06", [[SQ, [[285, 5], [285, 5], [285, 4]]]]), 1);
    expect(s.tms.squat).toBe(285);
    s = applyWorkout(def, cfg, s, W("p2", "2026-01-13", [[SQ, rep(3, 285, 5)]]), 1);
    expect(s.tms.squat).toBe(295);
    expect(ex(planDay(def, cfg, s, 3), "lh-sq").sets[0].weight).toBe(205); // 206.5
  });
});

describe("Lyle GBR", () => {
  it("volume option and repeat option", () => {
    const low = setup(lyleGbr);
    expect(ex(planDay(low.def, low.cfg, low.s, 0), "l1-sq").scheme).toBe("3×6–8");
    expect(ex(planDay(low.def, low.cfg, low.s, 1), "u1-tri").scheme).toBe("1×12–15");
    const high = setup(lyleGbr, { volume: "high" });
    expect(ex(planDay(high.def, high.cfg, high.s, 0), "l1-sq").scheme).toBe("4×6–8");
    expect(high.def.days[2].slots[0].lift).toBe("deadlift");
    const r = setup(lyleGbr, { days: "repeat" });
    expect(r.def.days[2].slots[0].id).toBe("l1-sq");
  });
});

describe("Ivysaur 4-4-8", () => {
  it("4×4 at the 4-rep weight, 4×8 at 90%", () => {
    const { cfg, def, s } = setup(ivysaur448);
    const d1 = planDay(def, cfg, s, 0);
    expect(ex(d1, "a1-bench").sets).toEqual(Array(4).fill(expect.objectContaining({ weight: 205, reps: 4 })));
    expect(ex(d1, "a1-sq").sets[0]).toMatchObject({ weight: 250, reps: 8 }); // 275 × .9 = 247.5
    expect(ex(planDay(def, cfg, s, 2), "a3-sq").scheme).toBe("4×4+");
  });

  // r/Fitness post: "Squat/Deadlift 15lb/week, Bench/Rows 10lb/week, Overhead Press 5lb/week";
  // "If you hit 8+ reps on an AMRAP set, double next week's progression rate"; deload 10% after failure.
  it("weekly jumps, 8+ on an AMRAP doubles the next jump, a failed set → −10%", () => {
    const { cfg, def } = setup(ivysaur448);
    let s = initialState(def, cfg);
    const run = (date: string, e: [string, [number, number][]][]) => { s = applyWorkout(def, cfg, s, W(date, date, e), s.dayIndex); };
    run("2026-01-05", [[BP, rep(4, 205, 4)], [SQ, rep(4, 250, 8)], [OHP, rep(4, 120, 8)]]);
    run("2026-01-07", [[BP, rep(4, 185, 8)], [DL, rep(4, 335, 4)], [OHP, rep(4, 135, 4)], [ROW, rep(4, 160, 8)]]);
    run("2026-01-09", [[BP, rep(4, 205, 4, 8)], [SQ, rep(4, 275, 4, 5)], [OHP, rep(4, 120, 8)]]);
    expect(s.tms).toMatchObject({ bench: 225, squat: 290, deadlift: 350, ohp: 140, row: 185 }); // bench +10 +10 (8 reps)
    expect(planDay(def, cfg, s).weekName).toBe("Week B");
    run("2026-01-12", [[BP, rep(4, 205, 8)], [DL, rep(4, 315, 8)], [OHP, rep(4, 140, 4, 3)], [ROW, rep(4, 185, 4)]]);
    expect(s.tms.ohp).toBe(126); // missed a rep → −10% straight away
    run("2026-01-14", [[BP, rep(4, 225, 4)], [SQ, rep(4, 260, 8)], [OHP, rep(4, 115, 8)]]);
    run("2026-01-16", [[BP, rep(4, 205, 8)], [DL, rep(4, 350, 4, 3)], [OHP, rep(4, 125, 4, 4)], [ROW, rep(4, 165, 8)]]);
    expect(s.tms.deadlift).toBe(330); // AMRAP 3 → −35, then the weekly +15
    expect(s.tms.ohp).toBe(131);
    expect(s.tms.row).toBe(195);
  });
});

describe("Candito Linear", () => {
  it("heavy day 3×6 adds 5 lb a week; a miss drops ~15 lb", () => {
    const { cfg, def } = setup(canditoLinear);
    let s = initialState(def, cfg);
    expect(ex(planDay(def, cfg, s, 0), "hl-sq")).toMatchObject({ scheme: "3×6" });
    expect(ex(planDay(def, cfg, s, 0), "hl-dl").scheme).toBe("2×6");
    expect(ex(planDay(def, cfg, s, 2), "cl-psq").scheme).toBe("6×4");
    s = applyWorkout(def, cfg, s, W("a", "2026-01-05", [[SQ, rep(3, 245, 6)], [DL, rep(2, 295, 6)]]), 0);
    expect(s.slots["hl-sq"].weight).toBe(250);
    expect(s.slots["hl-dl"].weight).toBe(300);
    s = applyWorkout(def, cfg, s, W("b", "2026-01-12", [[SQ, rep(3, 250, 6, 4)]]), 0);
    expect(s.slots["hl-sq"].weight).toBe(235); // 250 × .94 = 235
  });

  it("hypertrophy variant swaps the Thu/Fri days", () => {
    const { def } = setup(canditoLinear, { variant: "hypertrophy" });
    expect(def.days.map((d) => d.id)).toEqual(["HL", "HU", "YL", "YU"]);
  });
});

describe("Candito Linear hypertrophy days (Candito's PDF)", () => {
  it("Thu squat 5×8, DL variation 3×8, ham curl 3×12, calves 5×15, 2 optional 4×8–12; Fri 4×8 presses and rows, 3×10 shoulder and biceps", () => {
    const def = canditoLinear.build({ variant: "hypertrophy" });
    const scheme = (id: string) => def.days.find((d) => d.id === id)!.slots.map((s) => {
      const p = s.progression;
      return `${s.lift} ${p.kind === "stages" ? `${p.stages[0].sets}×${p.stages[0].reps}` : p.kind === "double" ? `${p.sets}×${p.reps[0]}` : ""}`;
    });
    expect(scheme("YL")).toEqual(["squat 5×8", "stiffLegDeadlift 3×8", "legCurl 3×12", "calfRaise 5×15", "legPress 4×8", "backExtension 4×8"]);
    expect(scheme("YU")).toEqual(["dbBench 4×8", "dbInclineBench 4×8", "row 4×8", "latPulldown 4×8", "dbOhp 3×10", "bicepCurl 3×10", "lateralRaise 4×8", "tricepPushdown 4×8"]);
    expect(canditoLinear.build({}).days.find((d) => d.id === "HU")!.slots.filter((s) => s.note === "optional")).toHaveLength(2);
  });
});
