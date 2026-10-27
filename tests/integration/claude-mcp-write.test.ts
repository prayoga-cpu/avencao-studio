import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { PUT as uploadPut } from "@/app/api/mcp/upload/[token]/route";
import { POST as mcpPost } from "@/app/api/mcp/route";
import { runTool, toolsFor } from "@/server/ai/tools";
import { DomainError } from "@/server/errors";
import { listClaudeActivity } from "@/server/mcp/activity";
import {
  approveAuthorization, authenticateBearer, checkAuthorizeRequest, createPersonalToken, exchangeToken, listConnections, mcpResourceUrl,
  pkceChallenge, registerClient, setGrantWriteAccess,
} from "@/server/mcp/oauth";
import { consumeUploadTicket, describeUploadTicket } from "@/server/mcp/uploads";
import { assignEditor } from "@/server/services/assignments";
import { createInvoice } from "@/server/services/billing";
import { makeActor, makeClient, makeEditor, makeProject, makeVideos, prisma, resetDb } from "../support/db";
import { assignment } from "./helpers";

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const W = { write: true, tokenId: "tok_test" };
const pdf = (name = "facture.pdf") => new File([Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n")], name, { type: "application/pdf" });
const json = (text: string) => JSON.parse(text);
const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

async function call(actor: Awaited<ReturnType<typeof makeActor>>, name: string, args: unknown) {
  const res = await runTool(actor, name, args, W);
  if (!res.ok) throw new Error(`${name}: ${res.text}`);
  return json(res.text);
}

const invoiceArgs = (clientId: string, extra: Record<string, unknown> = {}) => ({
  client_id: clientId,
  number: "F-2026-042",
  issue_date: "2026-10-20",
  due_date: "2026-11-19",
  lines: [{ description: "Montage reels octobre", quantity: 3, unit_price: "450", vat_rate: 20 }],
  ...extra,
});

describe("portées OAuth : lecture seule ou lecture + écriture", () => {
  beforeEach(resetDb);

  async function connect(actor: Awaited<ReturnType<typeof makeActor>>, opts: { scope: string; write: boolean }) {
    const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    const verifier = randomBytes(32).toString("base64url");
    const check = await checkAuthorizeRequest({
      client_id, redirect_uri: CALLBACK, response_type: "code", code_challenge: pkceChallenge(verifier), code_challenge_method: "S256",
      state: "s", scope: opts.scope, resource: mcpResourceUrl(),
    });
    if (!check.ok) throw new Error("demande refusée");
    const code = new URL(await approveAuthorization(actor, check, { write: opts.write })).searchParams.get("code")!;
    const tokens = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id, redirect_uri: CALLBACK }), null);
    return { check, tokens, client_id };
  }

  it("l'écriture n'est accordée que si l'utilisateur la coche, et survit au rafraîchissement", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const asked = await connect(pm, { scope: "crm:read crm:write", write: true });
    expect(asked.check.ok && asked.check.requestsWrite).toBe(true);
    expect(asked.tokens.scope).toBe("crm:read crm:write");
    expect((await authenticateBearer(`Bearer ${asked.tokens.access_token}`))?.write).toBe(true);

    const refreshed = await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: asked.tokens.refresh_token, client_id: asked.client_id }), null);
    expect(refreshed.scope).toBe("crm:read crm:write");
    expect((await authenticateBearer(`Bearer ${refreshed.access_token}`))?.write).toBe(true);

    const declined = await connect(pm, { scope: "crm:read crm:write", write: false });
    expect(declined.tokens.scope).toBe("crm:read");
    expect((await authenticateBearer(`Bearer ${declined.tokens.access_token}`))?.write).toBe(false);
  });

  it("l'utilisateur active ou retire l'écriture d'une connexion existante", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const { tokens } = await connect(pm, { scope: "crm:read", write: false });
    const [grant] = (await listConnections(pm)).grants;
    expect(grant.write).toBe(false);
    await setGrantWriteAccess(pm, grant.grantId, true);
    expect((await listConnections(pm)).grants[0].write).toBe(true);
    expect((await authenticateBearer(`Bearer ${tokens.access_token}`))?.write).toBe(true);
    const other = await makeActor("PRODUCTION_MANAGER");
    await expect(setGrantWriteAccess(other, grant.grantId, false)).rejects.toThrow();

    const { token } = await createPersonalToken(pm, { name: "Claude Code", days: 30, write: true });
    expect((await authenticateBearer(`Bearer ${token}`))?.write).toBe(true);
    expect((await listConnections(pm)).personal[0].write).toBe(true);
  });
});

