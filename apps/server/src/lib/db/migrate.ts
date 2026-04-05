import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { logger } from '../logger.js';
import { rawDb } from './client.js';

/**
 * Filesystem-based migration runner.
 *
 * Reads every `*.sql` file from ./migrations (sorted lexicographically), runs
 * each one in a transaction, and records applied filenames in `_migrations`.
 * Idempotent: already-applied files are skipped.
 */

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function runMigrations(db: Database.Database = rawDb): { applied: string[] } {
  ensureMigrationsTable(db);

  const alreadyApplied = new Set<string>(
    db
      .prepare('SELECT filename FROM _migrations')
      .all()
      .map((r) => (r as { filename: string }).filename)
  );

  const files = listMigrationFiles(MIGRATIONS_DIR);
  const applied: string[] = [];

  for (const filename of files) {
    if (alreadyApplied.has(filename)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const insert = db.prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)');

    const tx = db.transaction(() => {
      db.exec(sql);
      insert.run(filename, new Date().toISOString());
    });
    tx();

    applied.push(filename);
    logger.info({ filename }, 'migration applied');
  }

  return { applied };
}

// CLI entry: `pnpm --filter @prompt-logger/server db:migrate`
const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    const { applied } = runMigrations();
    if (applied.length === 0) {
      logger.info('no migrations to apply');
    } else {
      logger.info({ count: applied.length }, 'migrations complete');
    }
    process.exit(0);
  } catch (err) {
    logger.fatal({ err }, 'migration failed');
    process.exit(1);
  }
}
