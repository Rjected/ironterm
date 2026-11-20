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

const bumpRev = (db: D1Database, key: string) =>
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, '1', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1, updated_at = excluded.updated_at").bind(key);

export async function upsertWorkouts(db: D1Database, ws: HevyWorkout[]) {
  if (!ws.length) return;
  await db.batch(
    ws.map((w) =>
      db
        .prepare("INSERT INTO workouts (id, start_time, updated_at, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET start_time = excluded.start_time, updated_at = excluded.updated_at, json = excluded.json")
        .bind(w.id, w.start_time, w.updated_at ?? null, JSON.stringify(w)),
    ).concat(bumpRev(db, WORKOUTS_REV)),
  );
}

export async function deleteWorkouts(db: D1Database, ids: string[]) {
  if (!ids.length) return;
  await db.batch(ids.map((id) => db.prepare("DELETE FROM workouts WHERE id = ?").bind(id)).concat(bumpRev(db, WORKOUTS_REV)));
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

/** Bumped in the same batch as every workouts write, so a cached copy knows when it's stale. */
export const WORKOUTS_REV = "workouts:rev";
export const WHOOP_REV = "whoop:rev";
export const bumpWhoopRev = (db: D1Database) => bumpRev(db, WHOOP_REV).run();

// Per-isolate caches. A Worker isolate serves many requests; handing back the same objects while
// the data is unchanged lets derive() (src/derive.ts) skip its heavy work.
const parsed = new Map<string, { raw: string; value: unknown }>();
let workoutsCache: { rev: string; ws: HevyWorkout[] } | null = null;

/**
 * Many kv keys in one query. Values whose JSON is unchanged since the last read come back as the
 * same object.
 */
export async function kvGetMany(db: D1Database, keys: string[]): Promise<Record<string, unknown>> {
  const { results } = await db.prepare(`SELECT key, value FROM kv WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all<{ key: string; value: string }>();
  const out: Record<string, unknown> = {};
  for (const r of results) {
    const c = parsed.get(r.key);
    if (c && c.raw === r.value) out[r.key] = c.value;
    else {
      const value = JSON.parse(r.value);
      parsed.set(r.key, { raw: r.value, value });
      out[r.key] = value;
    }
  }
  return out;
}

/** All workouts, from this isolate's copy when [rev] (the WORKOUTS_REV value) hasn't moved. */
export async function workoutsAt(db: D1Database, rev: unknown): Promise<HevyWorkout[]> {
  const r = rev == null ? null : String(rev);
  if (r && workoutsCache?.rev === r) return workoutsCache.ws;
  const ws = await allWorkouts(db);
  workoutsCache = r ? { rev: r, ws } : null;
  return ws;
}
