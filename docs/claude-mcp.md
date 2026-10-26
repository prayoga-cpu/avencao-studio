# Claude dans le CRM (serveur MCP)

Chaque personne interroge le CRM avec **son propre compte Claude** (claude.ai, Claude Desktop,
Claude Code) : le CRM n'appelle aucune API d'IA, n'a besoin d'aucune clé et ne paie aucun usage.
Claude lit le CRM **en lecture seule** et **avec exactement les droits
de l'utilisateur** (mêmes filtres que les écrans : un responsable sans accès financier ne voit ni
prix, ni marge, ni tarif de monteur). Les monteurs, clients et visiteurs n'y ont pas accès
(permission `assistant.use` : administrateurs et responsables de production).

## 1. Connecter Claude au CRM (MCP)

Page **Claude & MCP** (`/claude`) : adresse du serveur, instructions, applications connectées,
jetons personnels. Adresse du serveur : `https://www.avencao.io/api/mcp`.

| Application | Connexion |
|---|---|
| claude.ai / Claude Desktop | Paramètres › Connecteurs › « Ajouter un connecteur personnalisé » → URL du serveur → « Se connecter » → page Avencao → « Autoriser ». |
| Claude Code | `claude mcp add --transport http avencao https://www.avencao.io/api/mcp`, puis `/mcp` pour s'authentifier (même page d'autorisation). |
| Script / serveur sans navigateur | Jeton personnel créé sur `/claude`, envoyé en `Authorization: Bearer avc_pat_…`. |

### Sécurité

- **OAuth 2.1** : enregistrement dynamique (RFC 7591) limité aux adresses de retour de Claude
  (`claude.ai`, `claude.com`) et aux adresses locales (`localhost`, `127.0.0.1`) ; autres hôtes via
  `MCP_OAUTH_REDIRECT_HOSTS`. PKCE S256 obligatoire, code à usage unique (5 min), écran d'accord
  explicite (compte, rôle, données visibles, adresse de retour).
- Jeton d'accès 1 h ; jeton de rafraîchissement 30 jours **à rotation** : présenter un ancien jeton
  révoque toute l'autorisation (détection de vol).
- Seules les **empreintes SHA-256** des jetons et secrets sont stockées. Jeton personnel affiché une
  seule fois, 30 / 90 / 365 jours, 10 actifs maximum, révocable.
- Chaque appel recharge l'utilisateur : compte désactivé ou rôle modifié = effet immédiat.
- Révocation : page `/claude` (« Déconnecter », « Révoquer ») ou point d'accès RFC 7009.
- Nettoyage quotidien (job `reminders.scan`) des codes et jetons expirés.

### Points d'accès

| Chemin | Rôle |
|---|---|
| `POST /api/mcp` | Serveur MCP (Streamable HTTP, sans état). 401 + `WWW-Authenticate: resource_metadata=…` sans jeton. |
| `/.well-known/oauth-protected-resource[/api/mcp]` | Métadonnées de ressource (RFC 9728). |
| `/.well-known/oauth-authorization-server` | Métadonnées du serveur d'autorisation (RFC 8414). |
| `/oauth/autoriser` | Écran d'accord (connexion requise, retour automatique après connexion). |
| `POST /api/oauth/register`, `/api/oauth/token`, `/api/oauth/revoke` | Enregistrement, jetons, révocation. |

### Outils (lecture seule)

`get_context`, `get_dashboard_overview`, `search_clients`, `get_client`, `search_projects`,
`get_project`, `search_videos`, `get_video`, `list_editors`, `get_planning`, `list_opportunities`,
`search_invoices`*, `get_receivables`*, `run_report` (*accès financier). Code :
[src/server/ai/tools.ts](../src/server/ai/tools.ts) — chaque outil déclare sa permission, revalide
son entrée et ne renvoie que des champs choisis, avec un lien vers la fiche du CRM.

## 2. Bouton « Demander à Claude » (toutes les pages)

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
  connexion, construction de la question et du lien Claude (FR/EN).
- `tests/integration/claude-mcp.test.ts` : flux OAuth complet (rotation, réutilisation, client
  confidentiel, compte désactivé), jetons personnels, état « connecté », droits des outils,
  `/api/mcp`.
