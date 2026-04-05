import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../schema/index.js';
import { config } from '../config.js';

/**
 * Ensure the directory for the database file exists. better-sqlite3 will
 * happily create the file itself, but it won't create the parent dirs.
 */
function ensureParentDir(path: string): void {
  const dir = dirname(path);
  if (dir && dir !== '.' && dir !== '/') {
    mkdirSync(dir, { recursive: true });
  }
}

ensureParentDir(config.DATABASE_PATH);

export const rawDb: Database.Database = new Database(config.DATABASE_PATH);

// PRAGMAs — run at boot, once.
rawDb.pragma('journal_mode = WAL');
rawDb.pragma('synchronous = NORMAL');
rawDb.pragma('foreign_keys = ON');
rawDb.pragma('busy_timeout = 5000');

export const db: BetterSQLite3Database<typeof schema> = drizzle(rawDb, { schema });