describe("outils d'écriture proposés à Claude", () => {
  beforeEach(resetDb);

  it("jamais sans la portée d'écriture ; toujours limités par le rôle", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const pmFinance = await makeActor("PRODUCTION_MANAGER", { financeAccess: true });
    const admin = await makeActor("ADMIN");
    const names = (a: typeof pm, write: boolean) => toolsFor(a, { write }).map((t) => t.name);
    expect(toolsFor(admin).every((t) => t.kind === "read")).toBe(true);
    expect(names(pm, true)).toEqual(expect.arrayContaining(["create_mission", "create_client", "update_video", "add_note"]));
    expect(names(pm, true)).not.toContain("record_client_invoice");
    expect(names(pm, true)).not.toContain("record_expense");
    expect(names(pmFinance, true)).toEqual(expect.arrayContaining(["record_client_invoice", "record_expense", "record_direct_cost", "set_project_price"]));
    expect(names(admin, true)).toContain("record_supplier_payment");
    const client = await makeClient("Atelier Nord");
    expect((await runTool(admin, "record_client_invoice", invoiceArgs(client.id))).text).toMatch(/Unknown tool or not allowed/);
    expect((await runTool(pm, "record_client_invoice", invoiceArgs(client.id), W)).text).toMatch(/Unknown tool or not allowed/);
  });
});

