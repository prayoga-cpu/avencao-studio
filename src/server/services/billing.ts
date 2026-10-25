import "server-only";
/**
 * Factures (enregistrées depuis l'outil de facturation habituel), avoirs, encaissements
 * clients, remboursements et règlements prestataires.
 * - « Enregistrer un encaissement / un règlement » = saisie d'un mouvement DÉJÀ réalisé.
 *   Aucun virement ni prélèvement n'est déclenché.
 * - Les affectations sont protégées par verrous de ligne (SELECT … FOR UPDATE) :
 *   pas de double affectation concurrente au-delà du disponible ou du solde.
 * - Un mouvement validé n'est jamais supprimé : il est annulé (VOIDED) avec motif et trace.
 * - Ce module ne revendique aucune conformité de facturation électronique.
 */
import type {
  ClientPaymentInput,
  CreditNoteInput,
  InvoiceInput,
  RefundInput,
  SupplierPaymentInput,
} from "@/features/finance/schemas";
import {
  allocatePaymentSchema,
  clientPaymentSchema,
  creditNoteSchema,
  invoiceSchema,
  issueInvoiceSchema,
  refundSchema,
  supplierPaymentSchema,
} from "@/features/finance/schemas";
import type { Currency } from "@/generated/prisma/enums";
import { addDays, parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { Decimal, dec, lineNet, lineVat, parseDecimalInput, roundMoney, sum, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { computeInvoiceState, type InvoiceStateResult } from "../domain/invoice-state";
import { convert, fxData, resolveFx } from "../fx";
import { assertCan, type Actor } from "../policies";
import { agencyToday, lockRow } from "./common";

// ─────────────────────────────── Soldes ───────────────────────────────

export interface InvoiceBalance extends InvoiceStateResult {
  invoiceId: string;
  totalGross: Decimal;
  creditedGross: Decimal;
  allocated: Decimal;
  refundedOnCredits: Decimal;
  /** Trop-perçu (solde négatif) à rembourser ou conserver en crédit client. */
  overpaid: Decimal;
}

export async function getInvoiceBalances(db: Db, invoiceIds: string[], today: string): Promise<Map<string, InvoiceBalance>> {
  const out = new Map<string, InvoiceBalance>();
  if (invoiceIds.length === 0) return out;
  const [invoices, allocations, credits, refunds] = await Promise.all([
    db.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, status: true, totalGross: true, dueDate: true } }),
    db.paymentAllocation.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: invoiceIds }, reversedAt: null, payment: { status: "RECORDED" } },
      _sum: { amount: true },
    }),
    db.creditNote.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: invoiceIds }, status: "ISSUED" }, _sum: { totalGross: true } }),
    db.clientRefund.findMany({
      where: { status: "RECORDED", creditNote: { invoiceId: { in: invoiceIds } } },
      select: { amount: true, creditNote: { select: { invoiceId: true } } },
    }),
  ]);
  const alloc = new Map(allocations.map((a) => [a.invoiceId, dec(a._sum.amount ?? 0)]));
  const cred = new Map(credits.map((c) => [c.invoiceId, dec(c._sum.totalGross ?? 0)]));
  const refund = new Map<string, Decimal>();
  for (const r of refunds) {
    const id = r.creditNote!.invoiceId;
    refund.set(id, (refund.get(id) ?? new Decimal(0)).plus(dec(r.amount)));
  }
  for (const inv of invoices) {
    const allocated = alloc.get(inv.id) ?? new Decimal(0);
    const refunded = refund.get(inv.id) ?? new Decimal(0);
    const credited = cred.get(inv.id) ?? new Decimal(0);
    const state = computeInvoiceState({
      status: inv.status,
      totalGross: dec(inv.totalGross),
      creditedGross: credited,
      allocated: allocated.minus(refunded),
      dueDate: inv.dueDate ? toDateOnlyString(inv.dueDate) : null,
      today,
    });
    out.set(inv.id, {
      ...state,
      invoiceId: inv.id,
      totalGross: dec(inv.totalGross),
      creditedGross: credited,
      allocated,
      refundedOnCredits: refunded,
      overpaid: state.balance.isNegative() ? state.balance.abs() : new Decimal(0),
    });
  }
  return out;
}

