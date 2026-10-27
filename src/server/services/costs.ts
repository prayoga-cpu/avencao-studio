import "server-only";
/**
 * Coûts directs (achats, coûts additionnels, enveloppes mensuelles) et charges de structure.
 * - Un coût direct est un seul enregistrement à travers ses étapes : estimé → engagé → validé.
 *   « Payé » est dérivé des règlements : les étapes ne s'additionnent jamais.
 * - Enveloppe mensuelle : une dépense unique + allocations analytiques aux vidéos ; les
 *   allocations ne s'ajoutent pas à l'enveloppe et le reste non alloué reste visible.
 * - Une dépense est soit un coût direct (DirectCost), soit une charge de structure (Expense).
 */
import type { CostAllocationInput, DirectCostInput, ExpenseInput } from "@/features/finance/schemas";
import { costAllocationSchema, costStageSchema, directCostSchema, expenseSchema } from "@/features/finance/schemas";
import { endOfMonth, parseDateOnly } from "@/lib/dates";
import { Decimal, allocateByWeights, dec, parseDecimalInput, roundMoney, sum, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { dateOrNull, str } from "../convert";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { convert, fxData, resolveFx } from "../fx";
import { assertCan, type Actor } from "../policies";
import { getSettings } from "../settings";
import { lockRow } from "./common";

export async function createDirectCost(actor: Actor, input: DirectCostInput): Promise<{ id: string }> {
  assertCan(actor, "costs.write");
  const d = directCostSchema.parse(input);
  if (d.stage === "VALIDATED") assertCan(actor, "costs.validate");
  const amount = d.amount ? roundMoney(parseDecimalInput(d.amount)!, d.currency as CurrencyCode) : null;
  if (d.stage === "VALIDATED" && !amount) throw new DomainError("Un coût validé doit avoir un montant.");
  if (d.kind === "ENVELOPE") {
    if (!d.editorId) throw new DomainError("Une enveloppe mensuelle concerne un prestataire.");
    if (!d.periodMonth) throw new DomainError("Indiquez le mois couvert par l'enveloppe.");
    if (d.videoId || d.projectId) throw new DomainError("Une enveloppe n'est pas rattachée à une vidéo : utilisez les allocations.");
  } else if (!d.projectId && !d.videoId) {
    throw new DomainError("Un coût direct est rattaché à un projet ou à une vidéo. Sinon, enregistrez une charge de structure.");
  }
  let projectId = str(d.projectId);
  const videoId = str(d.videoId);
  if (videoId) {
    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { projectId: true } });
    if (!video) throw new NotFoundError("Vidéo introuvable.");
    if (projectId && projectId !== video.projectId) throw new DomainError("La vidéo n'appartient pas à ce projet.");
    projectId = video.projectId;
  }
  const settings = await getSettings();
  const nonRecoverable = d.nonRecoverableVat && settings.nonRecoverableVatInCost ? parseDecimalInput(d.nonRecoverableVat) ?? new Decimal(0) : new Decimal(0);
  const totalCost = amount ? amount.plus(nonRecoverable) : null;
  const fx = totalCost ? await resolveFx(prisma, d.currency, d.incurredOn, str(d.manualFxRate)) : null;

  return prisma.$transaction(async (tx) => {
    const cost = await tx.directCost.create({
      data: {
        kind: d.kind,
        stage: d.stage,
        label: d.label,
        editorId: str(d.editorId),
        supplierName: str(d.supplierName),
        projectId,
        videoId,
        currency: d.currency,
        amount: totalCost?.toFixed(2) ?? null,
        amountEur: totalCost && fx ? convert(totalCost, fx).toFixed(2) : null,
        ...(fx ? fxData(fx) : {}),
        nonRecoverableVat: nonRecoverable.toFixed(2),
        documentRef: str(d.documentRef),
        incurredOn: parseDateOnly(d.incurredOn),
        periodStart: d.periodMonth ? parseDateOnly(`${d.periodMonth}-01`) : null,
        periodEnd: d.periodMonth ? parseDateOnly(endOfMonth(`${d.periodMonth}-01`)) : null,
        committedAt: d.stage !== "ESTIMATED" ? new Date() : null,
        validatedAt: d.stage === "VALIDATED" ? new Date() : null,
        validatedById: d.stage === "VALIDATED" ? actor.id : null,
        notes: str(d.notes),
        createdById: actor.id,
      },
    });
    // Achat au niveau projet : réparti à parts égales entre les vidéos actives (modifiable ensuite).
    if (d.kind !== "ENVELOPE" && !videoId && projectId && totalCost && fx) {
      const videos = await tx.video.findMany({ where: { projectId, status: { not: "CANCELLED" } }, select: { id: true }, orderBy: { position: "asc" } });
      if (videos.length) {
        const parts = allocateByWeights(totalCost, videos.map(() => new Decimal(1)), d.currency as CurrencyCode);
        const partsEur = allocateByWeights(convert(totalCost, fx), parts, "EUR");
        await tx.costAllocation.createMany({
          data: videos.map((v, i) => ({ directCostId: cost.id, videoId: v.id, amount: parts[i].toFixed(2), amountEur: partsEur[i].toFixed(2) })),
        });
      }
    }
    await recordAudit(tx, { actorId: actor.id, action: "cost.create", entityType: "DirectCost", entityId: cost.id, after: { kind: d.kind, amount: totalCost?.toFixed(2) ?? null } });
    return { id: cost.id };
  });
}

