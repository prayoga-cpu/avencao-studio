import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as mcpPost, GET as mcpGet } from "@/app/api/mcp/route";
import { runTool, toolsFor } from "@/server/ai/tools";
import { DomainError, NotFoundError } from "@/server/errors";
import {
  OAuthError,
  approveAuthorization,
  authenticateBearer,
  checkAuthorizeRequest,
  createPersonalToken,
  exchangeToken,
  hasClaudeConnection,
  listConnections,
  mcpResourceUrl,
  pkceChallenge,
  registerClient,
  revokeGrant,
  revokePersonalToken,
  revokeToken,
} from "@/server/mcp/oauth";
import { assignEditor } from "@/server/services/assignments";
import { makeActor, makeClient, makeEditor, makeProject, makeVideos, prisma, resetDb } from "../support/db";
import { assignment } from "./helpers";

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const form = (o: Record<string, string>) => new URLSearchParams(o);

async function authorize(actor: Awaited<ReturnType<typeof makeActor>>, clientId: string) {
  const verifier = randomBytes(32).toString("base64url");
  const check = await checkAuthorizeRequest({
    client_id: clientId, redirect_uri: CALLBACK, response_type: "code", code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256", state: "etat-123", resource: mcpResourceUrl(),
  });
  if (!check.ok) throw new Error("demande refusée");
  const target = new URL(await approveAuthorization(actor, check));
  return { verifier, code: target.searchParams.get("code")!, target };
}