export async function getPaymentAvailability(db: Db, paymentId: string) {
  const payment = await db.clientPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Encaissement introuvable.");
  const [alloc, refunds] = await Promise.all([
    db.paymentAllocation.aggregate({ where: { paymentId, reversedAt: null }, _sum: { amount: true } }),
    db.clientRefund.aggregate({ where: { paymentId, status: "RECORDED" }, _sum: { amount: true } }),
  ]);
  const allocated = dec(alloc._sum.amount ?? 0);
  const refunded = dec(refunds._sum.amount ?? 0);
  return { payment, allocated, refunded, available: dec(payment.amount).minus(allocated).minus(refunded) };
}

// ─────────────────────────────── Factures ───────────────────────────────

interface ComputedLine {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  salesOrderLineId: string | null;
  deductsInvoiceId: string | null;
  position: number;
}

async function computeInvoiceLines(db: Db, d: ReturnType<typeof invoiceSchema.parse>, invoiceId?: string) {
  const currency = d.currency as CurrencyCode;
  const lines: ComputedLine[] = [];
  for (const [i, l] of d.lines.entries()) {
    const qty = dec(l.quantity.replace(",", "."));
    const price = parseDecimalInput(l.unitPrice)!;
    const rate = parseDecimalInput(l.vatRate)!;
    const deducts = str(l.deductsInvoiceId);
    let net = lineNet(qty, price, 0, currency);
    if (deducts) {
      if (d.kind !== "FINAL") throw new DomainError("Seule une facture finale peut déduire un acompte.");
      const deposit = await db.invoice.findUnique({ where: { id: deducts } });
      if (!deposit || deposit.kind !== "DEPOSIT" || deposit.status !== "ISSUED") throw new DomainError("Acompte à déduire introuvable ou non émis.");
      if (deposit.clientId !== d.clientId || deposit.currency !== d.currency) throw new DomainError("L'acompte doit concerner le même client et la même devise.");
      const already = await db.invoiceLine.aggregate({
        where: { deductsInvoiceId: deducts, invoice: { status: { not: "CANCELLED" }, id: invoiceId ? { not: invoiceId } : undefined } },
        _sum: { netAmount: true },
      });
      const remaining = dec(deposit.totalNet).plus(dec(already._sum.netAmount ?? 0));
      if (net.gt(remaining)) throw new DomainError(`Déduction supérieure à l'acompte restant (${remaining.toFixed(2)} HT).`);
      net = net.neg();
    }
    const vat = lineVat(net, rate, currency);
    lines.push({
      description: l.description,
      quantity: qty.toFixed(3),
      unitPrice: deducts ? price.neg().toFixed(2) : price.toFixed(2),
      vatRate: rate.toFixed(2),
      netAmount: net.toFixed(2),
      vatAmount: vat.toFixed(2),
      grossAmount: net.plus(vat).toFixed(2),
      salesOrderLineId: str(l.salesOrderLineId),
      deductsInvoiceId: deducts,
      position: i,
    });
  }
  const totalNet = sum(lines.map((l) => dec(l.netAmount)));
  const totalVat = sum(lines.map((l) => dec(l.vatAmount)));
  if (totalNet.isNegative()) throw new DomainError("Le total HT de la facture ne peut pas être négatif.");
  return { lines, totalNet, totalVat, totalGross: totalNet.plus(totalVat) };
}

async function defaultDueDate(clientId: string, issueDate: string): Promise<string> {
  const [client, settings] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { paymentTermsDays: true } }),
    prisma.agencySettings.findUnique({ where: { id: 1 }, select: { defaultPaymentTermsDays: true } }),
  ]);
  return addDays(issueDate, client?.paymentTermsDays ?? settings?.defaultPaymentTermsDays ?? 30);
}

