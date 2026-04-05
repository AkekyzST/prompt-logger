#!/usr/bin/env bash
# Prompt Logger — SQLite online backup.
#
# Uses SQLite's online backup API (.backup) which is safe while the app is
# running and never corrupts the source. Retains the last 14 days by default.
#
# Cron example (daily at 03:00):
#   0 3 * * * /opt/prompt-logger/scripts/backup.sh >> /var/log/prompt-logger-backup.log 2>&1

set -euo pipefail

DB="${DATABASE_PATH:-/data/prompts.db}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

STAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
TARGET="$BACKUP_DIR/prompts-$STAMP.db"

if [ ! -f "$DB" ]; then
  echo "backup: source database not found at $DB" >&2
  exit 1
fi

sqlite3 "$DB" ".backup '$TARGET'"

# Integrity check on the backup copy.
if ! sqlite3 "$TARGET" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "backup: integrity check FAILED on $TARGET" >&2
  rm -f "$TARGET"
  exit 2
fi

gzip -9 "$TARGET"
echo "backup: wrote $TARGET.gz"

# Prune old backups.
find "$BACKUP_DIR" -name 'prompts-*.db.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "backup: done"
