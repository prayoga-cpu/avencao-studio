# Fonctionnalités : disponibles, partielles, différées

État au 26/10/2026. « Disponible » = utilisable de bout en bout dans l'interface, contrôlé côté
serveur. Rien n'est simulé : une fonction absente est indiquée comme telle.

## Disponible

| Module | Contenu |
|---|---|
| Accès | Connexion, déconnexion, limitation des tentatives, inscription publique fermée, invitations (lien 72 h), réinitialisation (lien 24 h), révocation des sessions au changement de rôle ou à la désactivation, protection du dernier administrateur. |
| Utilisateurs | Rôles (administrateur, responsable de production, monteur), accès financier optionnel, comptes importés « À revoir » avec rôle suggéré. |
| Clients | Liste (recherche, filtres, pagination), fiche à onglets (aperçu, projets, vidéos, finances, notes, documents), contacts, étiquettes, activités, notes internes / réservées aux administrateurs, détection de doublons (email, TVA, SIRET, téléphone — jamais le nom), import CSV avec aperçu. |
| Prospection | Pipeline glisser-déposer, prévision pondérée (affichée comme prévisionnelle), activités et relances, conversion en projet (sans facture ni encaissement). |
| Projets | Modèles (vidéos + checklist), création, deadlines historisées, notes, documents, rentabilité du projet, prix du projet (forfait global réparti automatiquement ou prix par vidéo), vidéos sélectionnables (attribution et étape groupées). |
| Vidéos | Tableau (tri, sélection, actions groupées limitées aux étapes autorisées, étape forcée par un administrateur, attribution groupée, sélection aussi sur mobile), kanban glisser-déposer, vues (à attribuer, à valider, en retard, bloquées, mes vidéos), création en lot, workflow complet, blocage, liens (visibles ou non du monteur), versions et revues, retours, checklist, temps passé, retouches hors périmètre (acceptation → vente + coût), historique. |
| Monteurs | Profils, grilles tarifaires (EUR / IDR / USD ; vidéo, heure, jour, minute finale, enveloppe), indisponibilités, charge et capacité, appréciation privée. |
| Affectations | Aperçu avant affectation : coût, marge avant/après, seuil, charge du monteur ; tarif figé ; validation et annulation des missions. |
| Portail monteur | Mes missions (brief, liens autorisés, retours, dépôt de versions, checklist, temps), ma rémunération, mes règlements et justificatifs. Sans prix de vente ni marges. |
| Planning | Mois, semaine, liste (agenda sur mobile) ; déplacement de deadline avec motif ; missions sans date affichées à l'échéance de leur vidéo. |
| Ventes | Ventes acceptées multi-lignes, allocation égale / pondérée / manuelle exacte au centime, réaffectation, annulation partielle ou totale tracée. |
| Factures | Brouillon, émission (numéro, échéance, PDF joint), acompte puis facture finale avec déduction, annulation de brouillon, avoirs, ancienneté des créances. |
| Encaissements | Saisie (devise, taux, frais, justificatif), affectations partielles, contre-passation, annulation tracée, remboursements, plafonds garantis en cas de saisie simultanée. |
| Coûts et règlements | Coûts directs (estimé → engagé → validé), allocation aux vidéos, règlements prestataires multi-coûts, écarts de change, dettes par monteur et par devise. |
| Charges | Charges de structure par catégorie, rattachement mensuel, TVA récupérable ou non, paiement, annulation avec motif. |
| Forfaits | Contrats mensuels, quotas par type, périodes (manuelles ou automatiques), report des crédits, consommation par vidéo, facture brouillon optionnelle. |
| Pilotage | Tableau de bord (actions prioritaires, production, indicateurs financiers avec variation, graphiques, capacité), 9 rapports avec définitions, exports CSV (Excel FR). |
| Notifications | Centre de notifications, préférences, rappels automatiques (worker), emails si un canal est configuré. |
| Réglages | Agence (logo, fuseau, seuil de marge, temps du dirigeant, règles de révisions et d'erreurs, arrondi minute…), catalogue, modèles, checklist, taux de change, catégories, journal d'import. |
| Reprise Rails | Import simulé puis réel, relançable, annulable ; historique de paiements « à rapprocher » et qualification manuelle. |
| Exploitation | Worker pg-boss, cron sécurisé, sauvegarde/restauration testées, Dockerfile et Compose, contrôle de configuration. |

## Partiel

| Sujet | État |
|---|---|
| Emails | Fonctionnels via Resend/SMTP dès que l'adresse d'envoi est sur un domaine vérifié ; sinon les liens d'invitation sont à copier. |
| Journal d'audit | Toutes les écritures sensibles sont enregistrées (auteur, motif, avant/après) ; pas encore d'écran de consultation dédié (requête SQL). |
| Charges récurrentes | La récurrence est une information ; la charge du mois suivant n'est pas créée automatiquement. |
| Revenu des forfaits | La période de forfait est vendue et facturable ; son revenu n'est pas réparti automatiquement sur les vidéos qui consomment les crédits. |
| Prix spécifiques client | Modèle de données présent ; pas d'écran de saisie ni de pré-remplissage des ventes. |
| Déploiement Docker | Images construites en intégration continue ; déploiement de référence sur Vercel + Supabase. |

## Claude

| Fonction | État |
|---|---|
| Serveur MCP (claude.ai, Claude Desktop, Claude Code) | Disponible : OAuth 2.1 + jetons personnels, 14 outils en lecture seule. |
| Bouton « Demander à Claude » (ouvrir / réduire / fermer) | Disponible : la question s'ouvre dans le compte Claude de l'utilisateur ; aucune clé d'API ni coût côté CRM. |

## Différé (phase 2 ou décision nécessaire)

| Sujet | Raison |
|---|---|
| Portail client (validation des versions par le client) | Rôle prévu, aucun accès ouvert. |
| Devis structurés (lignes, PDF, acceptation en ligne) | La prospection porte montant et probabilité ; la vente est saisie à l'acceptation. |
| Émission de factures légales (PDF généré, numérotation légale, Factur-X) | Le CRM suit les factures et leurs PDF ; l'outil de facturation reste la référence. |
| Intégrations (Frame.io, API Drive, Google Agenda, WhatsApp, banque, export comptable) | Liens uniquement ; aucune synchronisation simulée. |
| Double authentification | Possible via un plugin Better Auth. |
| Rapprochement bancaire | Le flux de trésorerie n'est pas un solde bancaire. |
