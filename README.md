# Avencao CRM

CRM interne d'Avencao : clients, prospection, projets, vidéos, monteurs freelances, planning,
ventes, facturation, encaissements, coûts, charges, forfaits, rentabilité et rapports.

Reconstruction complète de l'ancien CRM Rails (qui reste la référence visuelle et la source
de migration, sans jamais être modifié). Interface en français, montants de pilotage en EUR,
coûts possibles en EUR / IDR / USD, fuseau par défaut Asia/Makassar.

> Ce logiciel produit des **indicateurs de gestion**. Ce n'est pas un logiciel comptable certifié
> et il n'émet pas de factures légales : il suit les factures saisies et leurs PDF.

## Pile technique

| Domaine | Choix |
|---|---|
| Application | Next.js 16 (App Router, Cache Components), React 19, TypeScript strict |
| Base | PostgreSQL 17 (16+ accepté), Prisma 7 (client généré, adaptateur `pg`) |
| Authentification | Better Auth (email + mot de passe, sessions en base, inscription publique fermée) |
| Formulaires | React Hook Form + Zod (schémas partagés client/serveur, revalidés côté serveur) |
| Interface | Tailwind CSS 4, shadcn/ui, Lucide, TanStack Table, dnd-kit, Recharts |
| Montants | `decimal.js` + `NUMERIC(18,2)` en base, jamais de nombres flottants |
| Jobs | pg-boss (file durable dans PostgreSQL) + worker séparé |
| Fichiers | Disque local (hors `/public`) ou bucket S3 compatible (Cloudflare R2) privé |
| Emails | Resend (via SMTP) ou SMTP générique ; aucun envoi simulé |
| Tests | Vitest (unitaires + intégration PostgreSQL), Playwright (parcours critiques) |

Pourquoi Better Auth plutôt qu'Auth.js : sessions en base révocables (désactivation d'un compte
= déconnexion immédiate), limitation de débit stockée en base, hachage scrypt intégré, fermeture
simple de l'inscription publique, et un adaptateur Prisma maintenu. Auth.js aurait demandé de
recoder la gestion des mots de passe (provider « Credentials » sans sessions en base).

## Démarrage local

Prérequis : Node.js **24.11+** (`.nvmrc` : 24.22.1), pnpm 10, PostgreSQL 16 ou 17.

```bash
pnpm install                    # génère aussi le client Prisma
cp .env.example .env            # puis renseigner les valeurs (voir ci-dessous)
createdb avencao_dev && createdb avencao_test
pnpm db:migrate                 # applique les migrations (jamais de reset automatique)
pnpm db:seed                    # référentiels + administrateur + données de démo fictives
pnpm dev                        # http://localhost:3000
pnpm worker                     # dans un 2e terminal : rappels et forfaits récurrents
pnpm check:env                  # vérifie base, stockage, email sans afficher de secret
```

### Variables d'environnement

Toutes sont documentées dans [.env.example](.env.example). Minimum : `DATABASE_URL`,
`BETTER_AUTH_SECRET` (32+ caractères, `openssl rand -base64 32`), `BETTER_AUTH_URL`/`APP_URL`.
Facultatif : stockage S3/R2, Resend/SMTP, `CRON_SECRET`, `TEST_DATABASE_URL` (doit contenir « test »).
Sans email configuré, les invitations et réinitialisations affichent un **lien à copier** à
l'administrateur : rien n'est prétendu envoyé.

### Comptes de démonstration (`pnpm db:seed`, hors production)

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | valeur de `SEED_ADMIN_EMAIL` | valeur de `SEED_ADMIN_PASSWORD` |
| Responsable de production (sans accès financier) | production@avencao.test | idem |
| Monteur (Kai) | monteur@avencao.test | idem |

Les données de démo (« Studio Nova (démo) », etc.) sont fictives et couvrent : pack de 12 reels
vendu au forfait, VSL payée à la minute finale, campagne pondérée avec une variante annulée,
forfait mensuel, coût manquant, monteurs payés en IDR et USD, acompte + facture partielle,
facture en retard avec avoir. Le seed est idempotent ; il refuse la démo en production sauf
`ALLOW_DEMO_SEED=1`.

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Développement / compilation / serveur de production |
| `pnpm worker` | Worker des jobs (à superviser en production) |
| `pnpm typecheck` · `pnpm lint` | `next typegen` + `tsc` · ESLint |
| `pnpm test` | Tests unitaires + intégration (base `TEST_DATABASE_URL`, vidée entre les tests) |
| `pnpm test:e2e` | Playwright sur la base de dev initialisée (crée des données préfixées « E2E ») |
| `pnpm db:migrate` · `pnpm db:migrate:dev` | Appliquer · créer une migration (dev uniquement) |
| `pnpm db:seed` | Référentiels, administrateur, démo |
| `pnpm import:legacy` | Import de l'ancien CRM Rails (simulation par défaut) — [docs/migration-rails.md](docs/migration-rails.md) |
| `pnpm check:env` | Contrôle de la configuration |
| `pnpm smoke <url>` | Contrôle rapide d'un déploiement (santé, sécurité, accès fermés) |
| `scripts/backup.sh` · `scripts/restore.sh` | Sauvegarde / restauration — [docs/backup-restauration.md](docs/backup-restauration.md) |

La connexion est limitée à 5 tentatives par minute et par adresse : enchaîner plusieurs
`pnpm test:e2e` en moins d'une minute peut renvoyer 429.

## Déploiement

Référence : **Vercel + Supabase + Cloudflare R2 + Resend**, ou image Docker. Guide pas à pas,
variables, migrations (workflow GitHub manuel) et recette : [docs/deploiement.md](docs/deploiement.md).
Chaque push lance l'intégration continue (typecheck, lint, tests, build, Playwright, Docker).

## Organisation du code

```
prisma/                 schéma, migrations (dont contraintes CHECK SQL), seeds
src/app/                routes (auth), (dashboard), api/ (auth, files, exports, cron)
src/features/<domaine>/ schémas Zod, Server Actions, formulaires et composants client
src/server/             accès données : policies, auth, services (écritures), queries (lectures),
                        domain/ (calculs purs testés), jobs/, legacy-import/, storage/
src/lib/                montants décimaux, dates locales, formats, libellés FR, validation
worker/                 processus pg-boss
tests/                  unit/, integration/, e2e/
docs/                   documentation fonctionnelle et d'exploitation
```

Règles appliquées partout : chaque page, Server Action et route API vérifie la session **et** la
permission côté serveur ; les requêtes « monteur » utilisent des sélections dédiées sans prix de
vente, marges, notes internes ni rémunération des autres ; toute correction financière est une
écriture tracée (annulation, avoir, contre-passation), jamais un effacement.

## Documentation

- [Fonctionnalités disponibles et différées](docs/fonctionnalites.md)
- [Définitions financières](docs/definitions-financieres.md)
- [Rôles et permissions](docs/permissions.md)
- [Claude : serveur MCP et bouton « Demander à Claude »](docs/claude-mcp.md)
- [Workflow vidéo](docs/workflow-video.md)
- [Architecture, cache et revalidation](docs/architecture.md)
- [Jobs et worker](docs/jobs.md)
- [Stockage des fichiers](docs/stockage.md)
- [Migration depuis Rails](docs/migration-rails.md)
- [Sauvegarde et restauration](docs/backup-restauration.md)
- [Déploiement](docs/deploiement.md)
