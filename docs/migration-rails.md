# Migration depuis l'ancien CRM Rails

L'application Rails et sa base **ne sont jamais modifiées** : l'import lit une copie (dump MySQL
restauré, ou export JSON) en lecture seule (`SET SESSION TRANSACTION READ ONLY`).

## Étapes recommandées

1. Restaurer le dump MySQL de chaque instance (production, axel, bobby, joseph…) sur une base de
   travail, avec un utilisateur en lecture seule.
2. Copier le dossier `storage/` d'Active Storage de l'instance (pièces jointes).
3. Sauvegarder la base PostgreSQL cible : `scripts/backup.sh`.
4. **Simulation** (par défaut, rien n'est enregistré, contraintes réellement vérifiées) :
   ```bash
   pnpm import:legacy --source production --mysql "mysql://lecture:…@hote/avencao" \
     --storage-dir /chemin/storage --report rapport-production.json
   ```
5. Lire le rapport : comptes lus / créés / reliés, sommes de contrôle, anomalies (erreurs,
   avertissements). Décider, si besoin, des suivis à convertir en vidéos (`--decisions`).
6. **Import réel** : ajouter `--apply --backup-confirmed` (en production, aussi
   `ALLOW_LEGACY_IMPORT=1`).
7. Dans l'application : Réglages › Utilisateurs (confirmer chaque rôle, inviter), Réglages ›
   Import (journal), Finances › Historique (qualifier les paiements Rails).

Relancer l'import est sans risque : chaque ancien ID est relié à son nouvel ID dans `LegacyIdMap`
(par source). Annulation d'une exécution : `pnpm import:legacy --rollback <id>` — refusée si des
ventes, factures, encaissements ou projets ont été ajoutés depuis sur ces clients.

## Correspondances

| Rails | Nouveau CRM | Détail |
|---|---|---|
| `users` | Utilisateurs « À revoir » | Rôle visiteur, rôle **suggéré** (voir [permissions](permissions.md)), aucun accès financier, **aucun mot de passe** ni jeton importé, aucun email envoyé. Email déjà présent → rattachement sans modifier ses droits. Avatar copié si présent. |
| `contacts` | Clients + contact principal | statut client → actif, perdu → perdu, prospect → prospect ; société sinon nom ; `offre` → étiquette « Intérêt : … » (ne limite plus les prestations) ; `position` → fonction du contact ; `social` → autre réseau ; `adresse` → adresse de facturation ; lien Drive repris s'il est une URL http(s) valide, sinon conservé en note interne. Même email qu'un client existant → avertissement, jamais de fusion automatique. |
| `notes` | Notes internes du client | Auteur relié, origine « rails:notes ». |
| `suivi_clients` | **Projets** (par défaut) | Référence `LEG-<SOURCE>-0001` ; statut en cours → actif, terminé → terminé, abandonné → annulé ; deadline → deadline client ; collaborateur cité dans la description. Option par fiche : **vidéo** dans un projet archivé « Historique ancien CRM » (sans date de livraison, pour ne pas entrer dans les marges). |
| `suivis` | Notes du projet (ou de la vidéo) | Origine « rails:suivis ». |
| `paiements` | **Historique « À rapprocher »** | Statut et montant `devis` d'origine conservés tels quels, données brutes archivées, facture PDF copiée. **Exclus de tous les totaux** : le champ devis ne prouve ni facture ni encaissement. Qualification manuelle : relier à une facture, à un encaissement, ou archiver. |
| `reglages` | Nom de l'agence + logo | |
| Active Storage | Pièces jointes | Copiées seulement si le fichier existe, avec contrôle de taille et de checksum MD5 ; sinon signalé, aucun lien vers un fichier absent. |

## Rapprochement

Le rapport donne : somme brute des `devis` Rails, somme reprise dans l'historique (doit être égale),
encaissements et factures créés par l'import (toujours 0), et pour chaque table « lus / reliés ».

## Limites connues

- Les références `LEG-…` utilisent les 8 premiers caractères alphanumériques du libellé de source.
- L'annulation d'un import ne rétablit pas le nom/logo de l'agence modifiés par `reglages`.
- Si l'import réel échoue après la copie de fichiers vers le stockage, ces fichiers restent
  orphelins dans le bucket (aucune ligne en base ne les référence).
