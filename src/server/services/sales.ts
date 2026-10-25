import "server-only";
/**
 * Ventes acceptées et allocation analytique aux livrables.
 * - Prix figés sur la ligne acceptée (source unique des « Ventes signées »).
 * - L'allocation d'un pack entre vidéos est interne : sa somme vaut exactement le net
 *   de la ligne (centimes résiduels attribués de façon déterministe), en devise et en EUR.
 * - Une facture ne s'ajoute jamais aux ventes : elle référence éventuellement une ligne.
 */
import type { ReallocateInput, SalesLineInput, SalesOrderInput } from "@/features/finance/schemas";
import { cancelLineSchema, reallocateSchema, salesOrderSchema } from "@/features/finance/schemas";
import type { Currency } from "@/generated/prisma/enums";
import { parseDateOnly } from "@/lib/dates";
import { Decimal, allocateByWeights, dec, lineNet, parseDecimalInput, sum, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { intOrNull, str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { convert, fxData, resolveFx, type FxSnapshot } from "../fx";
import { assertCan, type Actor } from "../policies";
import { nextReference } from "../references";
import { agencyToday, lockRow } from "./common";

interface AllocationRow {
  videoId: string;
  weight: Decimal | null;
  amount: Decimal;
  amountEur: Decimal;
}

/** Calcule les allocations d'une ligne : somme exacte en devise ET en EUR. */
export function computeAllocations(
  method: "NONE" | "EQUAL" | "WEIGHTED" | "MANUAL",
  allocations: { videoId: string; value: string }[],
  net: Decimal,
  netEur: Decimal,
  currency: CurrencyCode,
): AllocationRow[] {
  if (method === "NONE" || allocations.length === 0) return [];
  const ids = allocations.map((a) => a.videoId);
  if (new Set(ids).size !== ids.length) throw new DomainError("Une vidéo apparaît deux fois dans la répartition.");
  let weights: Decimal[];
  if (method === "EQUAL") {
    weights = allocations.map(() => new Decimal(1));
  } else {
    weights = allocations.map((a) => {
      const v = parseDecimalInput(a.value ?? "");
      if (!v || v.isNegative()) throw new DomainError("Pondération ou montant invalide dans la répartition.");
      return v;
    });
  }
  let amounts: Decimal[];
  if (method === "MANUAL") {
    amounts = weights;
    if (!sum(amounts).eq(net)) {
      throw new DomainError(`La répartition manuelle (${sum(amounts).toFixed(2)}) doit être égale au montant net de la ligne (${net.toFixed(2)}).`);
    }
  } else {
    amounts = allocateByWeights(net, weights, currency);
  }
  // EUR réparti avec les montants comme poids : somme exacte au centime près.
  const amountsEur = allocateByWeights(netEur, amounts.every((a) => a.isZero()) ? weights : amounts, "EUR");
  return allocations.map((a, i) => ({
    videoId: a.videoId,
    weight: method === "WEIGHTED" ? weights[i] : null,
    amount: amounts[i],
    amountEur: amountsEur[i],
  }));
}

async function assertVideosBelong(db: Db, videoIds: string[], clientId: string, projectId: string | null) {
  if (videoIds.length === 0) return;
  const videos = await db.video.findMany({ where: { id: { in: videoIds } }, select: { id: true, projectId: true, project: { select: { clientId: true } } } });
  if (videos.length !== videoIds.length) throw new DomainError("Vidéo introuvable dans la répartition.");
  for (const v of videos) {
    if (v.project.clientId !== clientId) throw new DomainError("Une vidéo répartie n'appartient pas à ce client.");
    if (projectId && v.projectId !== projectId) throw new DomainError("Une vidéo répartie n'appartient pas au projet de la vente.");
  }
}

async function createLine(
  tx: Db,
  orderId: string,
  line: SalesLineInput,
  index: number,
  currency: Currency,
  fx: FxSnapshot,
) {
  const net = lineNet(line.quantity.replace(",", "."), parseDecimalInput(line.unitPrice)!, parseDecimalInput(line.discount || "0") ?? 0, currency as CurrencyCode);
  if (net.isNegative()) throw new DomainError("La remise dépasse le montant de la ligne.");
  const netEur = convert(net, fx);
  const created = await tx.salesOrderLine.create({
    data: {
      salesOrderId: orderId,
      description: line.description,
      videoType: line.videoType === "" ? null : line.videoType,
      catalogItemId: str(line.catalogItemId),
      quantity: dec(line.quantity.replace(",", ".")).toFixed(3),
      unitPrice: parseDecimalInput(line.unitPrice)!.toFixed(2),
      discountAmount: (parseDecimalInput(line.discount || "0") ?? new Decimal(0)).toFixed(2),
      netAmount: net.toFixed(2),
      netAmountEur: netEur.toFixed(2),
      includedRevisions: intOrNull(line.includedRevisions),
      allocationMethod: line.allocationMethod === "NONE" ? "EQUAL" : line.allocationMethod,
      position: index,
    },
  });
  const rows = computeAllocations(line.allocationMethod, line.allocations, net, netEur, currency as CurrencyCode);
  if (rows.length) {
    await tx.revenueAllocation.createMany({
      data: rows.map((r) => ({
        salesOrderLineId: created.id,
        videoId: r.videoId,
        weight: r.weight?.toFixed(4) ?? null,
        amount: r.amount.toFixed(2),
        amountEur: r.amountEur.toFixed(2),
      })),
    });
  }
  return created;
}

export async function createSalesOrder(actor: Actor, input: SalesOrderInput): Promise<{ id: string; reference: string }> {
  assertCan(actor, "sales.write");
  const d = salesOrderSchema.parse(input);
  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) throw new NotFoundError("Client introuvable.");
  const projectId = str(d.projectId);
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.clientId !== d.clientId) throw new DomainError("Le projet n'appartient pas à ce client.");
  }
  for (const line of d.lines) await assertVideosBelong(prisma, line.allocations.map((a) => a.videoId), d.clientId, projectId);
  const fx = await resolveFx(prisma, d.currency, d.acceptedOn, str(d.manualFxRate));
  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, "SALES", Number(d.acceptedOn.slice(0, 4)));
    const order = await tx.salesOrder.create({
      data: {
        reference,
        clientId: d.clientId,
        projectId,
        opportunityId: str(d.opportunityId),
        title: d.title,
        acceptedOn: parseDateOnly(d.acceptedOn),
        currency: d.currency,
        ...fxData(fx),
        notes: str(d.notes),
        createdById: actor.id,
      },
    });
    for (const [i, line] of d.lines.entries()) await createLine(tx, order.id, line, i, d.currency, fx);
    if (client.status === "PROSPECT") await tx.client.update({ where: { id: d.clientId }, data: { status: "ACTIVE" } });
    await recordAudit(tx, { actorId: actor.id, action: "sales.create", entityType: "SalesOrder", entityId: order.id, after: { reference, lines: d.lines.length } });
    return { id: order.id, reference };
  });
}

