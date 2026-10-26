import "server-only";
/**
 * Accès de Claude au CRM (serveur MCP) : serveur d'autorisation OAuth 2.1 minimal et jetons.
 *
 * - Enregistrement dynamique des clients (RFC 7591), limité aux adresses de retour de Claude
 *   (claude.ai, claude.com) et aux adresses locales (Claude Code, Claude Desktop) ;
 * - code d'autorisation à usage unique (5 min) avec PKCE S256 obligatoire, délivré seulement
 *   après accord explicite de l'utilisateur connecté ;
 * - jeton d'accès 1 h, jeton de rafraîchissement 30 jours à rotation (réutilisation d'un ancien
 *   jeton = révocation de toute l'autorisation) ;
 * - jetons personnels (Claude Code, scripts) créés et révoqués par l'utilisateur.
 * Seules les empreintes SHA-256 des secrets sont stockées. Lecture seule (portée crm:read).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { publicAppUrl, trustedOrigins } from "../app-url";
import { recordAudit } from "../audit";
import { loadActor } from "../auth/actor";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { can, type Actor } from "../policies";

export const MCP_SCOPE = "crm:read";
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_S = 5 * 60;
export const PERSONAL_TOKEN_DAYS = [30, 90, 365] as const;
/** Mise à jour de « dernière utilisation » au plus toutes les 5 minutes (évite une écriture par appel). */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

type Env = Record<string, string | undefined>;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomSecret = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;
const displayPrefix = (token: string) => token.slice(0, token.indexOf("_", 4) + 5);

export function mcpResourceUrl(env: Env = process.env): string {
  return `${publicAppUrl(env)}/api/mcp`;
}

export function protectedResourceMetadataUrl(env: Env = process.env): string {
  return `${publicAppUrl(env)}/.well-known/oauth-protected-resource/api/mcp`;
}

export function authorizationServerMetadata(env: Env = process.env) {
  const base = publicAppUrl(env);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/autoriser`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [MCP_SCOPE],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/claude`,
  };
}

export function protectedResourceMetadata(env: Env = process.env) {
  return {
    resource: mcpResourceUrl(env),
    authorization_servers: [publicAppUrl(env)],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
    resource_name: "Avencao CRM",
    resource_documentation: `${publicAppUrl(env)}/claude`,
  };
}

// ───────────────────────────── Adresses de retour ─────────────────────────────

const CLAUDE_REDIRECT_HOSTS = ["claude.ai", "claude.com"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Adresse de retour acceptée à l'enregistrement : applications Claude ou adresse locale. */
export function isAllowedRedirectUri(uri: string, env: Env = process.env): boolean {
  if (uri.length > 500) return false;
  const url = parseUrl(uri);
  if (!url || url.hash || url.username || url.password) return false;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return true;
  if (url.protocol !== "https:") return false;
  const extra = (env.MCP_OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...CLAUDE_REDIRECT_HOSTS, ...extra].includes(url.hostname.toLowerCase());
}

/** Correspondance exacte ; pour une adresse locale, le port peut varier (RFC 8252 §7.3). */
export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  const a = parseUrl(registered);
  const b = parseUrl(requested);
  if (!a || !b || a.protocol !== "http:" || !LOOPBACK_HOSTS.has(a.hostname)) return false;
  return a.hostname === b.hostname && a.protocol === b.protocol && a.pathname === b.pathname && a.search === b.search;
}

