# Déploiement

Aucune migration de production n'est lancée automatiquement (ni au build, ni au démarrage) :
chaque étape sensible est déclenchée volontairement.

## Architecture recommandée

| Brique | Service | Rôle |
|---|---|---|
| Application | **Vercel** (projet relié au dépôt GitHub, branche `main`) | Pages, Server Actions, API, cron |
| Base | **Supabase** (PostgreSQL 15+) | Données |
| Fichiers | **Cloudflare R2** (bucket privé) | PDF, justificatifs, logo |
| Emails | **Resend** (domaine vérifié) | Invitations, réinitialisations, rappels |
| Jobs | Vercel Cron → `/api/cron/<job>` exécuté directement | Rappels, forfaits (pas de worker sur Vercel) |

Alternative : n'importe quel hébergeur Docker (Railway, Render, Fly, VPS) avec l'image fournie
(voir plus bas) ; le worker pg-boss peut alors tourner en continu.

## 1. Base Supabase

1. Créer un projet (région proche des utilisateurs ; choisir la même région Vercel ensuite).
2. *Project Settings › Database › Connection string* :
   - `DATABASE_URL` (application) : pooler **mode transaction**, port **6543**, suffixe
     `?sslmode=require`. Ex. `postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<région>.pooler.supabase.com:6543/postgres?sslmode=require`
   - `DIRECT_URL` (migrations) : pooler **mode session**, port **5432**, même hôte, `?sslmode=require`.
   - La connexion directe `db.<ref>.supabase.co` est en IPv6 uniquement : à éviter depuis Vercel
     et GitHub Actions.
3. Facultatif mais recommandé : télécharger le certificat racine (*SSL Configuration*) et le
   placer dans `DATABASE_CA_CERT` (contenu PEM) pour vérifier le certificat du serveur. Sans lui,
   la connexion est chiffrée sans vérification du certificat (comportement libpq `require`).

### Rôle dédié à l'application (recommandé)

Plutôt que le rôle `postgres` (dont seul un propriétaire/administrateur du projet peut
réinitialiser le mot de passe), créer un rôle de connexion propre à l'application dans
*SQL Editor* — autorisé pour un membre « Developer » :

```sql
create role avencao_app with login password '<mot de passe long, ex. openssl rand -hex 24>';
grant usage, create on schema public to avencao_app;
alter role avencao_app set statement_timeout = '60s';
alter role avencao_app connection limit 30;
```

Connexion via le pooler avec l'utilisateur `avencao_app.<ref>` (ports 6543 et 5432 comme
ci-dessus). Les migrations et l'application doivent utiliser **le même rôle** : il est
propriétaire des tables.

### API de données Supabase

Supabase expose le schéma `public` via son API (clé publique). Le CRM ne l'utilise pas : la
migration `lock_supabase_data_api` retire tout droit aux rôles `anon` et `authenticated` et
active la RLS sur toutes les tables (le propriétaire, c'est-à-dire l'application, n'est pas
concerné). Les variables `NEXT_PUBLIC_SUPABASE_*` et `SUPABASE_SECRET_KEY` sont inutiles.

## 2. Migrations et données initiales

Deux façons, toutes deux volontaires :

**A. Depuis GitHub (recommandé)** — workflow manuel *Actions › « Base de production »* :
déclarer dans *Settings › Environments › production* les secrets `DATABASE_URL`, `DIRECT_URL`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (et `DATABASE_CA_CERT` si utilisé), puis lancer le
workflow en choisissant l'action et en tapant `production` pour confirmer :

| Action | Effet |
|---|---|
| `migrate` | Applique les migrations en attente |
| `migrate+seed` | + référentiels (catégories, checklist, modèles) + administrateur |
| `migrate+seed+demo` | + données de démonstration fictives (pour un environnement de test) |

**B. Depuis un poste** :

```bash
DATABASE_URL="<pooler 6543>" DIRECT_URL="<pooler 5432>" pnpm db:migrate
DATABASE_URL="<pooler 6543>" NODE_ENV=production SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… SEED_DEMO=0 pnpm db:seed
```

En production, le mot de passe administrateur du seed doit faire 14 caractères minimum et ne pas
contenir « demo », « password » ou « avencao ». Les données de démo exigent `ALLOW_DEMO_SEED=1` :
à réserver à une base de test (elles ne se suppriment pas automatiquement ; repartir d'une base
vierge avant la mise en service réelle).

## 3. Projet Vercel

1. *Add New › Project* → importer le dépôt GitHub. Framework détecté : Next.js ; Node 24 (champ
   `engines`). Laisser les commandes par défaut.