describe("finances : factures, charges, coûts", () => {
  beforeEach(resetDb);

  it("une facture lue sur un PDF devient un brouillon, journalisé via Claude, avec un lien de dépôt", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const res = await call(admin, "record_client_invoice", invoiceArgs(client.id));
    expect(res.done).toBe("created");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.records[0].id } });
    expect(invoice).toMatchObject({ status: "DRAFT", number: "F-2026-042" });
    expect(invoice.totalNet.toFixed(2)).toBe("1350.00");
    expect(invoice.totalGross.toFixed(2)).toBe("1620.00");
    expect(res.records[0].url).toMatch(new RegExp(`/finances/factures/${invoice.id}$`));
    expect(res.attach.url).toMatch(/\/depot\/avc_up_/);
    expect(res.attach.upload_url).toMatch(/\/api\/mcp\/upload\/avc_up_/);

    const audit = await prisma.auditEvent.findMany({ where: { entityId: invoice.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => [a.action, a.via, a.mcpTokenId])).toEqual([
      ["invoice.create", "MCP", "tok_test"],
      ["mcp.tool.record_client_invoice", "MCP", "tok_test"],
    ]);
    const [activity] = await listClaudeActivity(admin);
    expect(activity).toMatchObject({ tool: "Facture client", partial: false });
    expect(activity.records[0].href).toBe(`/finances/factures/${invoice.id}`);
  });

  it("une facture déjà enregistrée est signalée sans rien écrire", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    await call(admin, "record_client_invoice", invoiceArgs(client.id));
    const again = await call(admin, "record_client_invoice", invoiceArgs(client.id));
    expect(again.done).toBe("nothing");
    expect(again.possible_duplicates[0]).toMatchObject({ type: "INVOICE", why: "same invoice number" });
    expect(await prisma.invoice.count()).toBe(1);
    // Même confirmé, un numéro de facture reste unique.
    const forced = await runTool(admin, "record_client_invoice", { ...invoiceArgs(client.id), confirm_duplicate: true }, W);
    expect(forced).toMatchObject({ ok: false });
    expect(forced.text).toMatch(/doublon/);
  });

  it("un brouillon est modifiable partiellement ; une facture émise ne l'est jamais par Claude", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const created = await call(admin, "record_client_invoice", invoiceArgs(client.id));
    const updated = await call(admin, "update_draft_invoice", { invoice_id: created.records[0].id, due_date: "2026-12-01" });
    expect(updated.done).toBe("updated");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: created.records[0].id }, include: { lines: true } });
    expect(invoice.dueDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.totalNet.toFixed(2)).toBe("1350.00");

    const issued = await createInvoice(admin, {
      clientId: client.id, projectId: "", salesOrderId: "", kind: "STANDARD", status: "ISSUED", number: "F-2026-001", externalRef: "",
      issueDate: "2026-10-01", dueDate: "", currency: "EUR", manualFxRate: "", notes: "",
      lines: [{ description: "Montage", quantity: "1", unitPrice: "100", vatRate: "20", salesOrderLineId: "", deductsInvoiceId: "" }],
    });
    expect((await runTool(admin, "update_draft_invoice", { invoice_id: issued.id, notes: "x" }, W)).text).toMatch(/Only a DRAFT invoice/);
  });

  it("encaissement affecté à une facture émise", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const issued = await createInvoice(admin, {
      clientId: client.id, projectId: "", salesOrderId: "", kind: "STANDARD", status: "ISSUED", number: "F-2026-007", externalRef: "",
      issueDate: "2026-10-01", dueDate: "", currency: "EUR", manualFxRate: "", notes: "",
      lines: [{ description: "Montage", quantity: "1", unitPrice: "500", vatRate: "20", salesOrderLineId: "", deductsInvoiceId: "" }],
    });
    const res = await call(admin, "record_client_payment", {
      client_id: client.id, received_on: "2026-10-25", amount: "600,00", reference: "VIR F-2026-007", allocations: [{ invoice_id: issued.id, amount: 600 }],
    });
    expect(res.done).toBe("created");
    const invoice = json((await runTool(admin, "get_invoice", { invoice_id: issued.id })).text);
    expect(invoice).toMatchObject({ paymentState: "PAID", balance: "0.00" });
    const again = await call(admin, "record_client_payment", { client_id: client.id, received_on: "2026-10-25", amount: "600" });
    expect(again.done).toBe("nothing");
  });

  it("reçu de charge : catégorie, n° de pièce, doublon détecté par le n° de pièce", async () => {
    const admin = await makeActor("ADMIN");
    const category = await prisma.expenseCategory.create({ data: { name: "Abonnements logiciels" } });
    const ref = json((await runTool(admin, "get_reference_data", {})).text);
    expect(ref.expenseCategories).toEqual([{ id: category.id, name: "Abonnements logiciels" }]);
    const args = { category_id: category.id, label: "Adobe Creative Cloud — octobre", supplier: "Adobe", expense_date: "2026-10-03", amount_net: "59.99", vat_amount: "12.00", document_ref: "ADB-778812" };
    const res = await call(admin, "record_expense", args);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: res.records[0].id } });
    expect(expense).toMatchObject({ documentRef: "ADB-778812", isPaid: true, supplier: "Adobe" });
    expect(expense.paidOn?.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(expense.periodMonth.toISOString().slice(0, 7)).toBe("2026-10");
    expect((await call(admin, "record_expense", { ...args, label: "Adobe CC" })).done).toBe("nothing");
    const listed = json((await runTool(admin, "search_expenses", { query: "adb-778" })).text);
    expect(listed.rows).toHaveLength(1);
  });

  it("coûts : jamais validés par Claude ; montant d'une mission complété depuis la facture du monteur", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1, { status: "TO_ASSIGN" });
    const editor = await makeEditor("Kai");

    const validated = await runTool(admin, "record_direct_cost", { label: "Musique", video_id: video.id, amount: 20, incurred_on: "2026-10-02", stage: "VALIDATED" }, W);
    expect(validated.text).toMatch(/INVALID_INPUT/);
    const purchase = await call(admin, "record_direct_cost", { label: "Musique", supplier_name: "Artlist", video_id: video.id, amount: 20, incurred_on: "2026-10-02", document_ref: "ART-1" });
    expect(await prisma.directCost.findUniqueOrThrow({ where: { id: purchase.records[0].id } })).toMatchObject({ stage: "COMMITTED", documentRef: "ART-1" });

    const mission = await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "" }));
    const cost = await prisma.directCost.findFirstOrThrow({ where: { assignmentId: mission.id } });
    expect(cost.amount).toBeNull();
    const missing = json((await runTool(admin, "search_costs", { editor_id: editor.id, missing_amount: true })).text);
    expect(missing.rows.map((r: { id: string }) => r.id)).toEqual([cost.id]);
    await call(admin, "set_cost_amount", { cost_id: cost.id, amount: "120", document_ref: "KAI-2026-10" });
    expect(await prisma.directCost.findUniqueOrThrow({ where: { id: cost.id } })).toMatchObject({ stage: "COMMITTED", documentRef: "KAI-2026-10" });

    await prisma.directCost.update({ where: { id: cost.id }, data: { stage: "VALIDATED" } });
    expect((await runTool(admin, "set_cost_amount", { cost_id: cost.id, amount: "150" }, W)).text).toMatch(/already validated/);
  });
});

