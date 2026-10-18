// Workout + exercise notes, and how they travel to Hevy.
//
// The workout description carries a hidden program-day tag ("[ht:A1]") the engine reads, so user
// text and the tag are split for editing and joined back on save. Editing a past workout goes
// through Hevy's PUT /v1/workouts/{id}, which replaces the whole workout: the body is rebuilt
// from a fresh GET of that workout so nothing but the notes changes.

import type { HevyWorkout } from "./hevy";

const TAG = /\s*\[ht:[^\]]+\]\s*/;

export function splitDescription(desc: string | null | undefined): { text: string; tag: string } {
  const d = desc ?? "";
  const m = d.match(/\[ht:[^\]]+\]/);
  return { text: d.replace(TAG, "\n").trim(), tag: m?.[0] ?? "" };
}

export const joinDescription = (text: string, tag: string) => [text.trim(), tag].filter(Boolean).join("\n");

export interface NotesEdit {
  /** workout note (user text only; the day tag is kept automatically) */
  description: string;
  /** one per exercise, same order as the workout's exercises */
  exercises: (string | null)[];
}

const MAX = 2000;
const clean = (s: string | null | undefined) => {
  const t = (s ?? "").slice(0, MAX).trim();
  return t ? t : null;
};

/** A copy of the workout with new notes. */
export function applyNotes(w: HevyWorkout, edit: NotesEdit): HevyWorkout {
  if (edit.exercises.length !== w.exercises.length) throw new Error("exercise count changed; reload and try again");
  return {
    ...w,
    description: joinDescription(clean(edit.description) ?? "", splitDescription(w.description).tag) || null,
    exercises: w.exercises.map((e, i) => ({ ...e, notes: clean(edit.exercises[i]) })),
  };
}

/** Hevy PUT /v1/workouts/{id} body for a workout, faithful to every set. */
export function toHevyUpdate(w: HevyWorkout) {
  const n = (x: number | null | undefined) => (x == null ? null : x);
  return {
    workout: {
      title: w.title,
      description: w.description ?? "",
      start_time: w.start_time,
      end_time: w.end_time,
      ...("is_private" in w ? { is_private: (w as HevyWorkout & { is_private?: boolean }).is_private } : {}),
      exercises: w.exercises.map((e) => ({
        exercise_template_id: e.exercise_template_id,
        superset_id: e.superset_id ?? null,
        notes: e.notes ?? null,
        sets: e.sets.map((s) => ({
          type: s.type,
          weight_kg: n(s.weight_kg),
          reps: n(s.reps),
          distance_meters: n(s.distance_meters),
          duration_seconds: n(s.duration_seconds),
          rpe: n(s.rpe),
          custom_metric: n((s as { custom_metric?: number | null }).custom_metric),
        })),
      })),
    },
  };
}

/** Exercise note for a logged exercise: your note, then the program scheme ("T1 5×3+"). */
export const exerciseNote = (user: string | undefined, tier: string | undefined, scheme: string | undefined) =>
  [user?.trim(), scheme ? `${tier ?? ""} ${scheme}`.trim() : ""].filter(Boolean).join(" · ") || null;
