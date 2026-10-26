# Workflow vidéo

Source : [src/server/domain/video-workflow.ts](../src/server/domain/video-workflow.ts) (testé dans
`tests/unit/video-workflow.test.ts`). « R » = responsable (administrateur ou responsable de
production), « M » = monteur affecté.

| Étape | Vers | Par |
|---|---|---|
| À préparer | En attente des rushs, À attribuer, Annulée* | R |
| En attente des rushs | À préparer, À attribuer, Annulée* | R |
| À attribuer | Attribuée, En attente des rushs, Annulée* | R |
| Attribuée | En montage (R, M), À attribuer, Annulée* | R |
| En montage | Revue interne (R, M), Annulée* | R |
| Revue interne | Corrections internes, Revue client, Validée, Annulée* | R |
| Corrections internes | En montage, Revue interne (R, M), Annulée* | R |
| Revue client | Corrections client, Validée, Annulée* | R |
| Corrections client | En montage, Revue interne (R, M), Annulée* | R |
| Validée | Livrée, Corrections client** , Annulée* | R |
| Livrée | Archivée, Corrections client** | R |
| Archivée | Livrée | R |
| Annulée | À préparer** | R |

\* motif obligatoire · \*\* réouverture, motif obligatoire et tracée.

Règles complémentaires :

- **Bloquée** est un indicateur séparé (motif + responsable) : la vidéo garde son étape.
- Déposer une version passe automatiquement la vidéo en revue interne ; chaque version est
  numérotée, avec catégorie et origine des changements (retouche client incluse, hors périmètre,
  erreur de production).
- « Attribuée » exige au moins une mission active.
- Un monteur ne passe en revue interne qu'après avoir déposé une version, et seulement sur ses
  vidéos.
- Livrer exige un lien ou document final **et** une validation enregistrée ; à défaut, le
  responsable peut livrer par exception avec un motif (tracé comme dérogation).
- Annuler une vidéo vendue demande le traitement de son revenu (maintenu ou annulé ; la
  réaffectation aux autres vidéos se fait depuis la vente). Seuls les coûts encore estimés sont
  annulés automatiquement ; les coûts engagés restent à traiter explicitement.
- Déplacer une deadline client exige un motif ; chaque changement est historisé.
- Aucune transition de production ne crée de facture ni d'encaissement.

## Actions groupées (tableau des vidéos et fiche projet)

- La sélection propose uniquement les étapes que le workflow autorise pour au moins une vidéo
  sélectionnée, avec leur couverture (ex. « En validation interne · 7/7 ») ; le motif n'est demandé
  que si l'un des passages l'exige. Chaque vidéo est contrôlée une à une (droits + workflow) ; les
  refus sont regroupés par motif et les vidéos refusées restent sélectionnées. 200 vidéos au plus
  par changement d'étape, 500 pour la priorité (qui ne touche pas les vidéos clôturées et est
  tracée dans le journal d'audit).
- **Étape forcée** : un administrateur peut placer une vidéo à une étape absente du tableau
  ci-dessus, avec un motif obligatoire. Le passage est enregistré comme exception
  (`isOverride`, audit `video.force_status`). Les garde-fous de données restent appliqués
  (« Attribuée » exige une mission, la livraison sans lien final ni validation est une dérogation).
  Revenir avant « Validée » ou « Livrée » efface les dates de validation et de livraison.
- **Attribution groupée** : un prestataire pour plusieurs vidéos, une mission (et un coût) par
  vidéo au même tarif figé ; les vidéos clôturées ou déjà confiées à ce prestataire pour le même
  rôle sont ignorées ; une seule notification récapitulative au monteur. Un même prestataire ne
  peut pas avoir deux missions actives du même rôle sur une vidéo (verrou contre le double clic).

## Échéance des missions

Une mission prend l'échéance saisie, sinon la deadline interne de sa vidéo, sinon sa deadline
client : une vidéo planifiée par l'agence apparaît toujours au planning du monteur (qui ne voit
jamais la deadline client en tant que telle). Quand l'échéance de la vidéo est déplacée, les
missions en cours qui la suivaient se déplacent avec elle (historique « Suit l'échéance de la
vidéo »). Une mission en retard compte dans la charge du monteur.

Un projet ne peut passer « Terminé » ou « Archivé » tant que des vidéos sont en production.