describe("OAuth pour Claude (serveur MCP)", () => {
  beforeEach(resetDb);

  it("enregistrement limité aux adresses de retour de Claude et locales", async () => {
    const reg = await registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    expect(reg.client_id).toMatch(/^avc_client_/);
    expect(reg).not.toHaveProperty("client_secret");
    await expect(registerClient({ client_name: "Pirate", redirect_uris: ["https://evil.example/cb"] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirect_uris: [] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirect_uris: [CALLBACK], grant_types: ["client_credentials"] })).rejects.toBeInstanceOf(OAuthError);
  });

  it("vérifie la demande : application, adresse de retour, PKCE S256, ressource", async () => {
    const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    const base = { client_id, redirect_uri: CALLBACK, response_type: "code", code_challenge: pkceChallenge("v".repeat(43)), code_challenge_method: "S256", state: "s1" };
    expect((await checkAuthorizeRequest(base)).ok).toBe(true);
    expect(await checkAuthorizeRequest({ ...base, client_id: "inconnu" })).toMatchObject({ ok: false, fatal: true });
    expect(await checkAuthorizeRequest({ ...base, redirect_uri: "https://claude.ai/autre" })).toMatchObject({ ok: false, fatal: true });
    const noPkce = await checkAuthorizeRequest({ ...base, code_challenge_method: "plain" });
    expect(noPkce.ok).toBe(false);
    if (!noPkce.ok && !noPkce.fatal) {
      const url = new URL(noPkce.redirectTo);
      expect(url.origin + url.pathname).toBe(CALLBACK);
      expect(url.searchParams.get("error")).toBe("invalid_request");
      expect(url.searchParams.get("state")).toBe("s1");
    }
    const otherResource = await checkAuthorizeRequest({ ...base, resource: "https://autre.example/api/mcp" });
    expect(otherResource).toMatchObject({ ok: false, fatal: false });
  });

  it("flux complet : code à usage unique + PKCE, rotation du rafraîchissement, réutilisation = révocation", async () => {
    const admin = await makeActor("ADMIN");
    const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    const { verifier, code, target } = await authorize(admin, client_id);
    expect(target.searchParams.get("state")).toBe("etat-123");
    expect(target.searchParams.get("iss")).toBeTruthy();

    // Mauvais vérificateur : refusé, sans consommer le code.
    await expect(exchangeToken(form({ grant_type: "authorization_code", code, client_id, redirect_uri: CALLBACK, code_verifier: "x".repeat(43) }), null)).rejects.toMatchObject({ code: "invalid_grant" });
    const tokens = await exchangeToken(form({ grant_type: "authorization_code", code, client_id, redirect_uri: CALLBACK, code_verifier: verifier }), null);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "crm:read" });
    expect(tokens.access_token).toMatch(/^avc_at_/);
    // Code déjà utilisé.
    await expect(exchangeToken(form({ grant_type: "authorization_code", code, client_id, code_verifier: verifier }), null)).rejects.toMatchObject({ code: "invalid_grant" });

    const auth = await authenticateBearer(`Bearer ${tokens.access_token}`);
    expect(auth?.actor.id).toBe(admin.id);
    expect(await authenticateBearer(`Bearer ${tokens.refresh_token}`)).toBeNull(); // un jeton de rafraîchissement n'ouvre pas l'API

    const rotated = await exchangeToken(form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }), null);
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect(await authenticateBearer(`Bearer ${tokens.access_token}`)).toBeNull();
    expect((await authenticateBearer(`Bearer ${rotated.access_token}`))?.actor.id).toBe(admin.id);

    // Réutilisation de l'ancien jeton de rafraîchissement : toute l'autorisation est fermée.
    await expect(exchangeToken(form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }), null)).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await authenticateBearer(`Bearer ${rotated.access_token}`)).toBeNull();
    await expect(exchangeToken(form({ grant_type: "refresh_token", refresh_token: rotated.refresh_token, client_id }), null)).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("client confidentiel : secret exigé ; révocation et liste des applications connectées", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const reg = await registerClient({ client_name: "Claude Desktop", redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_post" });
    expect(reg.client_secret).toMatch(/^avc_secret_/);
    const { verifier, code } = await authorize(pm, reg.client_id);
    await expect(exchangeToken(form({ grant_type: "authorization_code", code, client_id: reg.client_id, code_verifier: verifier }), null)).rejects.toMatchObject({ code: "invalid_client", status: 401 });
    const basic = `Basic ${Buffer.from(`${reg.client_id}:${reg.client_secret}`).toString("base64")}`;
    const tokens = await exchangeToken(form({ grant_type: "authorization_code", code, code_verifier: verifier }), basic);
    const { grants } = await listConnections(pm);
    expect(grants).toHaveLength(1);
    expect(await hasClaudeConnection(pm.id)).toBe(true);
    expect(grants[0].client).toBe("Claude Desktop");
    await revokeToken(tokens.access_token);
    expect(await authenticateBearer(`Bearer ${tokens.access_token}`)).toBeNull();
    expect((await listConnections(pm)).grants).toHaveLength(0);
  });

  it("refuse un monteur et coupe l'accès d'un compte désactivé", async () => {
    const editorProfile = await makeEditor();
    const editor = await makeActor("EDITOR", { editorId: editorProfile.id });
    const admin = await makeActor("ADMIN");
    const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    await expect(authorize(editor, client_id)).rejects.toBeInstanceOf(DomainError);
    const { verifier, code } = await authorize(admin, client_id);
    const tokens = await exchangeToken(form({ grant_type: "authorization_code", code, client_id, code_verifier: verifier }), null);
    const grantId = (await listConnections(admin)).grants[0].grantId;
    await prisma.user.update({ where: { id: admin.id }, data: { status: "DISABLED" } });
    expect(await authenticateBearer(`Bearer ${tokens.access_token}`)).toBeNull();
    await prisma.user.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });
    expect(await authenticateBearer(`Bearer ${tokens.access_token}`)).not.toBeNull();
    await revokeGrant(admin, grantId);
    expect(await authenticateBearer(`Bearer ${tokens.access_token}`)).toBeNull();
  });

  it("jetons personnels : création, usage, révocation par leur seul propriétaire", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const other = await makeActor("ADMIN");
    const editorProfile = await makeEditor();
    const editor = await makeActor("EDITOR", { editorId: editorProfile.id });
    expect(await hasClaudeConnection(pm.id)).toBe(false);
    const { id, token } = await createPersonalToken(pm, { name: "Claude Code", days: 90 });
    expect(await hasClaudeConnection(pm.id)).toBe(true);
    expect(token).toMatch(/^avc_pat_/);
    const stored = await prisma.mcpToken.findUniqueOrThrow({ where: { id } });
    expect(stored.tokenHash).not.toContain(token.slice(8));
    expect((await authenticateBearer(`Bearer ${token}`))?.kind).toBe("PERSONAL");
    await expect(createPersonalToken(editor, { name: "x", days: 90 })).rejects.toBeInstanceOf(DomainError);
    await expect(createPersonalToken(pm, { name: "x", days: 7 })).rejects.toBeInstanceOf(DomainError);
    await expect(revokePersonalToken(other, id)).rejects.toBeInstanceOf(NotFoundError);
    await revokePersonalToken(pm, id);
    expect(await authenticateBearer(`Bearer ${token}`)).toBeNull();
    expect(await hasClaudeConnection(pm.id)).toBe(false);
    expect(await authenticateBearer("Bearer avc_pat_inconnu")).toBeNull();
    expect(await authenticateBearer(null)).toBeNull();
  });
});

