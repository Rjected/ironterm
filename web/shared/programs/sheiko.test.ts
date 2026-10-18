// Sheiko templates: prescribed weights checked by hand against the ChaseT/LiftVault sheets.
import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { allSlots, applyWorkout, initialState, planDay, replay, type ProgramConfig, type ProgramDef, type ProgramState } from "../program";
import { toKg } from "../units";
import { parseSets, sheiko2932, sheiko37, sheikoAml, sheikoBeginner, SHEIKO_TEMPLATES } from "./sheiko";

const cfg = (templateId: string, options: Record<string, string> = {}): ProgramConfig => ({
  templateId, options, unit: "lb", startDate: "2026-01-01", startWeights: {},
  trainingMaxes: { squat: 300, bench: 200, deadlift: 400 },
});
/** [weight, reps] per set for a day's slot. */
const sets = (def: ProgramDef, c: ProgramConfig, s: ProgramState, dayId: string, slotId: string) => {
  const i = def.days.findIndex((d) => d.id === dayId);
  const ex = planDay(def, c, s, i).exercises.find((e) => e.slotId === slotId);
  return ex?.sets.map((x) => [x.weight, x.reps]);
};
const rep = (n: number, w: number, r: number) => Array.from({ length: n }, () => [w, r]);

/** A Hevy workout that does exactly what the plan says (skipping some slots if asked). */
function doPlan(def: ProgramDef, c: ProgramConfig, s: ProgramState, n: number, skip: string[] = []): HevyWorkout {
  const p = planDay(def, c, s);
  const date = new Date(Date.UTC(2026, 0, 2 + n * 2)).toISOString().slice(0, 10);
  return {
    id: `w${n}`, title: p.dayName, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:30:00Z`,
    exercises: p.exercises.filter((e) => !skip.includes(e.slotId)).map((e) => ({
      title: LIFTS[e.lift].hevy[0], exercise_template_id: LIFTS[e.lift].hevy[0],
      sets: e.sets.map((x) => ({ type: "normal" as const, weight_kg: toKg(x.weight, "lb"), reps: x.reps })),
    })),
  };
}

describe("all Sheiko templates build", () => {
  for (const t of SHEIKO_TEMPLATES) {
    it(`${t.id}: unique ids, finite, 1RM`, () => {
      const opts = Object.fromEntries(t.options.map((o) => [o.key, o.default]));
      const def = t.build(opts);
      const ids = allSlots(def).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(def.days.map((d) => d.id)).size).toBe(def.days.length);
      expect(def.cycle).toMatchObject({ finite: true, weeks: t.weeks });
      expect(def.maxLabel).toBe("1RM");
      expect(t.id.startsWith("sheiko-")).toBe(true);
      for (const s of allSlots(def)) expect(LIFTS[s.lift], s.lift).toBeDefined();
    });
  }
  it("parses set specs", () => {
    expect(parseSets("5@50 4@60x2")).toEqual([{ pct: 0.5, reps: 5 }, { pct: 0.6, reps: 4 }, { pct: 0.6, reps: 4 }]);
  });
  it("block options pick the right weeks", () => {
    expect(sheiko2932.build({ run: "32" }).cycle?.weeks).toBe(4);
    expect(sheiko2932.build({ run: "30-32" }).cycle?.weeks).toBe(12);
    expect(sheikoBeginner.build({ prep: "2", comp: "on" }).cycle?.weeks).toBe(12);
    expect(sheikoBeginner.build({ prep: "1", comp: "off" }).cycle?.weeks).toBe(4);
  });
});

describe("#29–#32 against the sheet (squat 300 / bench 200 / deadlift 400)", () => {
  const c = cfg("sheiko-29-32");
  const def = sheiko2932.build({ run: "all" });
  const s = initialState(def, c);

  it("#29 W1 Monday: bench, squat, bench again, flyes, good mornings", () => {
    const d = def.days[0];
    expect(d.id).toBe("S29W1D1");
    expect(d.slots.map((x) => x.id)).toEqual(["s29w1d1-bench", "s29w1d1-squat", "s29w1d1-bench2", "s29w1d1-chestFly", "s29w1d1-goodMorning"]);
    // 50%×5×1, 60%×4×2, 70%×3×2, 75%×3×5
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-bench")).toEqual([[100, 5], ...rep(2, 120, 4), ...rep(2, 140, 3), ...rep(5, 150, 3)]);
    // 50%×5×1, 60%×5×2, 70%×5×5
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-squat")).toEqual([[150, 5], ...rep(2, 180, 5), ...rep(5, 210, 5)]);
    // 50%×5×1, 60%×5×1, 70%×4×4
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-bench2")).toEqual([[100, 5], [120, 5], ...rep(4, 140, 4)]);
    expect(d.slots[3].progression).toEqual({ kind: "fixed", sets: 5, reps: 10 });
  });

  it("#29 W1 Wednesday: deadlift to knees and block pulls off the deadlift 1RM", () => {
    const d = def.days.find((x) => x.id === "S29W1D2")!;
    expect(d.slots[0]).toMatchObject({ lift: "deadlift", tier: "SUPP" });
    expect(sets(def, c, s, "S29W1D2", "s29w1d2-deadlift")).toEqual([[200, 3], ...rep(2, 240, 3), ...rep(2, 280, 3), ...rep(4, 300, 3)]);
    expect(sets(def, c, s, "S29W1D2", "s29w1d2-rackPull")).toEqual([[220, 4], [260, 4], ...rep(2, 300, 4), ...rep(4, 340, 3)]);
  });

  it("#30 W1 Wednesday bench pyramid tops out at 85%×1×2 and comes back down to 50%×12", () => {
    const w = sets(def, c, s, "S30W1D2", "s30w1d2-bench")!;
    expect(w.filter(([wt]) => wt === 170)).toEqual([[170, 1], [170, 1]]);
    expect(w[w.length - 1]).toEqual([100, 12]);
    expect(w).toHaveLength(19);
  });

  it("#31 W1 Monday squat: 70% wave of 2,4,6,8,7,5,3", () => {
    expect(sets(def, c, s, "S31W1D1", "s31w1d1-squat")!.slice(3)).toEqual([2, 4, 6, 8, 7, 5, 3].map((r) => [210, r]));
  });

  it("#32 W1 Wednesday max test ends with singles at 100%", () => {
    expect(sets(def, c, s, "S32W1D2", "s32w1d2-squat")!.slice(-3)).toEqual([[270, 1], [300, 1], [300, 1]]);
    expect(def.days.find((x) => x.id === "S32W1D2")!.slots[0].note).toMatch(/100–105%/);
  });

  it("weeks are named by block; front squat uses the squat 1RM", () => {
    expect(def.cycle?.weekNames?.[4]).toBe("#30 · Week 1");
    expect(sets(def, c, s, "S29W2D1", "s29w2d1-frontSquat")![0]).toEqual([135, 3]); // 45% of 300
  });
});

describe("#37, Beginner and AML against the sheets", () => {
  it("#37 W1 Friday: bench pyramid 50%×7 … 75%×2×2 … 50%×10", () => {
    const def = sheiko37.build({});
    const c = cfg("sheiko-37");
    const w = sets(def, c, initialState(def, c), "S37W1D3", "s37w1d3-bench")!;
    expect(w[0]).toEqual([100, 7]);
    expect(w.filter(([wt]) => wt === 150)).toEqual([[150, 2], [150, 2]]);
    expect(w[w.length - 1]).toEqual([100, 10]);
  });

  it("Beginner comp W1 Wednesday: squat singles up to 105%", () => {
    const def = sheikoBeginner.build({ prep: "1", comp: "on" });
    const c = cfg("sheiko-beginner");
    expect(sets(def, c, initialState(def, c), "BCW1D2", "bcw1d2-squat")!.slice(-4)).toEqual([[270, 1], [285, 1], [300, 1], [315, 1]]);
    expect(def.days[0].slots.map((x) => x.lift)).toEqual(["squat", "bench", "chestFly", "goodMorning"]);
  });

  it("AML Prep I W1 Monday: front squat at 30/40/50% of squat, then bench 75%×2×4", () => {
    const def = sheikoAml.build({});
    const c = cfg("sheiko-aml");
    const s = initialState(def, c);
    expect(def.days.filter((d) => d.weeks?.[0] === 0).map((d) => d.name)).toEqual(["Prep I W1 · Mon", "Prep I W1 · Wed", "Prep I W1 · Fri", "Prep I W1 · Sat"]);
    expect(sets(def, c, s, "A1W1D1", "a1w1d1-frontSquat")).toEqual([[90, 4], [120, 4], ...rep(3, 150, 4)]);
    expect(sets(def, c, s, "A1W1D1", "a1w1d1-bench")!.slice(-4)).toEqual(rep(4, 150, 2));
  });
});

describe("replaying Sheiko #32", () => {
  const def = sheiko2932.build({ run: "32" });
  const c = cfg("sheiko-29-32", { run: "32" });

  it("walks the sessions in order and completes after week 4", () => {
    let s = initialState(def, c);
    const ws: HevyWorkout[] = [];
    for (let n = 0; n < 11; n++) {
      const w = doPlan(def, c, s, n);
      ws.push(w);
      s = applyWorkout(def, c, s, w, s.dayIndex);
    }
    expect(s.complete).toBe(true);
    expect(s.log.map((l) => l.dayId)).toEqual(["S32W1D1", "S32W1D2", "S32W1D3", "S32W2D1", "S32W2D2", "S32W2D3", "S32W3D1", "S32W3D2", "S32W3D3", "S32W4D1", "S32W4D2"]);
    const r = replay(def, c, ws);
    expect(r.complete).toBe(true);
    expect(r.log.map((l) => l.dayId)).toEqual(s.log.map((l) => l.dayId));
    expect(r.tms).toEqual({ squat: 300, bench: 200, deadlift: 400 }); // Sheiko doesn't move maxes mid-block
  });

  it("matches a second bench block to the second bench slot, and flags it missed if skipped", () => {
    let s = initialState(def, c);
    for (let n = 0; n < 5; n++) s = applyWorkout(def, c, s, doPlan(def, c, s, n), s.dayIndex);
    expect(def.days[s.dayIndex].id).toBe("S32W2D3"); // bench, squat, bench, fly, GM
    const full = applyWorkout(def, c, s, doPlan(def, c, s, 5), s.dayIndex).log.at(-1)!.results;
    expect(full.find((x) => x.slotId === "s32w2d3-bench2")).toMatchObject({ outcome: "success", weight: 140, reps: [4, 4, 4, 4, 4, 4] });
    const skipped = applyWorkout(def, c, s, doPlan(def, c, s, 5, ["s32w2d3-bench2"]), s.dayIndex).log.at(-1)!.results;
    expect(skipped.find((x) => x.slotId === "s32w2d3-bench")?.outcome).toBe("success");
    expect(skipped.find((x) => x.slotId === "s32w2d3-bench2")?.outcome).toBe("missed");
  });
});
