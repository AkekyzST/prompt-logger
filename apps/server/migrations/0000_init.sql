-- Prompt Logger — initial schema.
-- Matches drizzle schema in apps/server/src/schema/index.ts and
-- docs/ARCHITECTURE.md §5. Keep all three in sync.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id                   TEXT PRIMARY KEY,
  claude_session_id    TEXT UNIQUE,
  title                TEXT NOT NULL,
  seq                  INTEGER NOT NULL,
  tag                  TEXT,
  visibility           TEXT NOT NULL DEFAULT 'private'
                         CHECK (visibility IN ('private', 'shared', 'code')),
  cwd                  TEXT,
  first_prompt_preview TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  closed_at            TEXT
);

CREATE TABLE IF NOT EXISTS prompts (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  raw_hash   TEXT,
  redactions TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_session_seq
  ON prompts(session_id, seq);

CREATE TABLE IF NOT EXISTS session_grants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS class_codes (
  code       TEXT PRIMARY KEY,
  tag        TEXT NOT NULL,
  label      TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_redemptions (
  code        TEXT NOT NULL REFERENCES class_codes(code) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (code, user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);

-- Full-text search over prompts. Content-less FTS5 table mirroring prompts.
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  content,
  session_id UNINDEXED,
  content=prompts,
  content_rowid=rowid
);

-- Keep FTS in sync with the prompts table.
CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts(rowid, content, session_id)
    VALUES (new.rowid, new.content, new.session_id);
END;

CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, content, session_id)
    VALUES ('delete', old.rowid, old.content, old.session_id);
END;

CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, content, session_id)
    VALUES ('delete', old.rowid, old.content, old.session_id);
  INSERT INTO prompts_fts(rowid, content, session_id)
    VALUES (new.rowid, new.content, new.session_id);
END;