export async function createInvoice(actor: Actor, input: InvoiceInput): Promise<{ id: string }> {
  assertCan(actor, "invoices.write");
  const d = invoiceSchema.parse(input);
  if (d.status === "ISSUED" && (!str(d.number) || !d.issueDate)) {
    throw new DomainError("Une facture émise exige son numéro et sa date d'émission (outil de facturation).");
  }
  const projectId = str(d.projectId);
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.clientId !== d.clientId) throw new DomainError("Le projet n'appartient pas à ce client.");
  }
  const salesOrderId = str(d.salesOrderId);
  if (salesOrderId) {
    const order = await prisma.salesOrder.findUnique({ where: { id: salesOrderId } });
    if (!order || order.clientId !== d.clientId) throw new DomainError("La vente n'appartient pas à ce client.");
  }
  const today = await agencyToday();
  const fxDate = d.issueDate || today;
  const fx = await resolveFx(prisma, d.currency, fxDate, str(d.manualFxRate));
  const { lines, totalNet, totalVat, totalGross } = await computeInvoiceLines(prisma, d);
  const dueDate = d.dueDate || (d.issueDate ? await defaultDueDate(d.clientId, d.issueDate) : "");
  const invoice = await prisma.invoice.create({
    data: {
      number: str(d.number),
      externalRef: str(d.externalRef),
      clientId: d.clientId,
      projectId,
      salesOrderId,
      kind: d.kind,
      status: d.status,
      issueDate: d.issueDate ? parseDateOnly(d.issueDate) : null,
      dueDate: dueDate ? parseDateOnly(dueDate) : null,
      currency: d.currency,
      ...fxData(fx),
      totalNet: totalNet.toFixed(2),
      totalVat: totalVat.toFixed(2),
      totalGross: totalGross.toFixed(2),
      totalNetEur: convert(totalNet, fx).toFixed(2),
      notes: str(d.notes),
      createdById: actor.id,
      lines: { create: lines },
    },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "invoice.create", entityType: "Invoice", entityId: invoice.id, after: { number: invoice.number, status: invoice.status, totalGross: totalGross.toFixed(2) } });
  return { id: invoice.id };
}

/** Un brouillon reste modifiable ; une facture émise ne se corrige que par avoir. */
export async function updateDraftInvoice(actor: Actor, invoiceId: string, input: InvoiceInput) {
  assertCan(actor, "invoices.write");
  const current = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!current) throw new NotFoundError();
  if (current.status !== "DRAFT") throw new DomainError("Seul un brouillon est modifiable. Pour corriger une facture émise, émettez un avoir.");
  const d = invoiceSchema.parse({ ...input, status: "DRAFT" });
  const today = await agencyToday();
  const fx = await resolveFx(prisma, d.currency, d.issueDate || today, str(d.manualFxRate));
  const { lines, totalNet, totalVat, totalGross } = await computeInvoiceLines(prisma, d, invoiceId);
  await prisma.$transaction(async (tx) => {
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        number: str(d.number),
        externalRef: str(d.externalRef),
        clientId: d.clientId,
        projectId: str(d.projectId),
        salesOrderId: str(d.salesOrderId),
        kind: d.kind,
        issueDate: d.issueDate ? parseDateOnly(d.issueDate) : null,
        dueDate: d.dueDate ? parseDateOnly(d.dueDate) : null,
        currency: d.currency,
        ...fxData(fx),
        totalNet: totalNet.toFixed(2),
        totalVat: totalVat.toFixed(2),
        totalGross: totalGross.toFixed(2),
        totalNetEur: convert(totalNet, fx).toFixed(2),
        notes: str(d.notes),
        version: { increment: 1 },
        lines: { create: lines },
      },
    });
  });
  return { id: invoiceId };
}

