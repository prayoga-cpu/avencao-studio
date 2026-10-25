# Architecture, cache et revalidation

## Couches

| Couche | Rôle | Règle |
|---|---|---|
| `src/app/**/page.tsx` | Composants serveur : lisent via `src/server/queries` | `requirePagePermission` en tête de chaque page |
| `src/features/*/actions.ts` | Server Actions (`"use server"`) | `actorFor(permission)` + schéma Zod, via `safeAction` (erreurs traduites, jamais de pile exposée) |
| `src/server/services` | Écritures métier transactionnelles | `assertCan`, verrous de ligne (`FOR UPDATE`) sur les soldes, version optimiste, audit |
| `src/server/domain` | Calculs purs (coûts, marges, workflow, état des factures, crédits) | Sans base, testés unitairement |
| `src/app/api` | Auth, fichiers, exports CSV, cron | Mêmes contrôles que les écrans ; 401/403 JSON |
| `src/proxy.ts` | Redirection optimiste vers `/connexion` sans cookie | Confort uniquement, **pas** une autorisation ; exclut `/api` |

## Cache (Next.js 16, Cache Components)

- Les pages du tableau de bord sont en **prérendu partiel** : l'enveloppe statique est servie
  immédiatement, les données privées sont streamées derrière `loading.tsx` (Suspense).
- Aucune donnée privée n'est mise en cache partagé (`use cache` n'est pas utilisé sur des données
  dépendant de l'utilisateur). La session est lue par requête (`cache()` React = mémo par requête).
- Les réglages de l'agence sont lus via `getSettings()` (mémo par requête).

## Revalidation

Après chaque écriture réussie, `revalidateApp()` invalide l'arborescence (`revalidatePath("/",
"layout")`) : listes, fiches, compteurs et indicateurs reflètent immédiatement la modification. Les
formulaires client appellent ensuite `router.refresh()`. Choix volontairement simple et sûr pour
un outil interne à faible trafic.

## Concurrence

- Affectations d'encaissement, remboursements, règlements prestataires : verrou de ligne sur la
  facture / l'encaissement / le coût, puis recalcul du solde dans la transaction.
- Numérotation (vidéos `AV-AAAA-0001`, projets, ventes) : compteur atomique `INSERT … ON CONFLICT`.
- Modifications de fiches : champ `version` (édition concurrente détectée, message clair).
- Contraintes CHECK SQL (montants positifs, singleton des réglages, signes des lignes, cohérence des
  coûts) en dernier rempart.

## Montants et dates

- `decimal.js` (arrondi demi-supérieur), `NUMERIC` en base, chaînes vers le client.
- Instants en UTC ; deadlines et rattachements en **dates locales** (`@db.Date`) interprétées dans
  le fuseau de l'agence (Asia/Makassar par défaut).
