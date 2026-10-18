// Live gym session: what you're doing right now, logged set by set in the app, then written to
// Hevy as a normal workout when you finish. Pure helpers shared by the UI and the Worker.

import type { HevySet, SetType } from "./hevy";
import { LIFTS } from "./lifts";
import type { PlannedSession, Tier } from "./program";
import { loadStep, roundTo, toKg, type Unit } from "./units";
import { exerciseNote } from "./notes";

export interface LiveTarget {
  weight: number;
  reps: number;
  repsMax?: number;
  amrap: boolean;
  rpe?: number;
  /** % of today's top set (back-offs) */
  ofTop?: number;
}

export interface LiveSet {
  type: SetType;
  /** in the session's unit; null = bodyweight / not entered */
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  done: boolean;
  doneAt?: string;
  target?: LiveTarget;
}

export interface LiveExercise {
  id: string;
  lift: string;
  /** Hevy title for exercises outside the lift library */
  title?: string;
  templateId?: string;
  slotId?: string;
  tier?: Tier;
  scheme?: string;
  /** program note, e.g. "Retest 5RM" */
  note?: string;
  /** your own note for this exercise; saved to Hevy as the exercise note */
  userNote?: string;
  ifSuccess?: string;
  ifFail?: string;
  restSeconds: number;
  cardio?: boolean;
  sets: LiveSet[];
}

