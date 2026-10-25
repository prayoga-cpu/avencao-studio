import { beforeEach, describe, expect, it } from "vitest";
import { todayInTimezone } from "@/lib/dates";
import { assignEditor } from "@/server/services/assignments";
import { allocateClientPayment, createInvoice, getInvoiceBalances, recordClientPayment, voidClientPayment } from "@/server/services/billing";
import { createRetainer, generateRetainerPeriod } from "@/server/services/retainers";
import { createSalesOrder } from "@/server/services/sales";
import { transitionVideo } from "@/server/services/videos";
import { ForbiddenError } from "@/server/errors";
import { makeActor, makeClient, makeEditor, makeProject, makeVideos, prisma, resetDb } from "../support/db";
import { assignment, invLine, invoice, line, salesOrder } from "./helpers";

const today = () => todayInTimezone("Asia/Makassar");
const payment = (clientId: string, amount: string) => ({
  clientId, receivedOn: today(), amount, currency: "EUR" as const, manualFxRate: "", fees: "", method: "BANK_TRANSFER" as const, reference: "", notes: "", allocations: [],
});

describe("concurrence et plafonds d'affectation", () => {
  beforeEach(resetDb);

  it("deux affectations simultanées ne dépassent jamais le solde de la facture", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const inv = await createInvoice(admin, invoice({ clientId: client.id, issueDate: today(), lines: [invLine("150", "0")] }));
    const a = await recordClientPayment(admin, payment(client.id, "100"));
    const b = await recordClientPayment(admin, payment(client.id, "100"));
    const results = await Promise.allSettled([
      allocateClientPayment(admin, { paymentId: a.id, invoiceId: inv.id, amount: "100" }),
      allocateClientPayment(admin, { paymentId: b.id, invoiceId: inv.id, amount: "100" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const bal = (await getInvoiceBalances(prisma, [inv.id], today())).get(inv.id)!;
    expect(bal.allocated.toFixed(2)).toBe("100.00");
    // Le reliquat de 50 € s'affecte ensuite explicitement.
    await allocateClientPayment(admin, { paymentId: b.id, invoiceId: inv.id, amount: "50" });
    const after = (await getInvoiceBalances(prisma, [inv.id], today())).get(inv.id)!;
    expect(after.state).toBe("PAID");
  });

  it("un encaissement ne peut pas être affecté au-delà de son disponible ; l'annulation laisse une trace", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const inv1 = await createInvoice(admin, invoice({ clientId: client.id, issueDate: today(), lines: [invLine("80", "0")] }));
    const inv2 = await createInvoice(admin, invoice({ clientId: client.id, issueDate: today(), lines: [invLine("80", "0")] }));
    const p = await recordClientPayment(admin, { ...payment(client.id, "100"), allocations: [{ invoiceId: inv1.id, amount: "80" }] });
    await expect(allocateClientPayment(admin, { paymentId: p.id, invoiceId: inv2.id, amount: "30" })).rejects.toThrow(/disponible/);
    await voidClientPayment(admin, p.id, "Doublon de saisie");
    const voided = await prisma.clientPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(voided.status).toBe("VOIDED");
    expect(await prisma.paymentAllocation.count({ where: { paymentId: p.id, reversedAt: { not: null } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: p.id, action: "payment.void" } })).toBe(1);
  });

  it("génération mensuelle idempotente, y compris en concurrence", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const { id } = await createRetainer(admin, {
      clientId: client.id, title: "Forfait Reels", startsOn: "2026-01-01", endsOn: "", amount: "1500", currency: "EUR", carryOver: "NEXT_PERIOD", createDraftInvoice: true, vatRate: "20", notes: "",
      quotas: [{ videoType: "REEL", quantity: "10" }],
    });
    const results = await Promise.all([generateRetainerPeriod(id, "2026-10-01"), generateRetainerPeriod(id, "2026-10-01")]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const again = await generateRetainerPeriod(id, "2026-10-15");
    expect(again.created).toBe(false);
    expect(await prisma.retainerPeriod.count()).toBe(1);
    expect(await prisma.salesOrder.count()).toBe(1);
    expect(await prisma.invoice.count({ where: { status: "DRAFT" } })).toBe(1);
  });
});

describe("autorisations côté serveur", () => {
  beforeEach(resetDb);

  it("un monteur ne peut ni enregistrer d'encaissement ni créer de vente", async () => {
    const editor = await makeEditor();
    const actor = await makeActor("EDITOR", { editorId: editor.id });
    const client = await makeClient();
    await expect(recordClientPayment(actor, payment(client.id, "10"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createSalesOrder(actor, salesOrder({ clientId: client.id, lines: [line({ unitPrice: "10" })] }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un responsable de production sans accès financier ne voit ni ne saisit de montants", async () => {
    const pm = await makeActor("PRODUCTION_MANAGER", { financeAccess: false });
    const client = await makeClient();
    await expect(createSalesOrder(pm, salesOrder({ clientId: client.id, lines: [line({ unitPrice: "10" })] }))).rejects.toBeInstanceOf(ForbiddenError);
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor();
    await expect(assignEditor(pm, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "40" }))).rejects.toBeInstanceOf(ForbiddenError);
    // Sans prix saisi, l'affectation reste possible ; le coût est « à renseigner ».
    await assignEditor(pm, assignment({ videoId: video.id, editorId: editor.id, rateMode: "", currency: "" }));
    const financePm = await makeActor("PRODUCTION_MANAGER", { financeAccess: true });
    await createSalesOrder(financePm, salesOrder({ clientId: client.id, lines: [line({ unitPrice: "10" })] }));
  });

  it("un monteur ne peut faire avancer que ses propres vidéos, et seulement selon le workflow", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [mine, other] = await makeVideos(project.id, 2);
    const editor = await makeEditor();
    const actor = await makeActor("EDITOR", { editorId: editor.id });
    await assignEditor(admin, assignment({ videoId: mine.id, editorId: editor.id, unitPrice: "30" }));
    await transitionVideo(actor, { videoId: mine.id, to: "EDITING", reason: "" });
    await expect(transitionVideo(actor, { videoId: mine.id, to: "INTERNAL_REVIEW", reason: "" })).rejects.toThrow(/version/);
    await expect(transitionVideo(actor, { videoId: mine.id, to: "DELIVERED", reason: "" })).rejects.toThrow();
    await expect(transitionVideo(actor, { videoId: other.id, to: "EDITING", reason: "" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
