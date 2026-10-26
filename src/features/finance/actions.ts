"use server";

import type {
  CatalogItemInput,
  ClientPaymentInput,
  CostAllocationInput,
  CreditNoteInput,
  DirectCostInput,
  ExchangeRateInput,
  ExpenseInput,
  InvoiceInput,
  ProjectPriceInput,
  ReallocateInput,
  RefundInput,
  RetainerInput,
  SalesOrderInput,
  SupplierPaymentInput,
} from "./schemas";
import { catalogItemSchema, exchangeRateSchema } from "./schemas";
import { safeAction } from "@/server/actions";
import { recordAudit } from "@/server/audit";
import { actorFor } from "@/server/auth/session";
import { decOrNull, intOrNull, str } from "@/server/convert";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { parseDateOnly } from "@/lib/dates";
import { revalidateApp } from "@/server/revalidate";
import * as billing from "@/server/services/billing";
import * as costs from "@/server/services/costs";
import * as retainers from "@/server/services/retainers";
import * as sales from "@/server/services/sales";

function done<T>(r: T): T {
  revalidateApp();
  return r;
}

export async function createSalesOrderAction(input: SalesOrderInput) {
  return safeAction(async () => done(await sales.createSalesOrder(await actorFor("sales.write"), input)), "Vente enregistrée.");
}
export async function setProjectPriceAction(input: ProjectPriceInput) {
  return safeAction(async () => done(await sales.setProjectPrice(await actorFor("sales.write"), input)), "Prix du projet enregistré.");
}
export async function reallocateLineAction(input: ReallocateInput) {
  return safeAction(async () => done(await sales.reallocateLine(await actorFor("sales.write"), input)), "Répartition enregistrée.");
}
export async function cancelSalesLineAction(input: { lineId: string; amount: string; cancelledOn: string; reason: string }) {
  return safeAction(async () => done(await sales.cancelSalesLine(await actorFor("sales.write"), input)), "Annulation enregistrée.");
}
export async function cancelSalesOrderAction(id: string, reason: string) {
  return safeAction(async () => done(await sales.cancelSalesOrder(await actorFor("sales.write"), id, reason)), "Vente annulée.");
}

export async function createInvoiceAction(input: InvoiceInput) {
  return safeAction(async () => done(await billing.createInvoice(await actorFor("invoices.write"), input)), "Facture enregistrée.");
}
export async function updateDraftInvoiceAction(id: string, input: InvoiceInput) {
  return safeAction(async () => done(await billing.updateDraftInvoice(await actorFor("invoices.write"), id, input)), "Brouillon enregistré.");
}
export async function issueInvoiceAction(input: { invoiceId: string; number: string; issueDate: string; dueDate: string; manualFxRate: string }) {
  return safeAction(async () => done(await billing.issueInvoice(await actorFor("invoices.write"), input)), "Facture marquée émise.");
}
export async function cancelDraftInvoiceAction(id: string, reason: string) {
  return safeAction(async () => done(await billing.cancelDraftInvoice(await actorFor("invoices.write"), id, reason)), "Brouillon annulé.");
}
export async function createCreditNoteAction(input: CreditNoteInput) {
  return safeAction(async () => done(await billing.createCreditNote(await actorFor("invoices.write"), input)), "Avoir enregistré.");
}

export async function recordClientPaymentAction(input: ClientPaymentInput) {
  return safeAction(async () => done(await billing.recordClientPayment(await actorFor("payments.write"), input)), "Encaissement enregistré (aucun prélèvement n'a été déclenché).");
}
export async function allocateClientPaymentAction(input: { paymentId: string; invoiceId: string; amount: string }) {
  return safeAction(async () => done(await billing.allocateClientPayment(await actorFor("payments.write"), input)), "Affectation enregistrée.");
}
export async function reverseAllocationAction(id: string, reason: string) {
  return safeAction(async () => done(await billing.reverseAllocation(await actorFor("payments.write"), id, reason)), "Affectation annulée (tracée).");
}
export async function voidClientPaymentAction(id: string, reason: string) {
  return safeAction(async () => done(await billing.voidClientPayment(await actorFor("payments.write"), id, reason)), "Encaissement annulé (tracé).");
}
export async function recordRefundAction(input: RefundInput) {
  return safeAction(async () => done(await billing.recordRefund(await actorFor("payments.write"), input)), "Remboursement enregistré.");
}
export async function voidRefundAction(id: string, reason: string) {
  return safeAction(async () => done(await billing.voidRefund(await actorFor("payments.write"), id, reason)), "Remboursement annulé (tracé).");
}

export async function recordSupplierPaymentAction(input: SupplierPaymentInput) {
  return safeAction(async () => done(await billing.recordSupplierPayment(await actorFor("supplierPayments.write"), input)), "Règlement enregistré (aucun virement n'a été déclenché).");
}
export async function voidSupplierPaymentAction(id: string, reason: string) {
  return safeAction(async () => done(await billing.voidSupplierPayment(await actorFor("supplierPayments.write"), id, reason)), "Règlement annulé (tracé).");
}

