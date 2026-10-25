# Jobs et worker

Les tâches de fond utilisent **pg-boss** : une file durable stockée dans PostgreSQL (schéma
`pgboss`), sans service supplémentaire. Elles s'exécutent dans un processus séparé :

```bash
pnpm worker          # local ; en production : service supervisé (systemd, Docker « worker »)
```

| Job | Planification (fuseau de l'agence) | Effet |
|---|---|---|
| `reminders.scan` | toutes les heures | Notifications : deadlines proches, retards, validations en attente > 1 jour, coûts manquants (résumé quotidien) |
| `retainers.generate` | 02:15 chaque jour | Génère la période du mois des forfaits actifs (crédits, report) |

## Garanties

- **Idempotence** : notifications dédupliquées par clé d'événement (`dedupeKey` unique) ;
  périodes de forfait uniques par (contrat, début). Relancer un job ne crée aucun doublon.
- **Une seule exécution à la fois** : files en mode `singleton`.
- **Reprises** : 3 tentatives, délai 60 s avec backoff exponentiel.
- **Traçabilité** : chaque exécution écrit une ligne `JobLog` (début, fin, statut, détail).
- Arrêt propre sur SIGINT/SIGTERM.

## Sur Vercel (sans worker)

Vercel Cron appelle `GET /api/cron/<job>` avec le `CRON_SECRET` (voir `vercel.json`). Comme
aucun processus long ne tourne sur Vercel, le job est exécuté directement dans la requête
(`JOBS_INLINE=true`, valeur par défaut quand `VERCEL` est défini). Mêmes garanties d'idempotence
et de traçabilité ; pas de reprise automatique (le cron suivant rattrape).

## Déclenchement externe (facultatif)

`POST /api/cron/<job>` avec `Authorization: Bearer $CRON_SECRET` dépose un job dans la file (clé
unique par minute) ; il est traité par le worker. Sans `CRON_SECRET`, la route répond 401.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://crm.example.com/api/cron/reminders.scan
```

## Supervision

```sql
SELECT name, status, "startedAt", "finishedAt", details FROM "JobLog" ORDER BY "startedAt" DESC LIMIT 20;
SELECT name, state, count(*) FROM pgboss.job GROUP BY 1, 2;
```

Les emails de notification ne partent que si un canal (Resend/SMTP) est configuré ; sinon les
notifications restent visibles dans l'application.
