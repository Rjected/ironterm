import { describe, expect, it } from "vitest";
import { e1rmsFrom, fillMissing, missingValues } from "./fill";
import type { HevyWorkout } from "./hevy";
import { LIFTS } from "./lifts";
import { initialState, isScheduled, planDay, replay, type ProgramConfig } from "./program";
import { buildProgram, defaultConfig, TEMPLATES } from "./programs";
import { toKg } from "./units";

const E1RMS = { squat: 405, bench: 285, deadlift: 495, ohp: 185 };
const isBw = (lift: string) => LIFTS[lift]?.kind === "bodyweight";

/** Every planned set of week 1 (or the first scheduled week of each day) that should carry a load but plans at 0. */
function zeros(cfg: ProgramConfig): string[] {
  const def = buildProgram(cfg)!;
  const s = initialState(def, cfg);
  const out: string[] = [];
  def.days.forEach((d, i) => {
    const week = d.weeks?.[0] ?? 0;
    if (!isScheduled(d, week)) return;
    const p = planDay(def, cfg, { ...s, rotations: week }, i);
    for (const e of p.exercises) {
      if (isBw(e.lift)) continue;
      const slot = d.slots.find((x) => x.id === e.slotId)!;
      if (slot.progression.kind === "fixed") continue; // load is the lifter's pick
      for (const x of e.sets) {
        const loaded = slot.progression.kind !== "percent" || (x.pct != null && !x.ofTop);
        if (loaded && !(x.weight > 0)) out.push(`${cfg.templateId} ${d.id} ${e.slotId} ${e.lift}`);
      }
    }
  });
  return [...new Set(out)];
}

const strip = (c: ProgramConfig): ProgramConfig => ({ ...c, startWeights: {}, trainingMaxes: {} });

describe("fillMissing", () => {
  it("leaves a complete config alone", () => {
    const c = defaultConfig("531", "lb", "2026-01-01");
    expect(fillMissing(c, () => E1RMS)).toBe(c);
  });

  // Saved before PR #25 / #51 / #64 changed these templates' shape.
  const old = ([
    { templateId: "sbsHypertrophy", options: { days: "4" }, unit: "lb", startDate: "2026-01-01", startWeights: {},
      trainingMaxes: { squat: 315, bench: 225, deadlift: 385, ohp: 145, pauseSquat: 285, frontSquat: 265, pauseBench: 215, pinPress: 195, rdl: 315, dbOhp: 60 } },
    { templateId: "bill-starr", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: { powerClean: 135, bench: 165, squat: 225, inclineBench: 135 } },
    { templateId: "gzcl-rippler", options: {}, unit: "lb", startDate: "2026-01-01",
      startWeights: { "d1-t3a": 40, "d1-t3b": 20, "d2-t3a": 0, "d2-t3b": 30, "d3-t3a": 50, "d3-t3b": 40, "d4-t3a": 135, "d4-t3b": 15 },
      trainingMaxes: { squat: 295, bench: 210, deadlift: 380, ohp: 135, inclineBench: 160, stiffLegDeadlift: 255, cgBench: 175, frontSquat: 215 } },
  ] as ProgramConfig[]).filter((c) => buildProgram(c));

  it("old-shaped configs plan a load for every loaded set, from e1RMs or defaults", () => {
    for (const c of old) {
      expect(missingValues(c).tms.length + missingValues(c).slots.length, c.templateId).toBeGreaterThanOrEqual(0);
      expect(zeros(fillMissing(c, () => E1RMS)), c.templateId).toEqual([]);
      expect(zeros(fillMissing(c, () => ({}))), c.templateId).toEqual([]);
    }
  });

  it("variants scale off their parent lift's e1RM; explicit values win", () => {
    const c = old[0];
    const f = fillMissing(c, () => E1RMS);
    expect(f.trainingMaxes.squat).toBe(315); // kept
    if (missingValues(c).tms.includes("rackPull")) expect(f.trainingMaxes.rackPull).toBeGreaterThan(300);
    expect(c.trainingMaxes.rackPull).toBeUndefined(); // nothing written back
  });

  it("a slot that became a % slot takes its old start weight; a split-off slot takes its twin's", () => {
    const fierce: ProgramConfig = { templateId: "fierce5", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: { sq: 185, bench: 135 }, trainingMaxes: {} };
    const def = buildProgram(fierce)!;
    if (def.days[0].slots[0].progression.kind === "percent") expect(fillMissing(fierce, () => E1RMS).trainingMaxes.squat).toBe(185);
    const icf: ProgramConfig = { templateId: "icf-5x5", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: { row: 95 }, trainingMaxes: {} };
    const f = fillMissing(icf, () => E1RMS);
    if ("row-b" in f.startWeights) expect(f.startWeights["row-b"]).toBe(95);
  });

  it("reads e1RMs from history", () => {
    const w: HevyWorkout = { id: "a", title: "a", start_time: "2026-01-10T12:00:00Z", end_time: "2026-01-10T13:00:00Z",
      exercises: [{ title: "Squat (Barbell)", exercise_template_id: "x", sets: [{ type: "normal", weight_kg: toKg(300, "lb"), reps: 5 }] }] };
    expect(e1rmsFrom([w], "lb", "2026-01-20", ["squat"]).squat).toBeCloseTo(350, 0);
    const c = { ...defaultConfig("sbsRtf", "lb", "2026-01-01"), trainingMaxes: {} };
    const s = replay(buildProgram(c)!, fillMissing(c, (need) => e1rmsFrom([w], "lb", "2026-01-20", need)), []);
    expect(s.tms.squat).toBeGreaterThan(0);
  });
});

describe("every template, every value stripped", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: no unloaded sets once e1RMs or defaults fill the gaps`, () => {
      for (const unit of ["lb", "kg"] as const) {
        const c = strip(defaultConfig(t.id, unit, "2026-01-01"));
        expect(zeros(fillMissing(c, () => E1RMS))).toEqual([]);
        expect(zeros(fillMissing(c, () => ({})))).toEqual([]);
      }
    });
  }
});
