# Sauvegarde et restauration

## Sauvegarde

```bash
scripts/backup.sh                                   # utilise DATABASE_URL de .env
PG_BIN=/opt/homebrew/opt/postgresql@17/bin scripts/backup.sh   # si pg_dump du PATH est plus ancien que le serveur
```

- Format `pg_dump --format=custom` (compressé), vérifié par `pg_restore --list` avant d'annoncer la
  réussite ; un fichier incomplet est supprimé.
- Fichiers dans `backups/` (droits 700/600, ignoré par git). Avec le stockage local, une archive
  `storage-*.tar.gz` est ajoutée.
- Copier les sauvegardes **hors du serveur** (stockage chiffré). Pour R2/S3 : versioning du bucket.
- Fréquence conseillée : quotidienne (cron système) + avant chaque migration ou import.

Supabase / PostgreSQL managé : les sauvegardes du fournisseur ne dispensent pas d'un export
régulier vérifiable (`scripts/backup.sh` fonctionne avec l'URL de connexion directe).

## Restauration

```bash
createdb avencao_restore
TARGET_DATABASE_URL=postgresql://…/avencao_restore scripts/restore.sh backups/avencao-AAAAMMJJ-HHMMSS.dump
```

- La base cible est **toujours explicite** (jamais déduite de `.env`) et une confirmation
  « RESTAURER » est demandée.
- Restauration en une seule transaction (`--single-transaction`) : tout ou rien.
- Ensuite : `DATABASE_URL=<cible> pnpm db:migrate` (doit indiquer qu'aucune migration n'est en
  attente), connexion, et contrôle de quelques totaux (Finances › Synthèse).

## Test effectué

Sauvegarde de la base de développement puis restauration dans une base jetable : nombres de
clients, vidéos, encaissements, somme des encaissements et historique des migrations identiques.
Recommandé : refaire ce test de restauration une fois par trimestre.