export interface LiveSession {
  id: string;
  startedAt: string;
  unit: Unit;
  programName?: string;
  dayId?: string;
  dayName?: string;
  title: string;
  exercises: LiveExercise[];
  /** rest timer end (ISO) */
  restEndsAt?: string | null;
  restFor?: string | null;
  notes?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Warmup ramp for a heavy barbell top set: bar, then ~40/60/80%. */
export function warmups(top: number, unit: Unit): LiveSet[] {
  const bar = unit === "lb" ? 45 : 20;
  if (top <= bar * 1.5) return [];
  const step = unit === "lb" ? 5 : 2.5;
  const out: LiveSet[] = [{ type: "warmup", weight: bar, reps: 10, done: false }];
  for (const [f, r] of [[0.4, 5], [0.6, 3], [0.8, 2]] as const) {
    const w = roundTo(top * f, step);
    if (w > bar && w < top) out.push({ type: "warmup", weight: w, reps: r, done: false });
  }
  return out;
}

/** Start a session from the program's planned day. */
export function sessionFromPlan(plan: PlannedSession, unit: Unit, programName: string, now = new Date().toISOString()): LiveSession {
  const exercises: LiveExercise[] = plan.exercises.map((ex) => {
    const lift = LIFTS[ex.lift];
    const top = Math.max(0, ...ex.sets.map((s) => s.weight));
    const heavy = (ex.tier === "T1" || ex.tier === "MAIN") && (lift?.kind ?? "barbell") === "barbell";
    const work: LiveSet[] = ex.sets.map((s) => ({
      type: s.amrap ? "failure" : "normal",
      weight: s.weight || null,
      reps: s.reps,
      rpe: null,
      done: false,
      target: { weight: s.weight, reps: s.reps, repsMax: s.repsMax, amrap: s.amrap, rpe: s.rpe, ofTop: s.ofTop ? s.pct : undefined },
    }));
    return {
      id: uid(), lift: ex.lift, slotId: ex.slotId, tier: ex.tier, scheme: ex.scheme, note: ex.note,
      ifSuccess: ex.ifSuccess, ifFail: ex.ifFail, restSeconds: ex.restSeconds,
      sets: [...(heavy && top ? warmups(top, unit) : []), ...work],
    };
  });
  return {
    id: uid(), startedAt: now, unit, programName, dayId: plan.dayId, dayName: plan.dayName,
    title: `${programName.split(" ")[0]} · ${plan.dayId}`, exercises, restEndsAt: null,
  };
}

export function emptySession(unit: Unit, now = new Date().toISOString()): LiveSession {
  const h = new Date(now).getHours();
  const part = h < 11 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return { id: uid(), startedAt: now, unit, title: `${part} workout`, exercises: [], restEndsAt: null };
}

export function addExercise(s: LiveSession, lift: string, opts: { cardio?: boolean; title?: string; templateId?: string } = {}): LiveSession {
  const ex: LiveExercise = {
    id: uid(), lift, title: opts.title, templateId: opts.templateId, restSeconds: opts.cardio ? 0 : 90, cardio: opts.cardio,
    sets: [opts.cardio ? { type: "normal", weight: null, reps: null, durationSec: 1800, distanceM: null, done: false } : { type: "normal", weight: null, reps: 8, done: false }],
  };
  return { ...s, exercises: [...s.exercises, ex] };
}

/** Copy the last set (weight/reps) as a new undone set. */
export function addSet(s: LiveSession, exId: string): LiveSession {
  return mapEx(s, exId, (ex) => {
    const last = ex.sets[ex.sets.length - 1];
    const next: LiveSet = last ? { ...last, type: last.type === "warmup" ? "normal" : last.type, done: false, doneAt: undefined, target: undefined } : { type: "normal", weight: null, reps: 5, done: false };
    return { ...ex, sets: [...ex.sets, next] };
  });
}

export function mapEx(s: LiveSession, exId: string, f: (ex: LiveExercise) => LiveExercise): LiveSession {
  return { ...s, exercises: s.exercises.map((e) => (e.id === exId ? f(e) : e)) };
}

export function updateSet(s: LiveSession, exId: string, i: number, patch: Partial<LiveSet>): LiveSession {
  return mapEx(s, exId, (ex) => ({ ...ex, sets: ex.sets.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
}

/** Mark a set done and start the rest timer. Back-off sets keyed to today's top set get their load filled in. */
export function completeSet(s: LiveSession, exId: string, i: number, now = new Date()): LiveSession {
  let next = updateSet(s, exId, i, { done: true, doneAt: now.toISOString() });
  const ex = next.exercises.find((e) => e.id === exId)!;
  const set = ex.sets[i];
  // A finished top set sets the load for "% of top" back-offs.
  if (set.weight && set.reps && ex.sets.some((x) => x.target?.ofTop && !x.done && !x.weight)) {
    const e1 = set.reps <= 1 ? set.weight : set.weight * (1 + set.reps / 30);
    const step = loadStep(LIFTS[ex.lift]?.kind ?? "barbell", s.unit);
    next = mapEx(next, exId, (e) => ({ ...e, sets: e.sets.map((x) => (x.target?.ofTop && !x.done && !x.weight ? { ...x, weight: roundTo(e1 * x.target.ofTop, step) } : x)) }));
  }
  const rest = set.type === "warmup" ? Math.min(60, ex.restSeconds) : ex.restSeconds;
  const more = next.exercises.find((e) => e.id === exId)!.sets.some((x) => !x.done);
  return { ...next, restEndsAt: rest && (more || hasNextExercise(next, exId)) ? new Date(now.getTime() + rest * 1000).toISOString() : null, restFor: exId };
}

function hasNextExercise(s: LiveSession, exId: string) {
  const i = s.exercises.findIndex((e) => e.id === exId);
  return s.exercises.slice(i + 1).some((e) => e.sets.some((x) => !x.done));
}

/** The exercise and set to do next. */
export function current(s: LiveSession): { exId: string; set: number } | null {
  for (const e of s.exercises) {
    const k = e.sets.findIndex((x) => !x.done);
    if (k >= 0) return { exId: e.id, set: k };
  }
  return null;
}

export function progress(s: LiveSession) {
  const all = s.exercises.flatMap((e) => e.sets.filter((x) => x.type !== "warmup"));
  const done = all.filter((x) => x.done).length;
  return { done, total: all.length };
}

/** Hevy POST /v1/workouts body. Only completed sets are sent. */
export function toHevyWorkout(s: LiveSession, templateFor: (ex: LiveExercise) => string, end = new Date().toISOString()) {
  const kg = (w: number | null) => (w == null ? null : Math.round(toKg(w, s.unit) * 100) / 100);
  const exercises = s.exercises
    .map((ex) => ({ ex, sets: ex.sets.filter((x) => x.done) }))
    .filter((x) => x.sets.length)
    .map(({ ex, sets }) => ({
      exercise_template_id: templateFor(ex),
      superset_id: null,
      notes: exerciseNote(ex.userNote, ex.tier, ex.scheme),
      sets: sets.map((x): HevySet & { custom_metric: null } => ({
        type: x.type,
        weight_kg: ex.cardio ? null : kg(x.weight),
        reps: ex.cardio ? null : x.reps,
        distance_meters: x.distanceM ?? null,
        duration_seconds: x.durationSec ?? null,
        rpe: x.rpe ?? null,
        custom_metric: null,
      })),
    }));
  return {
    workout: {
      title: s.title,
      // Tag so replay knows which program day this was, even if lifts are ambiguous.
      description: [s.notes, s.dayId ? `[ht:${s.dayId}]` : ""].filter(Boolean).join("\n"),
      start_time: s.startedAt,
      end_time: end,
      is_private: false,
      exercises,
    },
  };
}

export const DAY_TAG = /\[ht:([^\]]+)\]/;