describe("nouvelle mission tapée dans Claude (create_mission)", () => {
  beforeEach(resetDb);

  const mission = (extra: Record<string, unknown> = {}) => ({
    new_client: { display_name: "Studio Riviera", email: "hello@riviera.test", contact: { first_name: "Léa", last_name: "Martin" } },
    project: { title: "Lancement collection hiver", client_deadline: "2026-11-15" },
    videos: [
      { title: "Reel teaser", type: "REEL", client_deadline: "2026-11-10", brief: "Teaser 15 s, musique énergique" },
      { title: "Reel produit", type: "REEL", client_deadline: "2026-11-15" },
    ],
    pricing: { mode: "PER_VIDEO", amount: "450" },
    ...extra,
  });

  it("client, projet, vidéos, prix et missions en une seule validation", async () => {
    const admin = await makeActor("ADMIN");
    const editor = await makeEditor("Kai");
    const res = await call(admin, "create_mission", mission({ editors: [{ editor_id: editor.id, unit_price: "120" }] }));
    expect(res.done).toBe("created");
    expect(res.records.map((r: { type: string }) => r.type)).toEqual(["CLIENT", "PROJECT", "VIDEO", "VIDEO", "SALES_ORDER", "ASSIGNMENT", "ASSIGNMENT"]);

    const client = await prisma.client.findUniqueOrThrow({ where: { id: res.records[0].id }, include: { contacts: true } });
    expect(client).toMatchObject({ displayName: "Studio Riviera", status: "ACTIVE" });
    expect(client.contacts[0]).toMatchObject({ firstName: "Léa", isPrimary: true });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.records[1].id }, include: { videos: { orderBy: { position: "asc" } } } });
    expect(project.videos.map((v) => [v.title, v.clientDeadline?.toISOString().slice(0, 10)])).toEqual([["Reel teaser", "2026-11-10"], ["Reel produit", "2026-11-15"]]);
    expect(project.videos[0].brief).toBe("Teaser 15 s, musique énergique");
    const sale = await prisma.salesOrder.findUniqueOrThrow({ where: { id: res.records[4].id }, include: { lines: true } });
    expect(sale.lines[0].netAmount.toFixed(2)).toBe("900.00");
    const costs = await prisma.directCost.findMany({ where: { editorId: editor.id, kind: "ASSIGNMENT" } });
    expect(costs.map((c) => c.amount?.toFixed(2))).toEqual(["120.00", "120.00"]);
    // Le monteur n'est prévenu que sur demande explicite.
    expect(await prisma.notification.count()).toBe(0);
    expect(res.attach.url).toMatch(/\/depot\//);
    expect((await prisma.auditEvent.findMany({ where: { action: "mcp.tool.create_mission" } })).length).toBe(1);
  });

  it("deux monteurs sur une vidéo : seul le premier est principal", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const kai = await makeEditor("Kai");
    const lina = await makeEditor("Lina");
    await call(admin, "create_mission", {
      client_id: client.id,
      project: { title: "Vlog voyage" },
      videos: [{ title: "Vlog 1", type: "VLOG" }],
      editors: [{ editor_id: kai.id }, { editor_id: lina.id, role: "SUBTITLES" }],
    });
    const missions = await prisma.assignment.findMany({ orderBy: { createdAt: "asc" }, select: { editorId: true, isPrimary: true, role: true } });
    expect(missions).toEqual([
      { editorId: kai.id, isPrimary: true, role: "EDIT" },
      { editorId: lina.id, isPrimary: false, role: "SUBTITLES" },
    ]);
  });

  it("vérifie tout avant d'écrire : doublons, droits, entrées", async () => {
    const admin = await makeActor("ADMIN");
    await makeClient("Studio Riviera");
    const dup = await call(admin, "create_mission", mission());
    expect(dup.done).toBe("nothing");
    expect(dup.possible_duplicates[0]).toMatchObject({ type: "CLIENT", why: "same name" });
    expect(await prisma.project.count()).toBe(0);

    const pm = await makeActor("PRODUCTION_MANAGER");
    expect((await runTool(pm, "create_mission", mission({ new_client: { display_name: "Autre client" } }), W)).text).toMatch(/cannot set the client price/);

    const bad = await runTool(admin, "create_mission", mission({ new_client: { display_name: "Nouveau client" }, editors: [{ editor_id: "inconnu" }] }), W);
    expect(bad.text).toMatch(/not found/);
    expect(await prisma.client.count()).toBe(1);
  });

  it("ajoute des vidéos à un projet existant ; un échec en cours de route est rendu sans tout refaire", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const project = await makeProject(client.id, "Série podcast");
    const res = await call(admin, "create_mission", { project_id: project.id, videos: [{ title: "Épisode 1", type: "PODCAST" }] });
    expect(res.records.map((r: { type: string }) => r.type)).toEqual(["VIDEO"]);

    const editor = await makeEditor("Kai");
    await prisma.editorProfile.update({ where: { id: editor.id }, data: { status: "INACTIVE" } });
    const refused = await runTool(admin, "create_mission", { project_id: project.id, videos: [{ title: "Épisode 2", type: "PODCAST" }], editors: [{ editor_id: editor.id }] }, W);
    expect(refused.text).toMatch(/not an active editor/);
    expect(await prisma.video.count({ where: { projectId: project.id } })).toBe(1);
  });
});