/** Nouvelle répartition analytique d'une ligne (n'affecte ni ventes ni facturation). */
export async function reallocateLine(actor: Actor, input: ReallocateInput) {
  assertCan(actor, "sales.write");
  const d = reallocateSchema.parse(input);
  const line = await prisma.salesOrderLine.findUnique({ where: { id: d.lineId }, include: { salesOrder: true } });
  if (!line) throw new NotFoundError();
  await assertVideosBelong(prisma, d.allocations.map((a) => a.videoId), line.salesOrder.clientId, line.salesOrder.projectId);
  const remaining = dec(line.netAmount).minus(dec(line.cancelledAmount));
  const remainingEur = dec(line.netAmountEur).minus(dec(line.cancelledAmountEur));
  const rows = computeAllocations(d.allocationMethod, d.allocations, remaining, remainingEur, line.salesOrder.currency as CurrencyCode);
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "SalesOrderLine", line.id);
    const before = await tx.revenueAllocation.findMany({ where: { salesOrderLineId: line.id } });
    await tx.revenueAllocation.deleteMany({ where: { salesOrderLineId: line.id } });
    if (rows.length) {
      await tx.revenueAllocation.createMany({
        data: rows.map((r) => ({ salesOrderLineId: line.id, videoId: r.videoId, weight: r.weight?.toFixed(4) ?? null, amount: r.amount.toFixed(2), amountEur: r.amountEur.toFixed(2) })),
      });
    }
    await tx.salesOrderLine.update({ where: { id: line.id }, data: { allocationMethod: d.allocationMethod === "NONE" ? line.allocationMethod : d.allocationMethod } });
    await recordAudit(tx, { actorId: actor.id, action: "sales.reallocate", entityType: "SalesOrderLine", entityId: line.id, before, after: rows });
  });
  return { id: line.id };
}