describe("outils CRM : droits identiques à l'écran", () => {
  beforeEach(resetDb);

  async function scene() {
    const admin = await makeActor("ADMIN");
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient("Studio Lumière");
    const project = await makeProject(client.id, "Campagne automne");
    const [late, ok] = await makeVideos(project.id, 2);
    await prisma.video.update({ where: { id: late.id }, data: { status: "EDITING", clientDeadline: new Date("2020-01-10T00:00:00Z") } });
    await prisma.video.update({ where: { id: ok.id }, data: { status: "EDITING", clientDeadline: new Date("2099-01-10T00:00:00Z") } });
    const editor = await makeEditor("Kai");
    await assignEditor(admin, assignment({ videoId: late.id, editorId: editor.id, unitPrice: "120", rateMode: "PER_VIDEO" }));
    return { admin, pm, client, project, late, ok, editor };
  }

  it("le menu d'outils dépend du rôle", async () => {
    const { admin, pm } = await scene();
    const editorProfile = await makeEditor("E2");
    const editor = await makeActor("EDITOR", { editorId: editorProfile.id });
    const pmFinance = await makeActor("PRODUCTION_MANAGER", { financeAccess: true });
    const names = (a: typeof admin) => toolsFor(a).map((t) => t.name);
    expect(names(editor)).toEqual([]);
    expect(names(pm)).not.toContain("search_invoices");
    expect(names(pm)).not.toContain("get_receivables");
    expect(names(pm)).toContain("search_videos");
    expect(names(pmFinance)).toContain("search_invoices");
    expect(names(admin)).toEqual(expect.arrayContaining(["get_dashboard_overview", "get_receivables", "run_report"]));
  });

  it("revérifie les droits et l'entrée à l'exécution", async () => {
    const { pm, admin } = await scene();
    expect(await runTool(pm, "search_invoices", {})).toMatchObject({ ok: false });
    expect((await runTool(pm, "run_report", { report: "resultat" })).text).toMatch(/Access denied/);
    expect((await runTool(pm, "run_report", { report: "charge" })).ok).toBe(true);
    expect((await runTool(admin, "search_videos", { limit: 1000 })).text).toMatch(/INVALID_INPUT/);
    expect((await runTool(admin, "get_planning", { from: "2026-01-01", to: "2026-06-30" })).text).toMatch(/62 days/);
    expect((await runTool(admin, "get_video", { video_id: "inexistant" })).text).toMatch(/Not found/);
  });

  it("tarif du monteur visible pour l'admin, jamais pour un responsable sans accès financier", async () => {
    const { pm, admin, late } = await scene();
    const asAdmin = JSON.parse((await runTool(admin, "get_video", { video_id: late.id })).text);
    expect(asAdmin.assignments[0]).toMatchObject({ editor: "Kai", unitPrice: "120" });
    const asPm = await runTool(pm, "get_video", { video_id: late.id });
    expect(asPm.ok).toBe(true);
    const parsed = JSON.parse(asPm.text);
    expect(parsed.assignments[0].editor).toBe("Kai");
    expect(parsed.assignments[0]).not.toHaveProperty("unitPrice");
    expect(parsed.finance).toBe("not available for your role");
    expect(asPm.text).not.toContain("120");
  });

  it("recherche des vidéos en retard avec liens vers le CRM", async () => {
    const { pm, late, ok } = await scene();
    const res = JSON.parse((await runTool(pm, "search_videos", { view: "overdue" })).text);
    expect(res.rows.map((r: { id: string }) => r.id)).toEqual([late.id]);
    expect(res.rows[0].url).toMatch(new RegExp(`/videos/${late.id}$`));
    expect(res.rows[0]).not.toHaveProperty("allowed");
    expect(res.rows.map((r: { id: string }) => r.id)).not.toContain(ok.id);
  });
});

describe("point d'accès MCP /api/mcp", () => {
  beforeEach(resetDb);

  const rpc = (token: string | null, body: unknown, method = "POST") =>
    new Request("http://localhost:3000/api/mcp", {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });

  it("401 + métadonnées OAuth sans jeton ; initialize, tools/list et tools/call avec jeton", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient("Atelier Nord");
    const project = await makeProject(client.id);
    const [late] = await makeVideos(project.id, 1);
    await prisma.video.update({ where: { id: late.id }, data: { status: "EDITING", clientDeadline: new Date("2020-01-10T00:00:00Z") } });

    const anonymous = await mcpPost(rpc(null, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toMatch(/resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
    expect((await mcpPost(rpc("avc_pat_faux", { jsonrpc: "2.0", id: 1, method: "tools/list" }))).headers.get("www-authenticate")).toMatch(/invalid_token/);

    const { token } = await createPersonalToken(pm, { name: "test", days: 30 });
    const init = await mcpPost(rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "1" } } }));
    expect(init.status).toBe(200);
    const initBody = await init.json();
    expect(initBody.result.serverInfo.name).toBe("avencao-crm");
    expect(initBody.result.instructions).toMatch(/read-only/);

    const list = await (await mcpPost(rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))).json();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("search_videos");
    expect(names).not.toContain("search_invoices");
    expect(list.result.tools.every((t: { annotations?: { readOnlyHint?: boolean } }) => t.annotations?.readOnlyHint === true)).toBe(true);

    const call = await (await mcpPost(rpc(token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_videos", arguments: { view: "overdue" } } }))).json();
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0].text).rows[0].reference).toBe(late.reference);

    const forbidden = await (await mcpPost(rpc(token, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_receivables", arguments: {} } }))).json();
    expect(JSON.stringify(forbidden)).toMatch(/not found|not allowed|Unknown tool/i);

    expect((await mcpGet(rpc(token, null, "GET"))).status).toBe(405);
  });
});
