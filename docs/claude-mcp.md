# Claude dans le CRM (serveur MCP)

Chaque personne utilise le CRM avec **son propre compte Claude** (claude.ai, Claude Desktop,
Claude Code) : le CRM n'appelle aucune API d'IA, n'a besoin d'aucune clé et ne paie aucun usage.
Claude agit **avec exactement les droits de l'utilisateur** (mêmes filtres que les écrans : un
responsable sans accès financier ne voit ni prix, ni marge, ni tarif de monteur, et ne peut rien
enregistrer en finances). Les monteurs, clients et visiteurs n'y ont pas accès (permission
`assistant.use` : administrateurs et responsables de production).

- **Lecture** (par défaut) : Claude consulte clients, prospection, projets, vidéos, monteurs,
  planning et finances autorisées.
- **Écriture** (sur autorisation explicite de l'utilisateur, portée `crm:write`) : Claude enregistre
  dans le CRM ce qu'il lit dans un document (facture PDF, reçu, devis signé, brief, email) ou ce que
  l'utilisateur tape (« nouvelle mission pour X : 3 reels à 450 € chacun, livraison le 15/11 »).

## 1. Connecter Claude au CRM (MCP)

Page **Claude & MCP** (`/claude`) : adresse du serveur, instructions, applications connectées et
jetons personnels (avec leur accès « Lecture seule » ou « Lecture + écriture »), outils disponibles,
activité de Claude. Adresse du serveur : `https://www.avencao.io/api/mcp`.

| Application | Connexion |
|---|---|
| claude.ai / Claude Desktop | Paramètres › Connecteurs › « Ajouter un connecteur personnalisé » → URL du serveur → « Se connecter » → page Avencao → cocher « création et modification » si Claude doit enregistrer → « Autoriser ». |
| Claude Code | `claude mcp add --transport http avencao https://www.avencao.io/api/mcp`, puis `/mcp` pour s'authentifier (même page d'autorisation). |
| Script / serveur sans navigateur | Jeton personnel créé sur `/claude` (case « création et modification » au besoin), envoyé en `Authorization: Bearer avc_pat_…`. |

Une connexion existante passe de « Lecture seule » à « Lecture + écriture » (et inversement) sur
`/claude`, bouton « Autoriser l'écriture » / « Passer en lecture seule », sans reconnexion ; Claude
voit les nouveaux outils dans une nouvelle conversation.

### Sécurité

- **OAuth 2.1** : enregistrement dynamique (RFC 7591) limité aux adresses de retour de Claude
  (`claude.ai`, `claude.com`) et aux adresses locales (`localhost`, `127.0.0.1`) ; autres hôtes via
  `MCP_OAUTH_REDIRECT_HOSTS`. PKCE S256 obligatoire, code à usage unique (5 min), écran d'accord
  explicite (compte, rôle, données visibles, écriture à cocher, adresse de retour).
