import { beforeEach, describe, expect, it } from "vitest";
import { resolvePeriod, todayInTimezone } from "@/lib/dates";
import { assignEditor, validateAssignment } from "@/server/services/assignments";
import { createClient } from "@/server/services/clients";
import { createDirectCost } from "@/server/services/costs";
import {
  createCreditNote,
  createInvoice,
  getEditorBalances,
  getInvoiceBalances,
  recordClientPayment,
  recordRefund,
  recordSupplierPayment,
} from "@/server/services/billing";
import { getPeriodMetrics } from "@/server/services/metrics";
import { getProjectsFinancials, getVideosFinancials } from "@/server/services/profitability";
import { createSalesOrder } from "@/server/services/sales";
import { transitionVideo } from "@/server/services/videos";
import { makeActor, makeClient, makeEditor, makeProject, makeVideos, prisma, resetDb, setRate } from "../support/db";
import { assignment, invLine, invoice, line, salesOrder } from "./helpers";

const today = () => todayInTimezone("Asia/Makassar");
const thisMonth = () => resolvePeriod("month", today());

async function deliver(videoIds: string[]) {
  await prisma.video.updateMany({ where: { id: { in: videoIds } }, data: { status: "DELIVERED", deliveredAt: new Date() } });
}

describe("scénarios financiers obligatoires (PostgreSQL)", () => {
  beforeEach(resetDb);

  it("1. Vidéo 300 € HT, coûts 90 + 30 + 10 → marge 170 € (56,67 %) ; un paiement de 150 € ne change pas la marge", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editorA = await makeEditor("Monteur A");
    const editorB = await makeEditor("Motion B");
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, lines: [line({ unitPrice: "300", allocationMethod: "EQUAL", allocations: [{ videoId: video.id, value: "" }] })] }));
    await assignEditor(admin, assignment({ videoId: video.id, editorId: editorA.id, unitPrice: "90" }));
    await assignEditor(admin, assignment({ videoId: video.id, editorId: editorB.id, role: "MOTION", isPrimary: false, unitPrice: "30" }));
    await createDirectCost(admin, { kind: "PURCHASE", label: "Achat musique", editorId: "", supplierName: "Banque de sons", projectId: "", videoId: video.id, amount: "10", currency: "EUR", manualFxRate: "", incurredOn: "2026-10-02", stage: "COMMITTED", periodMonth: "", nonRecoverableVat: "", notes: "" });

    const before = (await getVideosFinancials(prisma, [video.id])).get(video.id)!;
    expect(before.revenueEur.toFixed(2)).toBe("300.00");
    expect(before.costsEur.toFixed(2)).toBe("130.00");
    expect(before.marginEur.toFixed(2)).toBe("170.00");
    expect(before.ratePct?.toFixed(2)).toBe("56.67");

    const inv = await createInvoice(admin, invoice({ clientId: client.id, projectId: project.id, lines: [invLine("300", "20")] }));
    await recordClientPayment(admin, { clientId: client.id, receivedOn: "2026-10-10", amount: "150", currency: "EUR", manualFxRate: "", fees: "", method: "BANK_TRANSFER", reference: "", notes: "", allocations: [{ invoiceId: inv.id, amount: "150" }] });

    const after = (await getVideosFinancials(prisma, [video.id])).get(video.id)!;
    expect(after.marginEur.toFixed(2)).toBe("170.00");
    const bal = (await getInvoiceBalances(prisma, [inv.id], "2026-10-24")).get(inv.id)!;
    expect(bal.totalGross.toFixed(2)).toBe("360.00");
    expect(bal.balance.toFixed(2)).toBe("210.00");
    expect(bal.state).toBe("PARTIALLY_PAID");
  });

  it("2. Pack 12 Reels à 1 200 € : 100 €/Reel, coût 360 €, marge 840 € (70 %) ; facturer le pack n'ajoute rien au CA livré", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id, "Pack Reels");
    const videos = await makeVideos(project.id, 12);
    const editor = await makeEditor();
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, acceptedOn: today(), lines: [line({ description: "Pack 12 Reels", unitPrice: "1200", allocationMethod: "EQUAL", allocations: videos.map((v) => ({ videoId: v.id, value: "" })) })] }));
    const allocations = await prisma.revenueAllocation.findMany();
    expect(allocations.every((a) => a.amount.toString() === "100")).toBe(true);
    for (const v of videos) await assignEditor(admin, assignment({ videoId: v.id, editorId: editor.id, unitPrice: "30" }));

    const project1 = (await getProjectsFinancials(prisma, [project.id])).get(project.id)!;
    expect(project1.soldEur.toFixed(2)).toBe("1200.00");
    expect(project1.costsEur.toFixed(2)).toBe("360.00");
    expect(project1.marginEur.toFixed(2)).toBe("840.00");
    expect(project1.ratePct?.toFixed(2)).toBe("70.00");

    await createInvoice(admin, invoice({ clientId: client.id, projectId: project.id, issueDate: today(), lines: [invLine("1200", "0")] }));
    await deliver(videos.map((v) => v.id));
    const m = await getPeriodMetrics(thisMonth());
    expect(m.deliveredRevenueEur.toFixed(2)).toBe("1200.00");
    expect(m.invoicedNetEur.toFixed(2)).toBe("1200.00");
    expect(m.deliveredCostsEur.toFixed(2)).toBe("360.00");
    expect(m.productionMarginEur.toFixed(2)).toBe("840.00");
    expect(m.salesSignedEur.toFixed(2)).toBe("1200.00");
  });

  it("3. 1 800 000 IDR au taux manuel de 18 000 = 100 € ; un nouveau taux ne réécrit pas l'engagement", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor("Monteur Bali", "IDR");
    await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "1800000", currency: "IDR", manualFxRate: "18000" }));
    const cost = await prisma.directCost.findFirstOrThrow({ where: { videoId: video.id } });
    expect(cost.amountEur?.toString()).toBe("100");
    expect(cost.fxSource).toBe("MANUAL");
    await setRate(today(), "IDR", "17000");
    const again = await prisma.directCost.findUniqueOrThrow({ where: { id: cost.id } });
    expect(again.amountEur?.toString()).toBe("100");
    expect(again.fxUnitsPerEur?.toString()).toBe("18000");
  });

  it("4. Avoir 100 € : réduction unique du CA facturé ; le remboursement réduit la trésorerie sans seconde réduction", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const inv = await createInvoice(admin, invoice({ clientId: client.id, issueDate: today(), lines: [invLine("500", "0")] }));
    await recordClientPayment(admin, { clientId: client.id, receivedOn: today(), amount: "500", currency: "EUR", manualFxRate: "", fees: "", method: "BANK_TRANSFER", reference: "", notes: "", allocations: [{ invoiceId: inv.id, amount: "500" }] });
    const cn = await createCreditNote(admin, { invoiceId: inv.id, number: "AV-1", issueDate: today(), net: "100", vatRate: "0", reason: "Geste commercial", manualFxRate: "" });
    const m1 = await getPeriodMetrics(thisMonth());
    expect(m1.invoicedNetEur.toFixed(2)).toBe("400.00");
    const overpaid = (await getInvoiceBalances(prisma, [inv.id], today())).get(inv.id)!;
    expect(overpaid.overpaid.toFixed(2)).toBe("100.00");

    await recordRefund(admin, { paymentId: "", creditNoteId: cn.id, refundedOn: today(), amount: "100", manualFxRate: "", method: "BANK_TRANSFER", reference: "", reason: "Remboursement de l'avoir" });
    const m2 = await getPeriodMetrics(thisMonth());
    expect(m2.invoicedNetEur.toFixed(2)).toBe("400.00");
    expect(m2.collectionsEur.toFixed(2)).toBe("500.00");
    expect(m2.refundsEur.toFixed(2)).toBe("100.00");
    expect(m2.netCashFlowEur.toFixed(2)).toBe("400.00");
    const settled = (await getInvoiceBalances(prisma, [inv.id], today())).get(inv.id)!;
    expect(settled.balance.toFixed(2)).toBe("0.00");
    await expect(
      recordRefund(admin, { paymentId: "", creditNoteId: cn.id, refundedOn: today(), amount: "1", manualFxRate: "", method: "BANK_TRANSFER", reference: "", reason: "doublon" }),
    ).rejects.toThrow();
  });

  it("5. Mission engagée non réglée : coût dans la marge, dette visible, aucun décaissement", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor();
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, lines: [line({ unitPrice: "200", allocationMethod: "EQUAL", allocations: [{ videoId: video.id, value: "" }] })] }));
    await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "60" }));
    const fin = (await getVideosFinancials(prisma, [video.id])).get(video.id)!;
    expect(fin.marginEur.toFixed(2)).toBe("140.00");
    const debt = (await getEditorBalances(prisma, [editor.id])).get(editor.id)!;
    expect(debt.dueEur.toFixed(2)).toBe("60.00");
    expect(debt.byCurrency.get("EUR")!.payable.toFixed(2)).toBe("0.00");
    const m = await getPeriodMetrics(thisMonth());
    expect(m.supplierPaymentsEur.toFixed(2)).toBe("0.00");
  });

  it("6. Vidéo annulée avec 40 € dus : dette conservée, revenu annulé selon l'accord, coût dans le résultat", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor();
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, acceptedOn: today(), lines: [line({ unitPrice: "150", allocationMethod: "EQUAL", allocations: [{ videoId: video.id, value: "" }] })] }));
    const { id: assignmentId } = await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "40" }));
    await validateAssignment(admin, assignmentId);
    await transitionVideo(admin, { videoId: video.id, to: "CANCELLED", reason: "Projet abandonné par le client", revenueTreatment: "CANCEL" });

    const debt = (await getEditorBalances(prisma, [editor.id])).get(editor.id)!;
    expect(debt.dueEur.toFixed(2)).toBe("40.00");
    expect(await prisma.revenueAllocation.count()).toBe(0);
    const lineRow = await prisma.salesOrderLine.findFirstOrThrow();
    expect(lineRow.cancelledAmount.toString()).toBe("150");
    const m = await getPeriodMetrics(thisMonth());
    expect(m.salesSignedEur.toFixed(2)).toBe("0.00");
    expect(m.deliveredRevenueEur.toFixed(2)).toBe("0.00");
    expect(m.deliveredCostsEur.toFixed(2)).toBe("40.00");
    expect(m.managementResultEur.toFixed(2)).toBe("-40.00");
  });

  it("7. Projet avec 2 factures et 3 missions : aucun effet multiplicatif", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const videos = await makeVideos(project.id, 3);
    const editor = await makeEditor();
    await createSalesOrder(admin, salesOrder({ clientId: client.id, projectId: project.id, acceptedOn: today(), lines: [line({ quantity: "3", unitPrice: "300", allocationMethod: "EQUAL", allocations: videos.map((v) => ({ videoId: v.id, value: "" })) })] }));
    for (const v of videos) await assignEditor(admin, assignment({ videoId: v.id, editorId: editor.id, unitPrice: "50" }));
    await createInvoice(admin, invoice({ clientId: client.id, projectId: project.id, issueDate: today(), lines: [invLine("450", "0")] }));
    await createInvoice(admin, invoice({ clientId: client.id, projectId: project.id, issueDate: today(), lines: [invLine("450", "0")] }));
    const p = (await getProjectsFinancials(prisma, [project.id])).get(project.id)!;
    expect(p.soldEur.toFixed(2)).toBe("900.00");
    expect(p.costsEur.toFixed(2)).toBe("150.00");
    expect(p.marginEur.toFixed(2)).toBe("750.00");
    const m = await getPeriodMetrics(thisMonth());
    expect(m.invoicedNetEur.toFixed(2)).toBe("900.00");
    expect(m.salesSignedEur.toFixed(2)).toBe("900.00");
  });

  it("8. Coût absent et revenu nul : marge provisoire, taux non calculable", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor();
    await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, rateMode: "", currency: "" }));
    const fin = (await getVideosFinancials(prisma, [video.id])).get(video.id)!;
    expect(fin.status).toBe("INCOMPLETE");
    expect(fin.missingCostCount).toBe(1);
    expect(fin.ratePct).toBeNull();
    const cost = await prisma.directCost.findFirstOrThrow();
    expect(cost.amount).toBeNull();
  });

  it("acompte puis facture finale : la déduction évite de compter deux fois le revenu", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const deposit = await createInvoice(admin, invoice({ clientId: client.id, kind: "DEPOSIT", issueDate: today(), lines: [invLine("300", "20")] }));
    await createInvoice(admin, invoice({
      clientId: client.id,
      kind: "FINAL",
      issueDate: today(),
      lines: [invLine("1000", "20"), invLine("300", "20", { description: "Déduction acompte", deductsInvoiceId: deposit.id })],
    }));
    const m = await getPeriodMetrics(thisMonth());
    expect(m.invoicedNetEur.toFixed(2)).toBe("1000.00");
    await expect(
      createInvoice(admin, invoice({ clientId: client.id, kind: "FINAL", issueDate: today(), lines: [invLine("500", "20"), invLine("1", "20", { deductsInvoiceId: deposit.id })] })),
    ).rejects.toThrow(/acompte restant/);
  });

  it("parcours 4 : règlement monteur couvrant 4 missions validées, payé et restant dû exacts", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const videos = await makeVideos(project.id, 4);
    const editor = await makeEditor();
    const ids: string[] = [];
    for (const v of videos) {
      const { id } = await assignEditor(admin, assignment({ videoId: v.id, editorId: editor.id, unitPrice: "30" }));
      await validateAssignment(admin, id);
      ids.push(id);
    }
    const costs = await prisma.directCost.findMany({ where: { assignmentId: { in: ids } }, orderBy: { createdAt: "asc" } });
    await recordSupplierPayment(admin, {
      editorId: editor.id, paidOn: today(), currency: "EUR", manualFxRate: "", fees: "", method: "WISE", reference: "", notes: "",
      allocations: costs.map((c, i) => ({ directCostId: c.id, amount: i === 3 ? "15" : "30" })),
    });
    const debt = (await getEditorBalances(prisma, [editor.id])).get(editor.id)!.byCurrency.get("EUR")!;
    expect(debt.paid.toFixed(2)).toBe("105.00");
    expect(debt.due.toFixed(2)).toBe("15.00");
    await expect(
      recordSupplierPayment(admin, { editorId: editor.id, paidOn: today(), currency: "EUR", manualFxRate: "", fees: "", method: "WISE", reference: "", notes: "", allocations: [{ directCostId: costs[3].id, amount: "16" }] }),
    ).rejects.toThrow(/restant dû/);
  });

  it("écart de change conservé séparément du coût", async () => {
    const admin = await makeActor("ADMIN");
    const client = await makeClient();
    const project = await makeProject(client.id);
    const [video] = await makeVideos(project.id, 1);
    const editor = await makeEditor("Monteur IDR", "IDR");
    const { id } = await assignEditor(admin, assignment({ videoId: video.id, editorId: editor.id, unitPrice: "1800000", currency: "IDR", manualFxRate: "18000" }));
    await validateAssignment(admin, id);
    const cost = await prisma.directCost.findFirstOrThrow({ where: { assignmentId: id } });
    await recordSupplierPayment(admin, { editorId: editor.id, paidOn: today(), currency: "IDR", manualFxRate: "18500", fees: "", method: "WISE", reference: "", notes: "", allocations: [{ directCostId: cost.id, amount: "1800000" }] });
    const alloc = await prisma.supplierPaymentAllocation.findFirstOrThrow();
    expect(alloc.amountEurAtCost.toString()).toBe("100");
    expect(alloc.amountEurAtPayment.toString()).toBe("97.3");
    expect(alloc.fxDifferenceEur.toString()).toBe("-2.7");
    const unchanged = await prisma.directCost.findUniqueOrThrow({ where: { id: cost.id } });
    expect(unchanged.amountEur?.toString()).toBe("100");
  });
});

