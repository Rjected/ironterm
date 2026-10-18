import type { HevyWorkout } from "../shared/hevy";

// Per database (a process normally has one; tests run several servers side by side).
const schemaReady = new WeakMap<object, Promise<unknown>>();

/** Same SQL as migrations/0001_init.sql, so a fresh local D1 works without a migrate step. */
export function ensureSchema(db: D1Database) {
  let p = schemaReady.get(db);
  if (!p) schemaReady.set(db, (p = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS workouts (id TEXT PRIMARY KEY, start_time TEXT NOT NULL, updated_at TEXT, json TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS workouts_start ON workouts(start_time)"),
    db.prepare("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))"),
  ])));
  return p;
}

export async function kvGet<T>(db: D1Database, key: string): Promise<T | null> {
  const r = await db.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first<{ value: string }>();
  return r ? (JSON.parse(r.value) as T) : null;
}

export async function kvPut(db: D1Database, key: string, value: unknown) {
  if (value === null) return db.prepare("DELETE FROM kv WHERE key = ?").bind(key).run();
  return db
    .prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value))
    .run();
}

export async function upsertWorkouts(db: D1Database, ws: HevyWorkout[]) {
  if (!ws.length) return;
  await db.batch(
    ws.map((w) =>
      db
        .prepare("INSERT INTO workouts (id, start_time, updated_at, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET start_time = excluded.start_time, updated_at = excluded.updated_at, json = excluded.json")
        .bind(w.id, w.start_time, w.updated_at ?? null, JSON.stringify(w)),
    ),
  );
}

export async function deleteWorkouts(db: D1Database, ids: string[]) {
  if (!ids.length) return;
  await db.batch(ids.map((id) => db.prepare("DELETE FROM workouts WHERE id = ?").bind(id)));
}

export async function allWorkouts(db: D1Database): Promise<HevyWorkout[]> {
  const { results } = await db.prepare("SELECT json FROM workouts ORDER BY start_time").all<{ json: string }>();
  return results.map((r) => JSON.parse(r.json));
}

export async function workoutCount(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM workouts").first<{ n: number }>())?.n ?? 0;
}

/** Stored JSON for the given ids that exist (chunked: SQLite caps bound parameters). */
export async function workoutJson(db: D1Database, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT id, json FROM workouts WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all<{ id: string; json: string }>();
    for (const r of results) out.set(r.id, r.json);
  }
  return out;
}
