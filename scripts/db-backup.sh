#!/bin/sh
# Daily PostgreSQL backups inside Docker (plan: safe-launch). Runs as a sidecar:
# dumps to a mounted volume and prunes old files. Copy the volume off-server
# periodically for true off-site safety.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
OUT_DIR="/backups"
mkdir -p "$OUT_DIR"

echo "[backup] started: interval=${INTERVAL}s retention=${RETENTION_DAYS}d -> ${OUT_DIR}"
while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  file="${OUT_DIR}/db-${ts}.sql.gz"
  if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip >"$file"; then
    echo "[backup] wrote $file"
  else
    echo "[backup] ERROR: dump failed at $ts"
    rm -f "$file"
  fi
  find "$OUT_DIR" -name 'db-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
  sleep "$INTERVAL"
done
