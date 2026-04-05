-- Prompt Logger — audit log.
-- Every admin write (session/user/class-code mutation) is recorded here.
-- Keep in sync with apps/server/src/schema/index.ts (audit_log table).

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,          -- ULID
  actor_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action      TEXT NOT NULL,             -- e.g. 'session.update', 'user.create'
  target_type TEXT NOT NULL,             -- 'session' | 'user' | 'code' | 'grant'
  target_id   TEXT,                      -- may be null for bulk ops
  metadata    TEXT,                      -- JSON blob (before/after, extras)
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON audit_log(actor_id);