/** Allocation analytique d'une enveloppe ou d'un achat projet (remplace la répartition existante). */
export async function setCostAllocations(actor: Actor, input: CostAllocationInput) {
  assertCan(actor, "costs.write");
  const d = costAllocationSchema.parse(input);
  const cost = await prisma.directCost.findUnique({ where: { id: d.costId } });
  if (!cost) throw new NotFoundError();
  if (cost.videoId) throw new DomainError("Ce coût est déjà rattaché à une vidéo précise.");
  if (cost.amount === null || cost.amountEur === null) throw new DomainError("Renseignez d'abord le montant du coût.");
  const ids = d.allocations.map((a) => a.videoId);
  if (new Set(ids).size !== ids.length) throw new DomainError("Vidéo en double.");
  const amounts = d.allocations.map((a) => roundMoney(parseDecimalInput(a.amount)!, cost.currency as CurrencyCode));
  const total = sum(amounts);
  if (total.gt(dec(cost.amount))) {
    throw new DomainError(`Les allocations (${total.toFixed(2)}) dépassent le coût (${dec(cost.amount).toFixed(2)}).`);
  }
  if (cost.projectId) {
    const n = await prisma.video.count({ where: { id: { in: ids }, projectId: cost.projectId } });
    if (n !== ids.length) throw new DomainError("Les vidéos doivent appartenir au projet du coût.");
  }
  // EUR : proportionnel au taux figé du coût ; l'allocation complète prend exactement le montant EUR.
  const fullyAllocated = total.eq(dec(cost.amount));
  const eurTotal = fullyAllocated ? dec(cost.amountEur) : roundMoney(total.mul(dec(cost.amountEur)).div(dec(cost.amount)), "EUR");
  const amountsEur = amounts.length ? allocateByWeights(eurTotal, amounts, "EUR") : [];
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "DirectCost", cost.id);
    await tx.costAllocation.deleteMany({ where: { directCostId: cost.id } });
    if (amounts.length) {
      await tx.costAllocation.createMany({
        data: d.allocations.map((a, i) => ({ directCostId: cost.id, videoId: a.videoId, amount: amounts[i].toFixed(2), amountEur: amountsEur[i].toFixed(2) })),
      });
    }
    await recordAudit(tx, { actorId: actor.id, action: "cost.allocate", entityType: "DirectCost", entityId: cost.id, after: d.allocations });
  });
  return { id: cost.id, unallocated: dec(cost.amount).minus(total).toFixed(2) };
}