/**
 * Annulation (partielle) d'une ligne acceptée, à sa date : réduit les ventes signées.
 * Les allocations restantes sont recalculées au prorata pour rester égales au net restant.
 */
export async function cancelSalesLine(actor: Actor, input: { lineId: string; amount: string; cancelledOn: string; reason: string }) {
  assertCan(actor, "sales.write");
  const d = cancelLineSchema.parse(input);
  const line = await prisma.salesOrderLine.findUnique({ where: { id: d.lineId }, include: { salesOrder: true, allocations: true } });
  if (!line) throw new NotFoundError();
  const amount = parseDecimalInput(d.amount)!;
  const newCancelled = dec(line.cancelledAmount).plus(amount);
  if (newCancelled.gt(dec(line.netAmount))) throw new DomainError("L'annulation dépasse le montant restant de la ligne.");
  const fxRate = dec(line.salesOrder.fxUnitsPerEur);
  const newCancelledEur = newCancelled.eq(dec(line.netAmount))
    ? dec(line.netAmountEur)
    : dec(line.cancelledAmountEur).plus(convert(amount, { unitsPerEur: fxRate, rateDate: line.salesOrder.fxRateDate, source: line.salesOrder.fxSource }));
  const remaining = dec(line.netAmount).minus(newCancelled);
  const remainingEur = dec(line.netAmountEur).minus(newCancelledEur);
  await prisma.$transaction(async (tx) => {
    await lockRow(tx, "SalesOrderLine", line.id);
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: {
        cancelledAmount: newCancelled.toFixed(2),
        cancelledAmountEur: newCancelledEur.toFixed(2),
        cancelledOn: parseDateOnly(d.cancelledOn),
        cancelReason: d.reason,
      },
    });
    if (line.allocations.length) {
      const weights = line.allocations.map((a) => dec(a.amount));
      const amounts = remaining.isZero() ? weights.map(() => new Decimal(0)) : allocateByWeights(remaining, weights, line.salesOrder.currency as CurrencyCode);
      const amountsEur = remainingEur.isZero() ? weights.map(() => new Decimal(0)) : allocateByWeights(remainingEur, weights, "EUR");
      for (const [i, a] of line.allocations.entries()) {
        await tx.revenueAllocation.update({ where: { id: a.id }, data: { amount: amounts[i].toFixed(2), amountEur: amountsEur[i].toFixed(2) } });
      }
    }
    await recordAudit(tx, { actorId: actor.id, action: "sales.cancel_line", entityType: "SalesOrderLine", entityId: line.id, after: { amount: amount.toFixed(2) }, reason: d.reason });
  });
  return { id: line.id };
}

/** Annulation complète d'une vente : toutes les lignes sont annulées à la date donnée. */
export async function cancelSalesOrder(actor: Actor, orderId: string, reason: string) {
  assertCan(actor, "sales.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new NotFoundError();
  const invoiced = await prisma.invoiceLine.count({ where: { salesOrderLine: { salesOrderId: orderId }, invoice: { status: "ISSUED" } } });
  if (invoiced > 0) throw new DomainError("Des factures émises référencent cette vente : émettez un avoir puis annulez ligne par ligne.");
  const today = await agencyToday();
  for (const line of order.lines) {
    const remaining = dec(line.netAmount).minus(dec(line.cancelledAmount));
    if (remaining.gt(0)) await cancelSalesLine(actor, { lineId: line.id, amount: remaining.toFixed(2), cancelledOn: today, reason });
  }
  await prisma.salesOrder.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  return { id: orderId };
}