export async function createDirectCostAction(input: DirectCostInput) {
  return safeAction(async () => done(await costs.createDirectCost(await actorFor("costs.write"), input)), "Coût enregistré.");
}
export async function setCostAllocationsAction(input: CostAllocationInput) {
  return safeAction(async () => done(await costs.setCostAllocations(await actorFor("costs.write"), input)), "Allocation enregistrée.");
}
export async function setCostStageAction(input: { costId: string; stage: "ESTIMATED" | "COMMITTED" | "VALIDATED" | "CANCELLED"; reason: string }) {
  return safeAction(async () => done(await costs.setCostStage(await actorFor("costs.write"), input)), "Étape du coût mise à jour.");
}
/** Variante liable (`.bind(null, costId, stage)`) pour les boutons de confirmation rendus côté serveur. */
export async function setCostStageWithReasonAction(costId: string, stage: "ESTIMATED" | "COMMITTED" | "VALIDATED" | "CANCELLED", reason: string) {
  return setCostStageAction({ costId, stage, reason });
}

export async function createExpenseAction(input: ExpenseInput) {
  return safeAction(async () => done(await costs.createExpense(await actorFor("expenses.write"), input)), "Charge enregistrée.");
}
export async function markExpensePaidAction(id: string, paidOn: string) {
  return safeAction(async () => done(await costs.markExpensePaid(await actorFor("expenses.write"), id, paidOn)), "Charge marquée payée.");
}
export async function voidExpenseAction(id: string, reason: string) {
  return safeAction(async () => done(await costs.voidExpense(await actorFor("expenses.write"), id, reason)), "Charge annulée (tracée).");
}

export async function createRetainerAction(input: RetainerInput) {
  return safeAction(async () => done(await retainers.createRetainer(await actorFor("retainers.write"), input)), "Forfait créé.");
}
export async function generateRetainerPeriodAction(retainerId: string, month: string) {
  return safeAction(async () => {
    const actor = await actorFor("retainers.write");
    return done(await retainers.generateRetainerPeriod(retainerId, month, actor.id));
  });
}
export async function setRetainerStatusAction(id: string, status: "ACTIVE" | "PAUSED" | "ENDED") {
  return safeAction(async () => {
    const actor = await actorFor("retainers.write");
    await prisma.retainer.update({ where: { id }, data: { status } });
    await recordAudit(prisma, { actorId: actor.id, action: "retainer.status", entityType: "Retainer", entityId: id, after: { status } });
    return done(null);
  }, "Statut du forfait mis à jour.");
}
export async function consumeRetainerCreditAction(periodId: string, videoId: string) {
  return safeAction(async () => done(await retainers.useRetainerCredit(await actorFor("retainers.write"), periodId, videoId)), "Crédit consommé.");
}

export async function saveExchangeRateAction(input: ExchangeRateInput) {
  return safeAction(async () => {
    const actor = await actorFor("settings.manage");
    const d = exchangeRateSchema.parse(input);
    const rate = decOrNull(d.unitsPerEur)!;
    await prisma.exchangeRate.upsert({
      where: { date_currency: { date: parseDateOnly(d.date), currency: d.currency } },
      update: { unitsPerEur: rate.toFixed(), note: str(d.note), source: "MANUAL", createdById: actor.id },
      create: { date: parseDateOnly(d.date), currency: d.currency, unitsPerEur: rate.toFixed(), note: str(d.note), source: "MANUAL", createdById: actor.id },
    });
    await recordAudit(prisma, { actorId: actor.id, action: "fx.save", entityType: "ExchangeRate", entityId: `${d.currency}-${d.date}`, after: d });
    return done(null);
  }, "Taux enregistré. Les opérations passées gardent leur taux figé.");
}

export async function saveCatalogItemAction(input: CatalogItemInput) {
  return safeAction(async () => {
    const actor = await actorFor("settings.manage");
    const d = catalogItemSchema.parse(input);
    const data = {
      name: d.name, description: str(d.description), videoType: d.videoType === "" ? null : d.videoType, unit: d.unit,
      unitPrice: decOrNull(d.unitPrice)!.toFixed(2), currency: d.currency, includedRevisions: intOrNull(d.includedRevisions),
      turnaroundDays: intOrNull(d.turnaroundDays), targetCost: decOrNull(d.targetCost)?.toFixed(2) ?? null, active: d.active,
    };
    const row = d.id ? await prisma.serviceCatalogItem.update({ where: { id: d.id }, data }) : await prisma.serviceCatalogItem.create({ data });
    await recordAudit(prisma, { actorId: actor.id, action: "catalog.save", entityType: "ServiceCatalogItem", entityId: row.id, after: data });
    if (!row.id) throw new DomainError("Enregistrement impossible.");
    return done({ id: row.id });
  }, "Prestation enregistrée.");
}
