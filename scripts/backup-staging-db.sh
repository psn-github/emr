#!/usr/bin/env bash
# Nightly staging-DB backup (PATIENT-DATA §5, ADR-0064). Staging holds synthetic
# data only (ADR-0007), but the backup discipline runs here exactly as it must in
# production: nightly pg_dump, dated, pruned, and restorable (the restore drill
# is apps/api/src/restore-drill.e2e.test.ts + docs/PATIENT-DATA.md §restore).
#
# Cron (one-time, on the VPS):
#   sudo crontab -e   →   15 2 * * * /opt/oxford-his/scripts/backup-staging-db.sh
set -euo pipefail

ENV_FILE=${ENV_FILE:-/etc/oxford-his/api.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/oxford-his}
RETENTION_DAYS=${RETENTION_DAYS:-14}

if [ -f "$ENV_FILE" ] && [ -z "${DATABASE_URL:-}" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
: "${DATABASE_URL:?DATABASE_URL not set (and $ENV_FILE missing)}"

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%d-%H%M%S)
out="$BACKUP_DIR/oxford-his-$stamp.dump"

pg_dump --format=custom --file="$out" "$DATABASE_URL"
find "$BACKUP_DIR" -name 'oxford-his-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "backup: wrote $out ($(du -h "$out" | cut -f1)); retention ${RETENTION_DAYS}d"