describe("CRM et production", () => {
  beforeEach(resetDb);

  it("mise à jour partielle d'une vidéo : seuls les champs donnés changent", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1, { title: "Reel A", clientDeadline: new Date("2026-11-20T00:00:00Z"), language: "fr" });
    const res = await call(pm, "update_video", { video_id: video.id, brief: "Version courte, sous-titres jaunes" });
    expect(res.done).toBe("updated");
    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after).toMatchObject({ brief: "Version courte, sous-titres jaunes", title: "Reel A", language: "fr", version: video.version + 1 });
    expect(after.clientDeadline?.toISOString().slice(0, 10)).toBe("2026-11-20");
  });

  it("client en double signalé ; note interne ; retour client sans notifier le monteur ; étapes jamais forcées", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient("Atelier Nord");
    expect((await call(pm, "create_client", { display_name: "atelier nord" })).done).toBe("nothing");
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1, { status: "CLIENT_REVIEW" });
    const note = await call(pm, "add_note", { client_id: client.id, body: "Préfère les sous-titres jaunes." });
    expect(note.records[0].url).toMatch(new RegExp(`/clients/${client.id}$`));
    await call(pm, "add_video_feedback", { video_id: video.id, body: "Couper l'intro", timecode: "00:12" });
    expect(await prisma.feedback.findFirstOrThrow({ where: { videoId: video.id } })).toMatchObject({ source: "CLIENT", visibleToEditor: false, timecode: "00:12" });
    expect((await runTool(pm, "transition_video", { video_id: video.id, to: "CANCELLED" }, W)).text).toMatch(/INVALID_INPUT/);
  });
});