export async function issueInvoice(actor: Actor, input: { invoiceId: string; number: string; issueDate: string; dueDate: string; manualFxRate: string }) {
  assertCan(actor, "invoices.write");
  const d = issueInvoiceSchema.parse(input);
  const inv = await prisma.invoice.findUnique({ where: { id: d.invoiceId } });
  if (!inv) throw new NotFoundError();
  if (inv.status !== "DRAFT") throw new DomainError("Facture déjà émise ou annulée.");
  const fx = await resolveFx(prisma, inv.currency, d.issueDate, str(d.manualFxRate));
  const dueDate = d.dueDate || (await defaultDueDate(inv.clientId, d.issueDate));
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        status: "ISSUED",
        number: d.number,
        issueDate: parseDateOnly(d.issueDate),
        dueDate: parseDateOnly(dueDate),
        ...fxData(fx),
        totalNetEur: convert(dec(inv.totalNet), fx).toFixed(2),
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, { actorId: actor.id, action: "invoice.issue", entityType: "Invoice", entityId: inv.id, after: { number: d.number, issueDate: d.issueDate } });
  });
  return { id: inv.id };
}

export async function cancelDraftInvoice(actor: Actor, invoiceId: string, reason: string) {
  assertCan(actor, "invoices.write");
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new NotFoundError();
  if (inv.status !== "DRAFT") throw new DomainError("Une facture émise ne s'annule pas : émettez un avoir.");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || null } });
  await recordAudit(prisma, { actorId: actor.id, action: "invoice.cancel_draft", entityType: "Invoice", entityId: invoiceId, reason });
  return { id: invoiceId };
}

export async function attachInvoicePdf(actor: Actor, invoiceId: string, attachmentId: string) {
  assertCan(actor, "invoices.write");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { pdfAttachmentId: attachmentId } });
}

/** Avoir : réduit la facturation une seule fois, à sa date d'émission. */
export async function createCreditNote(actor: Actor, input: CreditNoteInput): Promise<{ id: string }> {
  assertCan(actor, "invoices.write");
  const d = creditNoteSchema.parse(input);
  const inv = await prisma.invoice.findUnique({ where: { id: d.invoiceId } });
  if (!inv) throw new NotFoundError();
  if (inv.status !== "ISSUED") throw new DomainError("Un avoir porte sur une facture émise.");
  const currency = inv.currency as CurrencyCode;
  const net = roundMoney(parseDecimalInput(d.net)!, currency);
  const vat = lineVat(net, parseDecimalInput(d.vatRate)!, currency);
  const gross = net.plus(vat);
  const fx = await resolveFx(prisma, inv.currency, d.issueDate, str(d.manualFxRate));
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Invoice", inv.id);
    const already = await tx.creditNote.aggregate({ where: { invoiceId: inv.id, status: "ISSUED" }, _sum: { totalGross: true, totalNet: true } });
    if (dec(already._sum.totalGross ?? 0).plus(gross).gt(dec(inv.totalGross))) {
      throw new DomainError("Le total des avoirs dépasserait le montant TTC de la facture.");
    }
    const cn = await tx.creditNote.create({
      data: {
        number: str(d.number),
        invoiceId: inv.id,
        clientId: inv.clientId,
        issueDate: parseDateOnly(d.issueDate),
        currency: inv.currency,
        ...fxData(fx),
        vatRate: parseDecimalInput(d.vatRate)!.toFixed(2),
        totalNet: net.toFixed(2),
        totalVat: vat.toFixed(2),
        totalGross: gross.toFixed(2),
        totalNetEur: convert(net, fx).toFixed(2),
        reason: d.reason,
        createdById: actor.id,
      },
    });
    await recordAudit(tx, { actorId: actor.id, action: "creditnote.create", entityType: "CreditNote", entityId: cn.id, after: { invoiceId: inv.id, gross: gross.toFixed(2) }, reason: d.reason });
    return { id: cn.id };
  });
}

// ─────────────────────────────── Encaissements ───────────────────────────────

