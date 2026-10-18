// Test helpers for program templates: build a template, log sessions exactly as planned, read
// planned weights. Only imported by *.test.ts files.

import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramDef, type ProgramState, type ProgramTemplate } from "../program";
import { toKg } from "../units";

export function setup(t: ProgramTemplate, tms: Record<string, number>, options: Record<string, string> = {}, startWeights: Record<string, number> = {}) {
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const def = t.build(opts);
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit: "lb", startDate: "2026-01-01", startWeights, trainingMaxes: tms, increments: {} };
  return { def, cfg };
}

/**
 * Log the next scheduled day as planned: every loaded set for its reps (AMRAPs for `amrapReps`
 * when given). One Hevy block per planned exercise, so two slots on one lift stay separate.
 */
export function doNext(def: ProgramDef, cfg: ProgramConfig, s: ProgramState, n: number, amrapReps?: number): ProgramState {
  const plan = planDay(def, cfg, s);
  const ex = plan.exercises.filter((e) => e.sets[0]?.weight > 0 && LIFTS[e.lift]?.hevy.length);
  const day = new Date(Date.parse("2026-02-01T12:00:00Z") + n * 2 * 864e5).toISOString();
  const w: HevyWorkout = {
    id: `w${n}`, title: "w", start_time: day, end_time: day,
    exercises: ex.map((e) => ({
      title: LIFTS[e.lift].hevy[0], exercise_template_id: "x",
      sets: e.sets.map((x) => ({ type: "normal" as const, weight_kg: toKg(x.weight, "lb"), reps: x.amrap && amrapReps != null ? amrapReps : x.repsMax ?? x.reps })),
    })),
  };
  return applyWorkout(def, cfg, s, w, s.dayIndex);
}

export const run = (def: ProgramDef, cfg: ProgramConfig, sessions: number, s = initialState(def, cfg), amrapReps?: number) => {
  for (let i = 0; i < sessions; i++) s = doNext(def, cfg, s, s.log.length + i, amrapReps);
  return s;
};

/** Planned weights of one slot on a day. */
export const ws = (def: ProgramDef, cfg: ProgramConfig, s: ProgramState, day: number, slotId: string) =>
  planDay(def, cfg, s, day).exercises.find((e) => e.slotId === slotId)?.sets.map((x) => x.weight);

/** Planned reps of one slot on a day ("5+" for AMRAPs, "8–12" for ranges). */
export const reps = (def: ProgramDef, cfg: ProgramConfig, s: ProgramState, day: number, slotId: string) =>
  planDay(def, cfg, s, day).exercises.find((e) => e.slotId === slotId)?.sets.map((x) => `${x.reps}${x.repsMax ? "–" + x.repsMax : ""}${x.amrap ? "+" : ""}`);
