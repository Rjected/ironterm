// Shapes returned by the Hevy public API (api.hevyapp.com/v1). The official docs drift from
// reality, so every field we don't strictly need is optional and parsing stays lenient.

export type SetType = "warmup" | "normal" | "failure" | "dropset";

export interface HevySet {
  index?: number;
  type: SetType;
  weight_kg: number | null;
  reps: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
}

export interface HevyExercise {
  index?: number;
  title: string;
  exercise_template_id: string;
  notes?: string | null;
  superset_id?: number | null;
  sets: HevySet[];
}

export interface HevyWorkout {
  id: string;
  title: string;
  routine_id?: string | null;
  description?: string | null;
  start_time: string;
  end_time: string;
  updated_at?: string;
  created_at?: string;
  exercises: HevyExercise[];
}

export interface HevyExerciseTemplate {
  id: string;
  title: string;
  type?: string;
  primary_muscle_group?: string;
  secondary_muscle_groups?: string[];
  equipment?: string;
  is_custom?: boolean;
}

export interface HevyRoutineSet {
  type: SetType;
  weight_kg: number | null;
  reps: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
}

export interface HevyRoutineExercise {
  exercise_template_id: string;
  superset_id: number | null;
  rest_seconds: number | null;
  notes: string | null;
  sets: HevyRoutineSet[];
}