async function allocateInTx(tx: Db, actor: Actor, paymentId: string, invoiceId: string, amount: Decimal) {
  await lockRow(tx, "ClientPayment", paymentId);
  await lockRow(tx, "Invoice", invoiceId);
  const { payment, available } = await getPaymentAvailability(tx, paymentId);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError("Facture introuvable.");
  if (payment.status !== "RECORDED") throw new DomainError("Encaissement annulé.");
  if (invoice.status !== "ISSUED") throw new DomainError("Seule une facture émise peut recevoir un encaissement.");
  if (invoice.clientId !== payment.clientId) throw new DomainError("La facture et l'encaissement concernent des clients différents.");
  if (invoice.currency !== payment.currency) throw new DomainError("Devise différente : affectation impossible (conversion non gérée en V1).");
  const today = await agencyToday();
  const balance = (await getInvoiceBalances(tx, [invoiceId], today)).get(invoiceId)!.balance;
  if (amount.gt(available)) throw new DomainError(`Montant supérieur au disponible de l'encaissement (${available.toFixed(2)} ${payment.currency}).`);
  if (amount.gt(balance)) {
    throw new DomainError(`Montant supérieur au solde de la facture (${balance.toFixed(2)} ${invoice.currency}). Le surplus reste non affecté (crédit client).`);
  }
  await tx.paymentAllocation.create({ data: { paymentId, invoiceId, amount: amount.toFixed(2), createdById: actor.id } });
}

export async function recordClientPayment(actor: Actor, input: ClientPaymentInput): Promise<{ id: string }> {
  assertCan(actor, "payments.write");
  const d = clientPaymentSchema.parse(input);
  const currency = d.currency as CurrencyCode;
  const amount = roundMoney(parseDecimalInput(d.amount)!, currency);
  const fees = d.fees ? roundMoney(parseDecimalInput(d.fees)!, currency) : new Decimal(0);
  if (fees.gt(amount)) throw new DomainError("Les frais dépassent le montant reçu.");
  const fx = await resolveFx(prisma, d.currency, d.receivedOn, str(d.manualFxRate));
  const id = await prisma.$transaction(
    async (tx) => {
      const payment = await tx.clientPayment.create({
        data: {
          clientId: d.clientId,
          receivedOn: parseDateOnly(d.receivedOn),
          amount: amount.toFixed(2),
          currency: d.currency,
          ...fxData(fx),
          amountEur: convert(amount, fx).toFixed(2),
          fees: fees.toFixed(2),
          feesEur: convert(fees, fx).toFixed(2),
          method: d.method,
          reference: str(d.reference),
          notes: str(d.notes),
          createdById: actor.id,
        },
      });
      for (const a of d.allocations) {
        await allocateInTx(tx, actor, payment.id, a.invoiceId, roundMoney(parseDecimalInput(a.amount)!, currency));
      }
      await recordAudit(tx, { actorId: actor.id, action: "payment.record", entityType: "ClientPayment", entityId: payment.id, after: { amount: amount.toFixed(2), currency: d.currency, allocations: d.allocations } });
      return payment.id;
    },
    { timeout: 15_000 },
  );
  return { id };
}

export async function allocateClientPayment(actor: Actor, input: { paymentId: string; invoiceId: string; amount: string }) {
  assertCan(actor, "payments.write");
  const d = allocatePaymentSchema.parse(input);
  await prisma.$transaction(
    async (tx) => {
      const payment = await tx.clientPayment.findUnique({ where: { id: d.paymentId }, select: { currency: true } });
      if (!payment) throw new NotFoundError();
      await allocateInTx(tx, actor, d.paymentId, d.invoiceId, roundMoney(parseDecimalInput(d.amount)!, payment.currency as CurrencyCode));
      await recordAudit(tx, { actorId: actor.id, action: "payment.allocate", entityType: "ClientPayment", entityId: d.paymentId, after: d });
    },
    { timeout: 15_000 },
  );
  return { id: d.paymentId };
}