2. Variables d'environnement (*Production* et, si besoin, *Preview*) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | pooler transaction (6543) `?sslmode=require` |
| `DIRECT_URL` | pooler session (5432) — utile si des scripts tournent sur Vercel ; sinon facultatif |
| `DATABASE_CA_CERT` | facultatif, certificat PEM Supabase |
| `DATABASE_POOL_MAX` | `3` (connexions par instance) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — **différent** du développement |
| `APP_URL` / `BETTER_AUTH_URL` | URL publique, ex. `https://crm.avencao.fr` (sinon le domaine Vercel de production est utilisé) |
| `STORAGE_DRIVER` | `s3` (le disque Vercel est éphémère : le pilote local y est refusé) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`=`auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`=`true` | Cloudflare R2 |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Resend ; `EMAIL_FROM` sur un **domaine vérifié** |
| `CRON_SECRET` | `openssl rand -hex 32` (Vercel Cron l'envoie automatiquement) |

3. *Settings › Functions › Region* : la même région que Supabase.
4. Déployer. Les aperçus (branches) fonctionnent aussi : leurs URLs sont acceptées par
   l'authentification.

### Tâches planifiées

`vercel.json` déclare deux crons (heures UTC) : rappels à 00:00 UTC (08:00 à Makassar) et forfaits
à 18:15 UTC (02:15 à Makassar). Sur Vercel, les jobs s'exécutent directement dans la requête
(`JOBS_INLINE` vrai par défaut) ; ils sont idempotents et tracés dans `JobLog`. Le plan Hobby
limite les crons à une exécution par jour ; avec le plan Pro, passer les rappels à `0 * * * *`.

## 4. Tester le déploiement

1. **Contrôles automatiques** (aucun compte, aucune donnée créée) :
   ```bash
   pnpm smoke https://<domaine>
   SMOKE_CRON_SECRET=<CRON_SECRET> pnpm smoke https://<domaine>   # exécute aussi un job
   ```
   Vérifie : santé (`/api/health` : base joignable, migrations appliquées, version déployée),
   HTTPS, en-têtes de sécurité, redirection vers la connexion, API fermées (401), inscription
   fermée, cron protégé.
2. **Parcours complets** (base avec données de démo) :
   ```bash
   E2E_BASE_URL=https://<domaine> E2E_PASSWORD=<SEED_ADMIN_PASSWORD> SEED_ADMIN_EMAIL=<admin> pnpm test:e2e
   ```
   15 tests : accès refusés (monteur, responsable sans finance), absence de marges côté monteur,
   tableau de bord, fiche vidéo, création de client + doublon, export CSV, création puis annulation
   d'une charge, navigation mobile. Crée des données préfixées « E2E ».
3. **Recette manuelle** : voir la liste ci-dessous.
4. `pnpm check:env` avec les variables de production (dans un shell, jamais commitées) :
   vérifie base, R2 (écriture/lecture/suppression d'un fichier témoin) et Resend sans rien envoyer.

### Recette manuelle (compte administrateur)

- [ ] Réglages › Agence : nom, logo (envoi vers R2), fuseau, seuil de marge.
- [ ] Réglages › Utilisateurs : inviter un responsable et un monteur (email reçu ou lien à copier),
      définir le mot de passe via le lien, se connecter avec chaque rôle.
- [ ] Clients : créer, détecter un doublon, importer un CSV, ajouter un document PDF.
- [ ] Prospection : déplacer une opportunité, la convertir en projet.
- [ ] Projets / vidéos : créer depuis un modèle, affecter un monteur (aperçu de marge), déposer une
      version (compte monteur), valider, livrer.
- [ ] Finances : vente répartie, facture d'acompte puis finale, encaissement partiel, avoir,
      règlement monteur en IDR ou USD, charge, forfait (génération de période).
- [ ] Rapports : résultat, impayés, export CSV ouvert dans Excel.
- [ ] Monteur : ne voit ni prix de vente ni marges ; URL directe `/finances` refusée.
- [ ] Mot de passe oublié : email reçu (domaine Resend vérifié).
- [ ] Le lendemain : *Notifications* contient les rappels du cron ; `JobLog` en succès.

## Intégration continue

`.github/workflows/ci.yml` (chaque push et pull request) : typecheck, lint, tests unitaires et
d'intégration sur PostgreSQL 17, build, parcours Playwright sur un serveur de production local, et
construction des images Docker.

## Option Docker (Railway, Render, Fly, VPS)

```bash
cp .env.example .env    # renseigner, dont POSTGRES_PASSWORD
docker compose up -d db
docker compose --profile ops run --rm migrate
docker compose up -d web worker
```

- `web` : serveur Next.js « standalone », utilisateur non root, port 3000, healthcheck `/api/health`.
- `worker` : jobs pg-boss avec reprises (même image que migrations / seed / import).
- Hors Docker : `pnpm build && pnpm start` (copie les fichiers statiques puis lance le serveur).

## Checklist de mise en service réelle

- [ ] Base vierge (sans données de démo) migrée, administrateur créé avec un mot de passe fort.
- [ ] `BETTER_AUTH_SECRET` propre à la production ; HTTPS ; `APP_URL` public.
- [ ] Domaine d'envoi vérifié chez Resend (SPF/DKIM).
- [ ] Bucket R2 privé, clés limitées à ce bucket.
- [ ] Sauvegarde quotidienne + test de restauration (Supabase : sauvegardes du plan + `scripts/backup.sh`).
- [ ] Ancien CRM : sécurisé puis passé en lecture seule après la migration des données.