describe("dépôt de la pièce d'origine (lien à usage unique)", () => {
  beforeEach(resetDb);

  it("PDF rattaché à la facture ; lien à usage unique, libéré si le fichier est refusé", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient("Atelier Nord");
    const res = await call(admin, "record_client_invoice", invoiceArgs(client.id));
    const token = tokenOf(res.attach.url);
    expect(await describeUploadTicket(token)).toMatchObject({ status: "ready", label: "F-2026-042 · Atelier Nord" });

    await expect(consumeUploadTicket(token, new File(["pas un pdf"], "x.txt", { type: "text/plain" }))).rejects.toBeInstanceOf(DomainError);
    expect((await describeUploadTicket(token)).status).toBe("ready");

    const saved = await consumeUploadTicket(token, pdf());
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.records[0].id } });
    expect(invoice.pdfAttachmentId).toBe(saved.attachmentId);
    expect(await prisma.auditEvent.findFirst({ where: { action: "attachment.upload", entityId: invoice.id } })).toMatchObject({ via: "MCP", mcpTokenId: "tok_test" });
    await expect(consumeUploadTicket(token, pdf())).rejects.toThrow(/déjà servi/);
    expect((await describeUploadTicket(token)).status).toBe("used");
    expect((await describeUploadTicket("avc_up_inconnu")).status).toBe("unknown");
  });

  it("envoi direct (curl -T) sur le lien remis par create_upload_link ; lien expiré refusé", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient("Atelier Nord");
    const project = await makeProject(client.id, "Série podcast");
    const link = await call(pm, "create_upload_link", { owner_type: "PROJECT", owner_id: project.id });
    expect(link.records[0].label).toMatch(/Série podcast/);
    const token = tokenOf(link.attach.upload_url);
    const req = new NextRequest(`${link.attach.upload_url}?nom=brief.pdf`, { method: "PUT", body: Buffer.from("%PDF-1.4\n%%EOF\n"), headers: { "content-type": "application/pdf" } });
    const put = await uploadPut(req, { params: Promise.resolve({ token }) });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ ok: true, attachedTo: link.records[0].label });
    expect(await prisma.attachment.findFirstOrThrow({ where: { ownerType: "PROJECT", ownerId: project.id } })).toMatchObject({ filename: "brief.pdf" });

    const expired = await call(pm, "create_upload_link", { owner_type: "PROJECT", owner_id: project.id });
    await prisma.mcpUploadTicket.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeUploadTicket(tokenOf(expired.attach.url), pdf())).rejects.toThrow(/expiré/);
  });
});

describe("point d'accès MCP avec écriture", () => {
  beforeEach(resetDb);

  it("un jeton avec écriture voit les outils d'écriture (annotés) et peut enregistrer", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER");
    const client = await makeClient("Atelier Nord");
    const { token } = await createPersonalToken(pm, { name: "test", days: 30, write: true });
    const rpc = (body: unknown) =>
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify(body),
      });
    const init = await (await mcpPost(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "1" } } }))).json();
    expect(init.result.instructions).toMatch(/Write access is enabled/);
    const list = await (await mcpPost(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))).json();
    const byName = Object.fromEntries(list.result.tools.map((t: { name: string; annotations: Record<string, boolean> }) => [t.name, t.annotations]));
    expect(byName.search_videos).toMatchObject({ readOnlyHint: true });
    expect(byName.create_mission).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.update_video).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.record_client_invoice).toBeUndefined();

    const res = await (await mcpPost(rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add_note", arguments: { client_id: client.id, body: "Appel du 27/10 : budget validé." } } }))).json();
    expect(res.result.isError).toBe(false);
    const note = await prisma.note.findFirstOrThrow({ where: { clientId: client.id } });
    expect(note.body).toMatch(/budget validé/);
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { action: "mcp.tool.add_note" } });
    expect(journal.via).toBe("MCP");
    expect(journal.mcpTokenId).toBeTruthy();
  });
});