export async function reverseAllocation(actor: Actor, allocationId: string, reason: string) {
  assertCan(actor, "payments.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  const a = await prisma.paymentAllocation.findUnique({ where: { id: allocationId } });
  if (!a || a.reversedAt) throw new NotFoundError();
  await prisma.$transaction(async (tx) => {
    await tx.paymentAllocation.update({ where: { id: allocationId }, data: { reversedAt: new Date(), reverseReason: reason, reversedById: actor.id } });
    await recordAudit(tx, { actorId: actor.id, action: "payment.allocation_reverse", entityType: "PaymentAllocation", entityId: allocationId, before: a, reason });
  });
  return { id: allocationId };
}

/** Rectification : l'encaissement est marqué annulé (jamais supprimé). */
export async function voidClientPayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, "payments.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "ClientPayment", paymentId);
    const p = await tx.clientPayment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundError();
    if (p.status === "VOIDED") throw new DomainError("Déjà annulé.");
    const refunds = await tx.clientRefund.count({ where: { paymentId, status: "RECORDED" } });
    if (refunds) throw new DomainError("Un remboursement est lié à cet encaissement : annulez-le d'abord.");
    await tx.paymentAllocation.updateMany({
      where: { paymentId, reversedAt: null },
      data: { reversedAt: new Date(), reverseReason: `Encaissement annulé : ${reason}`, reversedById: actor.id },
    });
    await tx.clientPayment.update({ where: { id: paymentId }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason, voidedById: actor.id } });
    await recordAudit(tx, { actorId: actor.id, action: "payment.void", entityType: "ClientPayment", entityId: paymentId, before: p, reason });
  });
  return { id: paymentId };
}

/**
 * Remboursement : sortie de trésorerie. Lié à un avoir (trop-perçu après avoir) ou au
 * reliquat non affecté d'un encaissement. Ne réduit jamais une seconde fois le CA.
 */
export async function recordRefund(actor: Actor, input: RefundInput): Promise<{ id: string }> {
  assertCan(actor, "payments.write");
  const d = refundSchema.parse(input);
  const paymentId = str(d.paymentId);
  const creditNoteId = str(d.creditNoteId);
  if (!paymentId === !creditNoteId) throw new DomainError("Rattachez le remboursement à un avoir OU à un encaissement.");
  return prisma.$transaction(async (tx) => {
    let clientId: string;
    let currency: Currency;
    const today = await agencyToday();
    if (paymentId) {
      await lockRow(tx, "ClientPayment", paymentId);
      const { payment, available } = await getPaymentAvailability(tx, paymentId);
      if (payment.status !== "RECORDED") throw new DomainError("Encaissement annulé.");
      const amount = roundMoney(parseDecimalInput(d.amount)!, payment.currency as CurrencyCode);
      if (amount.gt(available)) throw new DomainError(`Montant supérieur au reliquat non affecté (${available.toFixed(2)} ${payment.currency}).`);
      clientId = payment.clientId;
      currency = payment.currency;
    } else {
      const cn = await tx.creditNote.findUnique({ where: { id: creditNoteId! } });
      if (!cn || cn.status !== "ISSUED") throw new NotFoundError("Avoir introuvable.");
      await lockRow(tx, "Invoice", cn.invoiceId);
      const amount = roundMoney(parseDecimalInput(d.amount)!, cn.currency as CurrencyCode);
      const refundedOnCn = await tx.clientRefund.aggregate({ where: { creditNoteId: cn.id, status: "RECORDED" }, _sum: { amount: true } });
      if (dec(refundedOnCn._sum.amount ?? 0).plus(amount).gt(dec(cn.totalGross))) throw new DomainError("Montant supérieur à l'avoir.");
      const balance = (await getInvoiceBalances(tx, [cn.invoiceId], today)).get(cn.invoiceId)!;
      if (amount.gt(balance.overpaid)) {
        throw new DomainError(`Aucun trop-perçu suffisant sur la facture (${balance.overpaid.toFixed(2)} ${cn.currency}) : un avoir sur facture impayée réduit simplement le solde.`);
      }
      clientId = cn.clientId;
      currency = cn.currency;
    }
    const amount = roundMoney(parseDecimalInput(d.amount)!, currency as CurrencyCode);
    const fx = await resolveFx(tx, currency, d.refundedOn, str(d.manualFxRate));
    const refund = await tx.clientRefund.create({
      data: {
        clientId,
        paymentId,
        creditNoteId,
        refundedOn: parseDateOnly(d.refundedOn),
        amount: amount.toFixed(2),
        currency,
        ...fxData(fx),
        amountEur: convert(amount, fx).toFixed(2),
        method: d.method,
        reference: str(d.reference),
        reason: d.reason,
        createdById: actor.id,
      },
    });
    await recordAudit(tx, { actorId: actor.id, action: "refund.record", entityType: "ClientRefund", entityId: refund.id, after: { amount: amount.toFixed(2), currency }, reason: d.reason });
    return { id: refund.id };
  });
}

