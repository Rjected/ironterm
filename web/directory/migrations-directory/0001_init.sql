-- Ironterm directory: handle → server + public key. Nothing else about anyone.
CREATE TABLE IF NOT EXISTS users (
  handle TEXT PRIMARY KEY,
  name TEXT,
  server TEXT NOT NULL,
  public_key TEXT NOT NULL,
  listed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS users_key ON users(public_key);
CREATE INDEX IF NOT EXISTS users_name ON users(lower(name));
-- fixed-window rate limits per client IP
CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
