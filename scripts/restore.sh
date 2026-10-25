#!/usr/bin/env bash
# Restauration d'une sauvegarde dans une base CIBLE explicite (jamais déduite de .env).
#   TARGET_DATABASE_URL=postgresql://…/avencao_restore scripts/restore.sh backups/avencao-….dump
# La base cible doit exister et être vide (ou être recréée). Confirmation interactive obligatoire.
set -euo pipefail
# PG_BIN=/opt/homebrew/opt/postgresql@17/bin si la version client du PATH est plus ancienne que le serveur.
BIN="${PG_BIN:+${PG_BIN%/}/}"
DUMP="${1:?Usage : TARGET_DATABASE_URL=… scripts/restore.sh <fichier.dump>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL manquant (base cible explicite)}"
[[ -f "$DUMP" ]] || { echo "Fichier introuvable : $DUMP"; exit 1; }
"${BIN}pg_restore" --list "$DUMP" > /dev/null
HOST_DB="$(printf '%s' "$TARGET_DATABASE_URL" | sed -E 's#^[a-z]+://([^@]*@)?##; s#\?.*##')"
echo "Restauration de $DUMP vers : $HOST_DB"
echo "Les objets existants de la base cible seront remplacés."
read -r -p "Tapez RESTAURER pour confirmer : " ANSWER
[[ "$ANSWER" == "RESTAURER" ]] || { echo "Annulé."; exit 1; }
PG_URL="$(printf '%s' "$TARGET_DATABASE_URL" | sed -E 's/[?&](schema|connection_limit|pool_timeout|pgbouncer)=[^&]*//g')"
"${BIN}pg_restore" --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$PG_URL" "$DUMP"
echo "✓ Restauration terminée. Vérifiez : pnpm db:migrate (doit indiquer « No pending migrations »), puis connexion et totaux financiers."