export async function voidRefund(actor: Actor, refundId: string, reason: string) {
  assertCan(actor, "payments.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  const r = await prisma.clientRefund.findUnique({ where: { id: refundId } });
  if (!r || r.status === "VOIDED") throw new NotFoundError();
  await prisma.clientRefund.update({ where: { id: refundId }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
  await recordAudit(prisma, { actorId: actor.id, action: "refund.void", entityType: "ClientRefund", entityId: refundId, before: r, reason });
  return { id: refundId };
}

// ─────────────────────────────── Règlements prestataires ───────────────────────────────

export async function getCostPaidAmounts(db: Db, costIds: string[]) {
  const rows = await db.supplierPaymentAllocation.groupBy({
    by: ["directCostId"],
    where: { directCostId: { in: costIds }, reversedAt: null, payment: { status: "RECORDED" } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.directCostId, dec(r._sum.amount ?? 0)]));
}

/**
 * Règlement monteur déjà effectué, couvrant un ou plusieurs coûts VALIDÉS (paiements
 * partiels possibles). Écart de change entre taux d'engagement et taux de règlement
 * conservé séparément du coût.
 */
export async function recordSupplierPayment(actor: Actor, input: SupplierPaymentInput): Promise<{ id: string }> {
  assertCan(actor, "supplierPayments.write");
  const d = supplierPaymentSchema.parse(input);
  const currency = d.currency as CurrencyCode;
  const fx = await resolveFx(prisma, d.currency, d.paidOn, str(d.manualFxRate));
  const fees = d.fees ? roundMoney(parseDecimalInput(d.fees)!, currency) : new Decimal(0);
  const ids = d.allocations.map((a) => a.directCostId);
  if (new Set(ids).size !== ids.length) throw new DomainError("Un coût apparaît deux fois.");
  return prisma.$transaction(
    async (tx) => {
      const rows: { directCostId: string; amount: Decimal; atCost: Decimal; atPay: Decimal }[] = [];
      for (const a of d.allocations) {
        await lockRow(tx, "DirectCost", a.directCostId);
        const cost = await tx.directCost.findUnique({ where: { id: a.directCostId } });
        if (!cost) throw new NotFoundError("Coût introuvable.");
        if (cost.editorId !== d.editorId) throw new DomainError("Un coût sélectionné concerne un autre prestataire.");
        if (cost.stage !== "VALIDATED") throw new DomainError(`« ${cost.label} » n'est pas validé : validez la mission avant de la régler.`);
        if (cost.currency !== d.currency) throw new DomainError(`« ${cost.label} » est en ${cost.currency} : règlement en ${d.currency} impossible.`);
        const paid = (await getCostPaidAmounts(tx, [cost.id])).get(cost.id) ?? new Decimal(0);
        const remaining = dec(cost.amount).minus(paid);
        const amount = roundMoney(parseDecimalInput(a.amount)!, currency);
        if (amount.gt(remaining)) throw new DomainError(`Montant supérieur au restant dû sur « ${cost.label} » (${remaining.toFixed(2)} ${cost.currency}).`);
        const atCost = convert(amount, { unitsPerEur: dec(cost.fxUnitsPerEur!), rateDate: cost.fxRateDate!, source: cost.fxSource! });
        rows.push({ directCostId: cost.id, amount, atCost, atPay: convert(amount, fx) });
      }
      const total = sum(rows.map((r) => r.amount));
      const payment = await tx.supplierPayment.create({
        data: {
          editorId: d.editorId,
          paidOn: parseDateOnly(d.paidOn),
          amount: total.toFixed(2),
          currency: d.currency,
          ...fxData(fx),
          amountEur: convert(total, fx).toFixed(2),
          fees: fees.toFixed(2),
          feesEur: convert(fees, fx).toFixed(2),
          method: d.method,
          reference: str(d.reference),
          notes: str(d.notes),
          createdById: actor.id,
          allocations: {
            create: rows.map((r) => ({
              directCostId: r.directCostId,
              amount: r.amount.toFixed(2),
              amountEurAtCost: r.atCost.toFixed(2),
              amountEurAtPayment: r.atPay.toFixed(2),
              fxDifferenceEur: r.atPay.minus(r.atCost).toFixed(2),
            })),
          },
        },
      });
      await recordAudit(tx, { actorId: actor.id, action: "supplier_payment.record", entityType: "SupplierPayment", entityId: payment.id, after: { total: total.toFixed(2), currency: d.currency, costs: ids } });
      return { id: payment.id };
    },
    { timeout: 15_000 },
  );
}

export async function voidSupplierPayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, "supplierPayments.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "SupplierPayment", paymentId);
    const p = await tx.supplierPayment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundError();
    if (p.status === "VOIDED") throw new DomainError("Déjà annulé.");
    await tx.supplierPaymentAllocation.updateMany({ where: { paymentId, reversedAt: null }, data: { reversedAt: new Date(), reverseReason: reason } });
    await tx.supplierPayment.update({ where: { id: paymentId }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason, voidedById: actor.id } });
    await recordAudit(tx, { actorId: actor.id, action: "supplier_payment.void", entityType: "SupplierPayment", entityId: paymentId, before: p, reason });
  });
  return { id: paymentId };
}