describe("création client", () => {
  beforeEach(resetDb);
  it("détecte un doublon par email mais jamais par la seule similarité du nom", async () => {
    const admin = await makeActor("ADMIN");
    const base = {
      kind: "COMPANY" as const, status: "ACTIVE" as const, legalName: "", phone: "", whatsapp: "", country: "", billingAddress: "", vatNumber: "", companyRegistration: "", website: "", instagram: "", tiktok: "", youtube: "", linkedin: "", otherSocial: "", acquisitionSource: "", ownerId: "", currency: "EUR" as const, paymentTermsDays: "", driveUrl: "", creativePreferences: "", references: "", internalNotes: "", nextFollowUpOn: "", tags: "", contactFirstName: "", contactLastName: "", contactJobTitle: "", contactEmail: "", contactPhone: "", confirmDuplicate: false,
    };
    const first = await createClient(admin, { ...base, displayName: "Studio Nova", email: "hello@nova.test" });
    expect("id" in first).toBe(true);
    const sameName = await createClient(admin, { ...base, displayName: "Studio Nova", email: "autre@exemple.test" });
    expect("id" in sameName).toBe(true);
    const sameEmail = await createClient(admin, { ...base, displayName: "Nova Productions", email: "HELLO@nova.test" });
    expect("duplicates" in sameEmail && sameEmail.duplicates[0].reason).toBe("même email");
    const confirmed = await createClient(admin, { ...base, displayName: "Nova Productions", email: "hello@nova.test", confirmDuplicate: true });
    expect("id" in confirmed).toBe(true);
  });
});