- **Portées** : `crm:read` toujours ; `crm:write` seulement si l'utilisateur coche « création et
  modification » (écran d'accord, jeton personnel ou bouton sur `/claude`). La portée est conservée
  au rafraîchissement et revérifiée à chaque appel : sans elle, aucun outil d'écriture n'est proposé.
- Jeton d'accès 1 h ; jeton de rafraîchissement 30 jours **à rotation** : présenter un ancien jeton
  révoque toute l'autorisation (détection de vol).
- Seules les **empreintes SHA-256** des jetons et secrets sont stockées. Jeton personnel affiché une
  seule fois, 30 / 90 / 365 jours, 10 actifs maximum, révocable.
- Chaque appel recharge l'utilisateur : compte désactivé ou rôle modifié = effet immédiat.
- Révocation : page `/claude` (« Déconnecter », « Révoquer ») ou point d'accès RFC 7009.
- Nettoyage quotidien (job `reminders.scan`) des codes, jetons et liens de dépôt expirés.

### Points d'accès

| Chemin | Rôle |
|---|---|
| `POST /api/mcp` | Serveur MCP (Streamable HTTP, sans état). 401 + `WWW-Authenticate: resource_metadata=…, scope="crm:read crm:write"` sans jeton. |
| `/.well-known/oauth-protected-resource[/api/mcp]` | Métadonnées de ressource (RFC 9728). |
| `/.well-known/oauth-authorization-server` | Métadonnées du serveur d'autorisation (RFC 8414). |
| `/oauth/autoriser` | Écran d'accord (connexion requise, retour automatique après connexion). |
| `POST /api/oauth/register`, `/api/oauth/token`, `/api/oauth/revoke` | Enregistrement, jetons, révocation. |
| `/depot/<lien>` | Page publique de dépôt de la pièce d'origine (lien à usage unique, 24 h). |
| `PUT` / `POST /api/mcp/upload/<lien>` | Envoi du fichier : contenu brut (`curl -T fichier.pdf <lien>`, nom en `?nom=…`) ou multipart (`file`). |

## 2. Outils

Code : [src/server/ai/tools.ts](../src/server/ai/tools.ts) (registre, lectures, exécution),
[write-tools-finance.ts](../src/server/ai/write-tools-finance.ts) et
[write-tools-crm.ts](../src/server/ai/write-tools-crm.ts). Chaque outil déclare sa permission
(liste filtrée par rôle, revérifiée à l'exécution), revalide son entrée et renvoie des liens vers les
fiches du CRM. Les écritures passent par les **services du CRM** (mêmes contrôles que les écrans).

### Lecture (18)

`get_context`, `get_reference_data` (catégories de charges, catalogue, modèles de projet, équipe,
taux de change, réglages), `get_dashboard_overview`, `search_clients`, `get_client`,
`search_projects`, `get_project`, `search_videos`, `get_video`, `list_editors`, `get_planning`,
`list_opportunities`, `search_invoices`*, `get_invoice`*, `get_receivables`*, `search_costs`*,
`search_expenses`*, `run_report` (*accès financier).

### Écriture (32, portée `crm:write`)

| Document ou demande | Outils |
|---|---|
| Nouvelle mission tapée ou devis/brief (client + projet + vidéos + prix + monteurs, **une seule validation**) | `create_mission` |
| Facture client (outil de facturation) | `record_client_invoice` (toujours en **brouillon**), `update_draft_invoice` |
| Encaissement (relevé, avis de virement) | `record_client_payment` (affectation aux factures émises) |
| Devis signé, bon de commande | `create_sales_order`, `set_project_price` |
| Facture de monteur | `search_costs` puis `set_cost_amount` (missions « à renseigner »), `record_direct_cost` |
| Règlement d'un monteur | `record_supplier_payment` (coûts **validés** uniquement) |
| Reçu, abonnement, frais généraux | `record_expense` (catégorie via `get_reference_data`) |
| Clients et prospection | `create_client`, `update_client`, `save_contact`, `add_note`, `log_activity`, `create_opportunity`, `update_opportunity`, `convert_opportunity_to_project` |
| Production | `create_project`, `update_project`, `create_videos`, `update_video`, `add_video_link`, `add_video_feedback`, `transition_video`, `set_video_blocked`, `create_change_request`, `assign_editor` |
| Monteurs | `create_editor`, `update_editor`, `add_editor_unavailability` |
| Pièce d'origine | `create_upload_link` (les outils de finances renvoient déjà le lien) |

### Garde-fous

1. **Accord dans Claude** : les outils d'écriture sont annotés `readOnlyHint: false` (et
   `destructiveHint: true` pour les modifications et changements d'étape) : Claude demande l'accord
   avant chaque écriture. Les instructions du serveur lui imposent aussi de montrer d'abord les
   valeurs extraites et de ne jamais inventer un montant, une date ou un taux de TVA.
2. **Réversible** : facture toujours en brouillon (numéro et dates repris dans « Marquer émise »),
   coût au plus « engagé » (jamais validé, un coût validé n'est jamais corrigé), étape de vidéo
   jamais forcée. Aucun outil ne supprime, n'annule, n'émet, ne valide ni n'archive : ces actions
   restent dans le CRM. Hors périmètre : avoirs, remboursements, tarifs des monteurs, réglages,
   utilisateurs.
3. **Doublons** : chaque création cherche d'abord les doublons probables (n° de facture, n° de pièce
   fournisseur `documentRef`, même client/date/montant, même nom ou email…) et renvoie
   `possible_duplicates` **sans rien écrire** ; Claude ne recommence qu'avec `confirm_duplicate`
   après confirmation de l'utilisateur.
4. **Étapes multiples** (`create_mission`, `create_videos`, `assign_editor`) : tout est vérifié avant
   la première écriture (droits, entrées, monteurs actifs, taux de change) ; en cas d'échec en cours
   de route, le résultat `partial` liste ce qui est déjà enregistré et l'étape à reprendre.
5. **Journal** : toutes les entrées du journal d'audit écrites pendant un appel de Claude portent
   `via = "MCP"` et le jeton utilisé ; chaque écriture ajoute `mcp.tool.<outil>` (éléments créés,
   entrée). Section « Activité de Claude » sur `/claude` (ses écritures ; toutes pour un administrateur).

### Pièce d'origine (lien de dépôt)

Dans claude.ai, Claude lit le PDF mais ne peut pas en transmettre le fichier au CRM. Après une
création, il remet un **lien de dépôt** (`attach.url`, usage unique, 24 h) : la personne l'ouvre
(téléphone compris, sans connexion) et dépose le fichier, rattaché à l'élément (PDF de la facture,
justificatif de l'encaissement ou du règlement, pièce du coût ou de la charge, document du projet…).
Claude Code l'envoie lui-même : `curl -T facture.pdf <attach.upload_url>`. Contrôles : droits de
l'utilisateur revérifiés, type réel (PDF, PNG, JPEG, WebP) et taille (`maxUploadMb` ; ~4 Mo sur
Vercel, limite du corps de requête). Lien libéré si le fichier est refusé.

## 3. Bouton « Demander à Claude » (toutes les pages)

En bas à droite : panneau ouvert, **réduit** (le brouillon est conservé) ou fermé ; état mémorisé
dans le navigateur. La question (avec, au choix, l'adresse de la page ouverte pour que Claude sache
de quelle fiche il s'agit) s'ouvre dans une nouvelle conversation claude.ai (`claude.ai/new?q=…`)
et est **aussi copiée** dans le presse-papiers (à coller si elle n'apparaît pas, ou dans Claude
Desktop / Claude Code). Le panneau indique si Claude est déjà connecté au CRM, sinon renvoie vers
`/claude`. Questions récentes mémorisées localement (5).

Aucune donnée n'est envoyée à une IA par le CRM lui-même : c'est Claude, avec le compte de
l'utilisateur, qui appelle les outils MCP.

## Tests

- `tests/unit/claude-mcp.test.ts` : adresses de retour, PKCE (vecteur RFC 7636), retour après
  connexion, construction de la question et du lien Claude (FR/EN), portées.
- `tests/integration/claude-mcp.test.ts` : flux OAuth complet (rotation, réutilisation, client
  confidentiel, compte désactivé), jetons personnels, état « connecté », droits des outils,
  `/api/mcp` en lecture seule.
- `tests/integration/claude-mcp-write.test.ts` : portée d'écriture (accord, rafraîchissement,
  bascule), outils proposés par rôle et portée, factures en brouillon et doublons, encaissement,
  charges, coûts jamais validés, `create_mission`, mises à jour partielles, journal `via = "MCP"`,
  liens de dépôt (usage unique, expiration, envoi direct), `/api/mcp` avec écriture.