// ───────────────────────────── PKCE ─────────────────────────────

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(pkceChallenge(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeEqualHash(secret: string, hash: string): boolean {
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────────────────────────── Enregistrement des clients ─────────────────────────────

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly description: string,
    public readonly status = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

export async function registerClient(body: unknown) {
  if (!body || typeof body !== "object") throw new OAuthError("invalid_client_metadata", "JSON body expected.");
  const meta = body as Record<string, unknown>;
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0 || redirectUris.length > 10) throw new OAuthError("invalid_redirect_uri", "Between 1 and 10 redirect_uris are required.");
  const refused = redirectUris.filter((u) => !isAllowedRedirectUri(u));
  if (refused.length) {
    throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${refused[0]}. Only Claude applications and local addresses can connect.`);
  }
  const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types : ["authorization_code"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  }
  const responseTypes = Array.isArray(meta.response_types) ? meta.response_types : ["code"];
  if (responseTypes.some((r) => r !== "code")) throw new OAuthError("invalid_client_metadata", "Only the 'code' response type is supported.");
  const authMethod = typeof meta.token_endpoint_auth_method === "string" ? meta.token_endpoint_auth_method : "client_secret_basic";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    throw new OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method.");
  }
  const name = (typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim() : "Application MCP").slice(0, 100);
  const clientId = randomSecret("avc_client").slice(0, 40);
  const clientSecret = authMethod === "none" ? null : randomSecret("avc_secret");
  const client = await prisma.mcpClient.create({
    data: { clientId, name, redirectUris, clientSecretHash: clientSecret ? sha256(clientSecret) : null },
  });
  return {
    client_id: client.clientId,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: authMethod,
    scope: MCP_SCOPE,
  };
}

// ───────────────────────────── Autorisation ─────────────────────────────

export interface AuthorizeParams {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

export type AuthorizeCheck =
  | { ok: true; client: { id: string; clientId: string; name: string }; redirectUri: string; codeChallenge: string; state: string | null; resource: string | null }
  /** Erreur affichée à l'utilisateur (client ou adresse de retour inconnus : jamais de redirection). */
  | { ok: false; fatal: true; message: string }
  /** Erreur renvoyée à l'application (adresse de retour vérifiée). */
  | { ok: false; fatal: false; redirectTo: string };

function resourceIsOurs(resource: string, env: Env = process.env): boolean {
  const url = parseUrl(resource);
  if (!url) return false;
  const origins = new Set([publicAppUrl(env), ...trustedOrigins(env)]);
  return origins.has(url.origin) && ["/api/mcp", "/api/mcp/", "/", ""].includes(url.pathname);
}

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", publicAppUrl());
  return url.toString();
}

export async function checkAuthorizeRequest(p: AuthorizeParams): Promise<AuthorizeCheck> {
  if (!p.client_id) return { ok: false, fatal: true, message: "Application inconnue (client_id manquant)." };
  const client = await prisma.mcpClient.findUnique({ where: { clientId: p.client_id }, select: { id: true, clientId: true, name: true, redirectUris: true } });
  if (!client) return { ok: false, fatal: true, message: "Application inconnue : reconnectez Claude au CRM." };
  let redirectUri: string | null = null;
  if (p.redirect_uri) {
    redirectUri = client.redirectUris.some((r) => redirectUriMatches(r, p.redirect_uri!)) ? p.redirect_uri : null;
  } else if (client.redirectUris.length === 1) {
    redirectUri = client.redirectUris[0];
  }
  if (!redirectUri) return { ok: false, fatal: true, message: "Adresse de retour non enregistrée pour cette application." };
  const state = p.state ?? null;
  const fail = (error: string, description: string): AuthorizeCheck => ({ ok: false, fatal: false, redirectTo: errorRedirect(redirectUri!, error, description, state) });
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (!p.code_challenge || p.code_challenge_method !== "S256" || !/^[A-Za-z0-9\-_]{43,128}$/.test(p.code_challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (p.resource && !resourceIsOurs(p.resource)) return fail("invalid_target", "Unknown resource.");
  return { ok: true, client: { id: client.id, clientId: client.clientId, name: client.name }, redirectUri, codeChallenge: p.code_challenge, state, resource: p.resource ?? null };
}

/** Après accord explicite de l'utilisateur : code à usage unique et adresse de retour. */
export async function approveAuthorization(actor: Actor, check: Extract<AuthorizeCheck, { ok: true }>): Promise<string> {
  if (!can(actor, "assistant.use")) throw new DomainError("Votre rôle ne permet pas de connecter Claude au CRM.");
  const code = randomSecret("avc_code");
  await prisma.mcpAuthCode.create({
    data: {
      codeHash: sha256(code),
      mcpClientId: check.client.id,
      userId: actor.id,
      redirectUri: check.redirectUri,
      codeChallenge: check.codeChallenge,
      scope: MCP_SCOPE,
      resource: check.resource,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_S * 1000),
    },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "mcp.authorize", entityType: "McpClient", entityId: check.client.id, after: { client: check.client.name } });
  const url = new URL(check.redirectUri);
  url.searchParams.set("code", code);
  if (check.state) url.searchParams.set("state", check.state);
  url.searchParams.set("iss", publicAppUrl());
  return url.toString();
}

// ───────────────────────────── Jetons ─────────────────────────────

async function issueTokenPair(userId: string, mcpClientId: string, grantId: string) {
  const accessToken = randomSecret("avc_at");
  const refreshToken = randomSecret("avc_rt");
  const now = Date.now();
  await prisma.mcpToken.createMany({
    data: [
      { kind: "OAUTH_ACCESS", userId, mcpClientId, grantId, tokenHash: sha256(accessToken), prefix: displayPrefix(accessToken), expiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000) },
      { kind: "OAUTH_REFRESH", userId, mcpClientId, grantId, tokenHash: sha256(refreshToken), prefix: displayPrefix(refreshToken), expiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000) },
    ],
  });
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refreshToken, scope: MCP_SCOPE };
}

async function revokeGrantTokens(grantId: string) {
  await prisma.mcpToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Identifie le client au point d'accès des jetons (secret exigé pour un client confidentiel). */
async function authenticateClient(form: URLSearchParams, authorization: string | null) {
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  if (authorization?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    const decode = (v: string) => {
      try {
        return decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        return v;
      }
    };
    if (sep > 0) {
      clientId = decode(decoded.slice(0, sep));
      clientSecret = decode(decoded.slice(sep + 1));
    }
  }
  if (!clientId) throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  const client = await prisma.mcpClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  if (client.clientSecretHash && (!clientSecret || !safeEqualHash(clientSecret, client.clientSecretHash))) {
    throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  }
  return client;
}

async function activeActor(userId: string): Promise<Actor | null> {
  const actor = await loadActor(userId);
  return actor && can(actor, "assistant.use") ? actor : null;
}

/** Point d'accès des jetons : échange du code (PKCE) ou rafraîchissement (rotation). */
export async function exchangeToken(form: URLSearchParams, authorization: string | null) {
  const client = await authenticateClient(form, authorization);
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    if (!code) throw new OAuthError("invalid_request", "Missing code.");
    const record = await prisma.mcpAuthCode.findUnique({ where: { codeHash: sha256(code) } });
    if (!record || record.mcpClientId !== client.id) throw new OAuthError("invalid_grant", "Invalid authorization code.");
    if (record.usedAt || record.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired or already used.");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri && redirectUri !== record.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request.");
    if (!verifyPkce(form.get("code_verifier"), record.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed.");
    // Usage unique, y compris en cas de requêtes simultanées.
    const used = await prisma.mcpAuthCode.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new OAuthError("invalid_grant", "Authorization code already used.");
    if (!(await activeActor(record.userId))) throw new OAuthError("invalid_grant", "User access is disabled.");
    await prisma.mcpClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
    return issueTokenPair(record.userId, client.id, randomBytes(16).toString("hex"));
  }

  if (grantType === "refresh_token") {
    const token = form.get("refresh_token");
    if (!token) throw new OAuthError("invalid_request", "Missing refresh_token.");
    const record = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.kind !== "OAUTH_REFRESH" || record.mcpClientId !== client.id || !record.grantId) {
      throw new OAuthError("invalid_grant", "Invalid refresh token.");
    }
    if (record.revokedAt) {
      // Jeton déjà utilisé (rotation) ou révoqué : possible vol, on ferme toute l'autorisation.
      await revokeGrantTokens(record.grantId);
      throw new OAuthError("invalid_grant", "Refresh token revoked.");
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Refresh token expired.");
    const rotated = await prisma.mcpToken.updateMany({ where: { id: record.id, revokedAt: null }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    if (rotated.count !== 1) {
      await revokeGrantTokens(record.grantId);
      throw new OAuthError("invalid_grant", "Refresh token already used.");
    }
    if (!(await activeActor(record.userId))) {
      await revokeGrantTokens(record.grantId);
      throw new OAuthError("invalid_grant", "User access is disabled.");
    }
    // Les anciens jetons d'accès de cette autorisation sont remplacés.
    await prisma.mcpToken.updateMany({ where: { grantId: record.grantId, kind: "OAUTH_ACCESS", revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.mcpClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
    return issueTokenPair(record.userId, client.id, record.grantId);
  }

  throw new OAuthError("unsupported_grant_type", "Supported grants: authorization_code, refresh_token.");
}

/** Révocation (RFC 7009) : toujours une réponse positive, même pour un jeton inconnu. */
export async function revokeToken(token: string | null) {
  if (!token) return;
  const record = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.revokedAt) return;
  if (record.grantId) await revokeGrantTokens(record.grantId);
  else await prisma.mcpToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
}

export interface McpAuth {
  actor: Actor;
  tokenId: string;
  kind: "PERSONAL" | "OAUTH_ACCESS";
}

/** Authentifie un appel MCP (`Authorization: Bearer …`) : jeton valide + utilisateur actif autorisé. */
export async function authenticateBearer(header: string | null): Promise<McpAuth | null> {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > 200) return null;
  const record = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256(match[1]) } });
  if (!record || record.revokedAt || record.kind === "OAUTH_REFRESH") return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;
  const actor = await activeActor(record.userId);
  if (!actor) return null;
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    await prisma.mcpToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
    if (record.mcpClientId) await prisma.mcpClient.update({ where: { id: record.mcpClientId }, data: { lastUsedAt: new Date() } });
  }
  return { actor, tokenId: record.id, kind: record.kind };
}

// ───────────────────────────── Gestion par l'utilisateur ─────────────────────────────

export async function createPersonalToken(actor: Actor, input: { name: string; days: number }) {
  if (!can(actor, "assistant.use")) throw new DomainError("Votre rôle ne permet pas de connecter Claude au CRM.");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new DomainError("Donnez un nom au jeton (ex. « Claude Code — MacBook »).");
  if (!(PERSONAL_TOKEN_DAYS as readonly number[]).includes(input.days)) throw new DomainError("Durée de validité non prise en charge.");
  const active = await prisma.mcpToken.count({ where: { userId: actor.id, kind: "PERSONAL", revokedAt: null, expiresAt: { gt: new Date() } } });
  if (active >= 10) throw new DomainError("10 jetons actifs au maximum : révoquez un ancien jeton.");
  const token = randomSecret("avc_pat");
  const record = await prisma.mcpToken.create({
    data: { kind: "PERSONAL", userId: actor.id, name, tokenHash: sha256(token), prefix: displayPrefix(token), expiresAt: new Date(Date.now() + input.days * 86_400_000) },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "mcp.personal_token_created", entityType: "McpToken", entityId: record.id, after: { name, days: input.days } });
  return { id: record.id, token };
}

export async function revokePersonalToken(actor: Actor, tokenId: string) {
  const record = await prisma.mcpToken.findFirst({ where: { id: tokenId, userId: actor.id, kind: "PERSONAL" } });
  if (!record) throw new NotFoundError();
  if (!record.revokedAt) await prisma.mcpToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  await recordAudit(prisma, { actorId: actor.id, action: "mcp.personal_token_revoked", entityType: "McpToken", entityId: record.id });
}

export async function revokeGrant(actor: Actor, grantId: string) {
  const owned = await prisma.mcpToken.findFirst({ where: { grantId, userId: actor.id } });
  if (!owned) throw new NotFoundError();
  await revokeGrantTokens(grantId);
  await recordAudit(prisma, { actorId: actor.id, action: "mcp.grant_revoked", entityType: "McpToken", entityId: grantId });
}

/** Jetons personnels et applications connectées de l'utilisateur (sans aucun secret). */
export async function listConnections(actor: Actor) {
  const now = new Date();
  const [personal, oauth] = await Promise.all([
    prisma.mcpToken.findMany({
      where: { userId: actor.id, kind: "PERSONAL" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
    }),
    prisma.mcpToken.findMany({
      where: { userId: actor.id, kind: "OAUTH_REFRESH", revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { grantId: true, createdAt: true, client: { select: { name: true, lastUsedAt: true } } },
    }),
  ]);
  const grants = new Map<string, { grantId: string; client: string; refreshedAt: Date; lastUsedAt: Date | null }>();
  for (const t of oauth) {
    if (!t.grantId || grants.has(t.grantId)) continue;
    grants.set(t.grantId, { grantId: t.grantId, client: t.client?.name ?? "Application", refreshedAt: t.createdAt, lastUsedAt: t.client?.lastUsedAt ?? null });
  }
  return {
    personal: personal.map((t) => ({ ...t, active: !t.revokedAt && (!t.expiresAt || t.expiresAt > now) })),
    grants: [...grants.values()],
  };
}

/** Claude déjà connecté au CRM : autorisation OAuth ou jeton personnel encore valide. */
export async function hasClaudeConnection(userId: string): Promise<boolean> {
  const token = await prisma.mcpToken.findFirst({
    where: { userId, kind: { in: ["PERSONAL", "OAUTH_REFRESH"] }, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return !!token;
}

/** Nettoyage quotidien : codes expirés, jetons expirés ou révoqués depuis 30 jours, clients jamais utilisés. */
export async function purgeMcpData(now = new Date()) {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const codes = await prisma.mcpAuthCode.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await prisma.mcpToken.deleteMany({ where: { OR: [{ expiresAt: { lt: monthAgo } }, { revokedAt: { lt: monthAgo } }] } });
  const clients = await prisma.mcpClient.deleteMany({ where: { createdAt: { lt: weekAgo }, tokens: { none: {} }, authCodes: { none: {} } } });
  return { codes: codes.count, tokens: tokens.count, clients: clients.count };
}
