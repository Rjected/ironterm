-- Social (docs/social/PROTOCOL.md): friends, what they left on my items, my notifications, and
-- message ids already seen (replay / duplicate guard). Same SQL as worker/social/db.ts.
CREATE TABLE IF NOT EXISTS social_friends (
  id TEXT PRIMARY KEY,            -- first 12 hex of sha256(server)
  server TEXT NOT NULL UNIQUE,
  handle TEXT,
  name TEXT,
  directory TEXT,
  public_key TEXT NOT NULL,       -- pinned on accept (fetched from .well-known before that)
  status TEXT NOT NULL,           -- friends | outgoing | incoming
  share TEXT NOT NULL DEFAULT 'basic',  -- what I let them see
  their_share TEXT,               -- what they let me see, from their last response
  request_id TEXT,
  note TEXT,
  since TEXT NOT NULL,
  last_seen TEXT
);
CREATE TABLE IF NOT EXISTS social_interactions (
  id TEXT PRIMARY KEY,            -- the sender's message id
  friend_id TEXT NOT NULL,
  item TEXT NOT NULL,
  kind TEXT NOT NULL,             -- reaction | comment
  emoji TEXT,
  text TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS social_interactions_item ON social_interactions(item);
CREATE INDEX IF NOT EXISTS social_interactions_friend ON social_interactions(friend_id);
CREATE TABLE IF NOT EXISTS social_notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- request | accepted | reaction | comment
  friend_id TEXT NOT NULL,
  server TEXT NOT NULL,
  handle TEXT,
  name TEXT,
  item TEXT,
  emoji TEXT,
  text TEXT,
  at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS social_notifications_at ON social_notifications(at);
CREATE TABLE IF NOT EXISTS social_seen (id TEXT PRIMARY KEY, at TEXT NOT NULL);