/** Dette prestataire : coûts engagés ou validés non réglés, par devise d'origine. */
export async function getEditorBalances(db: Db, editorIds?: string[]) {
  const costs = await db.directCost.findMany({
    where: {
      editorId: editorIds ? { in: editorIds } : { not: null },
      stage: { in: ["COMMITTED", "VALIDATED"] },
      amount: { not: null },
    },
    select: { id: true, editorId: true, currency: true, amount: true, amountEur: true, stage: true },
  });
  const paid = await getCostPaidAmounts(db, costs.map((c) => c.id));
  const out = new Map<string, { byCurrency: Map<string, { committed: Decimal; validated: Decimal; paid: Decimal; due: Decimal; payable: Decimal }>; dueEur: Decimal }>();
  for (const c of costs) {
    const entry = out.get(c.editorId!) ?? { byCurrency: new Map(), dueEur: new Decimal(0) };
    const cur = entry.byCurrency.get(c.currency) ?? { committed: new Decimal(0), validated: new Decimal(0), paid: new Decimal(0), due: new Decimal(0), payable: new Decimal(0) };
    const amount = dec(c.amount);
    const p = paid.get(c.id) ?? new Decimal(0);
    const remaining = amount.minus(p);
    if (c.stage === "COMMITTED") cur.committed = cur.committed.plus(amount);
    else {
      cur.validated = cur.validated.plus(amount);
      cur.payable = cur.payable.plus(remaining);
    }
    cur.paid = cur.paid.plus(p);
    cur.due = cur.due.plus(remaining);
    entry.byCurrency.set(c.currency, cur);
    if (!amount.isZero()) entry.dueEur = entry.dueEur.plus(roundMoney(remaining.mul(dec(c.amountEur)).div(amount), "EUR"));
    out.set(c.editorId!, entry);
  }
  return out;
}

export { toDateOnlyString };
