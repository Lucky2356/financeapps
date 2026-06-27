#!/bin/sh
# Daily PostgreSQL backups inside Docker (plan: safe-launch). Runs as a sidecar:
# dumps to a mounted volume and prunes old files. Copy the volume off-server
# periodically for true off-site safety.
#
# Security: dumps contain all user PII (emails, balances, transactions). Files are
# created owner-only (umask 077). Set BACKUP_ENCRYPTION_KEY to additionally
# encrypt each dump at rest (AES-256, openssl); without it, dumps are plaintext
# and rely on the volume/host being trusted + access-controlled.
set -eu
umask 077

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
OUT_DIR="/backups"
mkdir -p "$OUT_DIR"

ENCRYPT=0
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  if command -v openssl >/dev/null 2>&1; then
    ENCRYPT=1
    echo "[backup] encryption: ENABLED (AES-256 via openssl)"
  else
    echo "[backup] WARNING: BACKUP_ENCRYPTION_KEY set but openssl missing — writing PLAINTEXT dumps"
  fi
fi

echo "[backup] started: interval=${INTERVAL}s retention=${RETENTION_DAYS}d -> ${OUT_DIR}"
while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  if [ "$ENCRYPT" = "1" ]; then
    file="${OUT_DIR}/db-${ts}.sql.gz.enc"
    if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip \
      | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY >"$file"; then
      echo "[backup] wrote $file (encrypted)"
    else
      echo "[backup] ERROR: dump/encrypt failed at $ts"
      rm -f "$file"
    fi
  else
    file="${OUT_DIR}/db-${ts}.sql.gz"
    if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip >"$file"; then
      echo "[backup] wrote $file"
    else
      echo "[backup] ERROR: dump failed at $ts"
      rm -f "$file"
    fi
  fi
  # Prune both plaintext and encrypted dumps past the retention window.
  find "$OUT_DIR" -name 'db-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
  find "$OUT_DIR" -name 'db-*.sql.gz.enc' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
  sleep "$INTERVAL"
done
