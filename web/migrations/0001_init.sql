-- Raw Hevy workouts, kept whole so stats and program replay can be recomputed at any time.
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  updated_at TEXT,
  json TEXT NOT NULL
);
CREATE INDEX workouts_start ON workouts(start_time);

-- Small key/value store: settings, program config, sync cursor, template cache, pushed routine ids.
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
