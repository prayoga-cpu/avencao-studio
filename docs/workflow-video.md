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
