import type { HevyExerciseTemplate, HevyRoutineExercise, HevyWorkout } from "../shared/hevy";

const BASE = "https://api.hevyapp.com/v1";

export class HevyError extends Error {
  constructor(public status: number, public body: string, path: string) {
    super(`Hevy ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

/** Thin client for the endpoints we use. Bodies are logged on error since the docs are unreliable. */
export class Hevy {
  constructor(private key: string) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { "api-key": this.key, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });
    const text = await res.text();
    if (!res.ok) throw new HevyError(res.status, text, path);
    return (text ? JSON.parse(text) : {}) as T;
  }

  workouts(page: number, pageSize = 10) {
    return this.req<{ page: number; page_count: number; workouts: HevyWorkout[] }>(`/workouts?page=${page}&pageSize=${pageSize}`);
  }

  workout(id: string) {
    // Some responses wrap the workout, some don't.
    return this.req<HevyWorkout | { workout: HevyWorkout }>(`/workouts/${id}`).then((r) => ("workout" in r ? r.workout : r));
  }

  events(since: string, page: number, pageSize = 10) {
    return this.req<{ page: number; page_count: number; events: ({ type: "updated"; workout: HevyWorkout } | { type: "deleted"; id: string; deleted_at?: string })[] }>(
      `/workouts/events?page=${page}&pageSize=${pageSize}&since=${encodeURIComponent(since)}`,
    );
  }

  templates(page: number, pageSize = 100) {
    return this.req<{ page: number; page_count: number; exercise_templates: HevyExerciseTemplate[] }>(`/exercise_templates?page=${page}&pageSize=${pageSize}`);
  }

  /** Create a finished workout. Returns the stored workout (shape varies, so we unwrap). */
  createWorkout(body: unknown) {
    return this.req<any>(`/workouts`, { method: "POST", body: JSON.stringify(body) }).then((r) => {
      const w = r?.workout ?? r;
      return (Array.isArray(w) ? w[0] : w) as HevyWorkout;
    });
  }

  /** PUT /v1/workouts/{id}: replaces the whole workout (send every exercise and set). */
  updateWorkout(id: string, body: unknown) {
    return this.req<any>(`/workouts/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => {
      const w = r?.workout ?? r;
      return (Array.isArray(w) ? w[0] : w) as HevyWorkout | undefined;
    });
  }

  /** Undocumented but live: GET /v1/body_measurements (weight log). */
  bodyMeasurements(page: number, pageSize = 10) {
    return this.req<{ page: number; page_count: number; body_measurements: { date: string; weight_kg: number | null }[] }>(`/body_measurements?page=${page}&pageSize=${pageSize}`);
  }

  createFolder(title: string) {
    return this.req<{ routine_folder: { id: number; title: string } } | { id: number }>(`/routine_folders`, { method: "POST", body: JSON.stringify({ routine_folder: { title } }) }).then((r) =>
      "routine_folder" in r ? r.routine_folder.id : r.id,
    );
  }

  createRoutine(r: { title: string; folder_id: number | null; notes: string; exercises: HevyRoutineExercise[] }) {
    return this.req<any>(`/routines`, { method: "POST", body: JSON.stringify({ routine: r }) }).then(routineId);
  }

  updateRoutine(id: string, r: { title: string; notes: string; exercises: HevyRoutineExercise[] }) {
    return this.req<any>(`/routines/${id}`, { method: "PUT", body: JSON.stringify({ routine: r }) }).then((x) => routineId(x) ?? id);
  }
}

// POST /routines has been seen returning {routine: [...]}, {routine: {...}} and bare objects.
function routineId(r: any): string {
  const x = r?.routine ?? r;
  return Array.isArray(x) ? x[0]?.id : x?.id;
}