export async function setCostStage(actor: Actor, input: { costId: string; stage: "ESTIMATED" | "COMMITTED" | "VALIDATED" | "CANCELLED"; reason: string }) {
  const d = costStageSchema.parse(input);
  assertCan(actor, d.stage === "VALIDATED" ? "costs.validate" : "costs.write");
  const cost = await prisma.directCost.findUnique({ where: { id: d.costId }, include: { paymentAllocations: { where: { reversedAt: null } } } });
  if (!cost) throw new NotFoundError();
  if (cost.stage === d.stage) return { id: cost.id };
  if (d.stage === "VALIDATED" && cost.amount === null) throw new DomainError("Montant à renseigner avant validation.");
  if (d.stage === "CANCELLED") {
    if (!str(d.reason)) throw new DomainError("Motif obligatoire pour annuler un coût.");
    if (cost.paymentAllocations.length) throw new DomainError("Coût déjà réglé (au moins en partie) : annulation impossible.");
  }
  if (cost.stage === "VALIDATED" && d.stage !== "CANCELLED" && cost.paymentAllocations.length) {
    throw new DomainError("Coût déjà réglé : il reste validé.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.directCost.update({
      where: { id: cost.id },
      data: {
        stage: d.stage,
        committedAt: d.stage !== "ESTIMATED" ? (cost.committedAt ?? new Date()) : null,
        validatedAt: d.stage === "VALIDATED" ? new Date() : d.stage === "CANCELLED" ? cost.validatedAt : null,
        validatedById: d.stage === "VALIDATED" ? actor.id : cost.validatedById,
        cancelledAt: d.stage === "CANCELLED" ? new Date() : null,
        cancelReason: d.stage === "CANCELLED" ? str(d.reason) : null,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, { actorId: actor.id, action: "cost.stage", entityType: "DirectCost", entityId: cost.id, before: { stage: cost.stage }, after: { stage: d.stage }, reason: str(d.reason) });
  });
  return { id: cost.id };
}

export async function createExpense(actor: Actor, input: ExpenseInput): Promise<{ id: string }> {
  assertCan(actor, "expenses.write");
  const d = expenseSchema.parse(input);
  if (d.isPaid && !d.paidOn) throw new DomainError("Date de paiement obligatoire pour une charge payée.");
  const settings = await getSettings();
  const net = roundMoney(parseDecimalInput(d.amountNet)!, d.currency as CurrencyCode);
  const vat = d.vatAmount ? roundMoney(parseDecimalInput(d.vatAmount)!, d.currency as CurrencyCode) : new Decimal(0);
  const fx = await resolveFx(prisma, d.currency, d.expenseDate, str(d.manualFxRate));
  const costOriginal = !d.vatRecoverable && settings.nonRecoverableVatInCost ? net.plus(vat) : net;
  const expense = await prisma.expense.create({
    data: {
      categoryId: d.categoryId,
      label: d.label,
      supplier: str(d.supplier),
      expenseDate: parseDateOnly(d.expenseDate),
      periodMonth: parseDateOnly(`${d.periodMonth}-01`),
      amountNet: net.toFixed(2),
      vatAmount: vat.toFixed(2),
      vatRecoverable: d.vatRecoverable,
      currency: d.currency,
      ...fxData(fx),
      costEur: convert(costOriginal, fx).toFixed(2),
      grossEur: convert(net.plus(vat), fx).toFixed(2),
      recurrence: d.recurrence,
      isPaid: d.isPaid,
      paidOn: d.isPaid ? dateOrNull(d.paidOn) : null,
      notes: str(d.notes),
      documentRef: str(d.documentRef),
      createdById: actor.id,
    },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "expense.create", entityType: "Expense", entityId: expense.id });
  return { id: expense.id };
}

export async function markExpensePaid(actor: Actor, expenseId: string, paidOn: string) {
  assertCan(actor, "expenses.write");
  const e = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!e) throw new NotFoundError();
  if (e.status === "VOIDED") throw new DomainError("Charge annulée.");
  await prisma.expense.update({ where: { id: expenseId }, data: { isPaid: true, paidOn: parseDateOnly(paidOn) } });
  await recordAudit(prisma, { actorId: actor.id, action: "expense.paid", entityType: "Expense", entityId: expenseId, after: { paidOn } });
  return { id: expenseId };
}

/** Annulation tracée d'une charge (jamais supprimée). */
export async function voidExpense(actor: Actor, expenseId: string, reason: string) {
  assertCan(actor, "expenses.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  const e = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!e) throw new NotFoundError();
  await prisma.expense.update({ where: { id: expenseId }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
  await recordAudit(prisma, { actorId: actor.id, action: "expense.void", entityType: "Expense", entityId: expenseId, before: e, reason });
  return { id: expenseId };
}
