#!/usr/bin/env bash
# Sauvegarde PostgreSQL (format custom, compressé) + dossier de stockage local s'il est utilisé.
#   scripts/backup.sh                 → backups/avencao-AAAAMMJJ-HHMMSS.dump
#   DATABASE_URL=… scripts/backup.sh  → base explicite
# Le fichier est vérifié (pg_restore --list) avant d'annoncer la réussite.
set -euo pipefail
# PG_BIN=/opt/homebrew/opt/postgresql@17/bin si la version client du PATH est plus ancienne que le serveur.
BIN="${PG_BIN:+${PG_BIN%/}/}"
cd "$(dirname "$0")/.."
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
: "${DATABASE_URL:?DATABASE_URL manquant}"
# pg_dump ne comprend pas les paramètres propres à Prisma.
PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/[?&](schema|connection_limit|pool_timeout|pgbouncer)=[^&]*//g')"
mkdir -p backups
chmod 700 backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/avencao-${STAMP}.dump"
trap 'rm -f "$OUT"' ERR
"${BIN}pg_dump" --format=custom --no-owner --no-privileges --file="$OUT" "$PG_URL"
"${BIN}pg_restore" --list "$OUT" > /dev/null
chmod 600 "$OUT"
trap - ERR
echo "✓ Base sauvegardée : $OUT ($(du -h "$OUT" | cut -f1))"
STORAGE_DIR="${STORAGE_LOCAL_DIR:-.storage}"
if [[ "${STORAGE_DRIVER:-local}" == "local" && -d "$STORAGE_DIR" ]]; then
  tar -czf "backups/storage-${STAMP}.tar.gz" -C "$STORAGE_DIR" .
  chmod 600 "backups/storage-${STAMP}.tar.gz"
  echo "✓ Fichiers sauvegardés : backups/storage-${STAMP}.tar.gz"
fi
echo "Copiez ces fichiers hors du serveur (stockage chiffré). Bucket S3/R2 : activez le versioning côté fournisseur."
