# Rôles et permissions

Source : [src/server/policies.ts](../src/server/policies.ts). Les permissions sont vérifiées côté
serveur dans chaque page (`requirePagePermission`), Server Action (`actorFor`) et route API. Masquer
un bouton n'est jamais une protection.

| Rôle | Accès |
|---|---|
| **Administrateur principal** (`MASTER_ADMIN_EMAILS`) | Tout, en permanence : rôle et statut verrouillés ; mot de passe modifiable uniquement par un administrateur principal. |
| **Administrateur** | Tout : finances, marges globales, rapports financiers, réglages, utilisateurs, imports, notes « administrateurs ». |
| **Responsable de production** | Clients, prospection, projets, vidéos, affectations, monteurs, planning, rapports opérationnels. Sans accès financier par défaut. |
| Responsable de production **+ accès financier** (case cochée par un administrateur) | En plus : tarifs, coûts, ventes, factures, encaissements, règlements, charges, forfaits, marges projet, exports financiers. **Jamais** : marge globale, indicateurs financiers du tableau de bord, rapports financiers, réglages, utilisateurs. |
| **Monteur** | Ses missions uniquement (brief, liens autorisés, retours, versions, checklist, temps), sa rémunération et ses règlements. Jamais : prix de vente, revenus, marges, notes internes, rémunération des autres. |
| Claude (MCP) et bouton « Demander à Claude » | Administrateurs et responsables de production (`assistant.use`), en **lecture seule**, avec les mêmes filtres que leurs écrans. Jamais les monteurs. Voir [claude-mcp.md](claude-mcp.md). |
| Client | Réservé à la phase 2 (portail) : aucun accès actuellement. |
| Visiteur | Aucun accès métier (compte en attente). |

## Garanties techniques

- Les requêtes du portail monteur utilisent des **sélections dédiées** (`getEditorMission`,
  `listEditorMissions`) : les champs sensibles ne quittent jamais la base.
- Les exports CSV et fichiers (`/api/exports`, `/api/files`) appliquent les mêmes contrôles que les
  écrans (401 sans session, 403 sans droit). Un monteur ne lit que les pièces de ses propres
  vidéos et règlements.
- Changer le rôle ou désactiver un compte **révoque ses sessions** immédiatement. Le dernier
  administrateur actif ne peut pas être rétrogradé ni désactivé.
- Aucune promotion implicite : un compte importé est « À revoir » avec un rôle **suggéré** qu'un
  administrateur doit confirmer.

## Correspondance des rôles Rails

| Rôle Rails (entier) | Statut importé | Rôle suggéré |
|---|---|---|
| visitor (0) | À revoir | — |
| manager (1) | À revoir | Responsable de production |
| collabo (2) | À revoir | Monteur |
| admin (3) | À revoir | Administrateur |
| rahona (4) | À revoir | — (rôle nommé d'après une personne : décision humaine) |
| designer (5) | À revoir | Monteur |

Aucun mot de passe Rails n'est importé : chaque personne reçoit une invitation (lien valable 72 h).
