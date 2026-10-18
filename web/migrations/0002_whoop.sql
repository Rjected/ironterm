-- WHOOP workouts and recoveries (summaries from the v2 API), keyed "<kind>:<whoop id>".
CREATE TABLE IF NOT EXISTS whoop (id TEXT PRIMARY KEY, kind TEXT NOT NULL, start TEXT NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS whoop_kind_start ON whoop(kind, start);
