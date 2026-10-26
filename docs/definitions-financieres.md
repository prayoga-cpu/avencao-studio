# Définitions financières

Chaque indicateur a **une seule source** et **une seule date**. Les agrégations se font source par
source puis sont combinées (jamais de jointure qui multiplierait les montants). Tous les montants de
pilotage sont en EUR, au taux figé de chaque opération. Ces indicateurs sont des **mesures de
gestion** : ni bénéfice fiscal, ni chiffre d'affaires comptable légal.

| Indicateur | Source unique | Date | Remarques |
|---|---|---|---|
| Ventes signées HT | Lignes de ventes acceptées − annulations | Acceptation (annulation à sa date) | Les devis non acceptés restent en prospection (prévisionnel pondéré, affiché séparément). |
| CA facturé HT net | Factures émises − avoirs émis (HT) | Émission | Brouillons et factures annulées exclus. Une facture finale déduit l'acompte facturé : jamais de double comptage. |
| CA de gestion livré | Allocations de ventes des vidéos livrées | Livraison | Inclut les vidéos annulées dont le revenu est maintenu (à la date d'annulation). |
| Encaissements (TTC) | Encaissements enregistrés (non annulés) | Règlement | Trésorerie, jamais présentée comme CA HT. |
| Créances clients | Factures émises − affectations + remboursements | Jour de consultation | Ancienneté : à échoir, 1–30, 31–60, 61–90, > 90 jours. |
| Coûts directs | Coûts (missions, achats, frais) et leurs allocations | Livraison du livrable | Étapes estimé → engagé → validé ; « payé » est dérivé des règlements. Coût inconnu = « à renseigner », jamais 0. |
| Dettes monteurs | Coûts validés − règlements affectés | Jour de consultation | Par devise d'origine + contre-valeur EUR. |
| Charges de structure | Charges non annulées | Mois de rattachement | Paiement indépendant du rattachement. |
| Marge directe | Revenu alloué − coûts directs du même périmètre | — | « Prévisionnelle » si des coûts ne sont pas validés, « provisoire » si un coût manque, « finale » sinon. |
| Taux de marge | Marge / revenu × 100 | — | Revenu nul → « non calculable », jamais 0 %. |
| Résultat de gestion estimé, avant fiscalité | CA livré − coûts directs de ces livrables − charges − enveloppes non allouées − frais de paiement − écarts de change | Période | Présenté avant et après valorisation du temps du dirigeant (réglage). |
| Flux net de trésorerie | Encaissements − remboursements − règlements prestataires − charges payées − frais | Date du mouvement | Pas un solde bancaire (aucun solde initial ni rapprochement). |

## Allocation du revenu

Une ligne de vente est répartie sur ses vidéos : **égale**, **pondérée** (poids) ou **manuelle**.
L'arrondi se fait au centime dans la devise de la vente avec la méthode du plus grand reste : la
somme des parts est toujours exactement égale au montant vendu. La contre-valeur EUR est répartie
de la même façon (pas de reconversion part par part).

Annulation d'une vidéo vendue : l'utilisateur choisit explicitement (1) revenu maintenu
(dédommagement dû) ou (2) revenu annulé sur la ligne. Depuis la vente, une part peut aussi être
annulée ou réaffectée aux autres vidéos de la ligne (au prorata ou manuellement). Rien n'est supprimé ; la ligne garde la trace du montant annulé et de sa date.

### Prix d'un projet entier

Le bouton « Prix du projet » (fiche projet) enregistre une vente acceptée d'une ligne, rattachée
au projet — la vente reste la source unique du chiffre d'affaires :

- **Forfait global** : quantité 1, ligne « répartie automatiquement ». Le net restant est réparti à
  parts égales sur toutes les vidéos non annulées du projet, et recalculé à chaque ajout, annulation
  ou réouverture de vidéo (audit `sales.auto_reallocate`). Une vidéo annulée avec revenu maintenu
  rend sa part aux autres vidéos ; avec revenu annulé, sa part est retirée de la vente.
- **Prix par vidéo** : quantité = vidéos actives, prix unitaire figé, réparti sur ces vidéos. Une
  vidéo ajoutée ensuite fait l'objet d'une nouvelle vente (le prix accepté n'est jamais réécrit).

Une répartition manuelle (pondérée ou en montants) désactive la répartition automatique ; elle se
réactive depuis la vente (« Répartir » › « Répartition automatique (forfait) »).

## Coûts des missions

| Mode | Calcul |
|---|---|
| Par vidéo / heure / jour | quantité × prix figé à l'affectation |
| Par minute finale | minutes facturables × prix ; arrondi au réglage (seconde exacte, demi-minute ou minute supérieure). Durée finale absente → estimation sur la durée prévue, marquée « estimé ». |
| Enveloppe mensuelle | coût porté par l'enveloppe, réparti explicitement ; la part non allouée reste visible dans le résultat |
| Tarif absent | coût « à renseigner » (bloquant pour la validation) |

Le tarif est **figé** au moment de l'affectation : modifier une grille tarifaire ne réécrit jamais
les missions passées.

## Devises et taux

Les taux sont exprimés en « unités pour 1 € » (ex. 17 500 IDR). Chaque opération conserve :
montant d'origine, devise, taux, date et source du taux (identité EUR, saisi manuellement, ou table
de référence ≤ date). Un règlement dans la même devise qu'un coût à un taux différent produit un
**écart de change** explicite (intégré au résultat de gestion), jamais une correction silencieuse.

## TVA

La rentabilité est calculée hors TVA récupérable. Le réglage « TVA non récupérable intégrée au coût »
ajoute la TVA d'une charge non récupérable à son coût. Aucun régime fiscal n'est présumé.

## Corrections

Aucune donnée financière n'est effacée : facture émise → avoir ; encaissement erroné → annulation
tracée (statut « annulé », affectations contre-passées) ; affectation → contre-passation ; charge →
annulation avec motif. Chaque écriture sensible est journalisée (auteur, date, motif, avant/après).
