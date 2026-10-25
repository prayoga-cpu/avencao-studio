import "server-only";
/**
 * Demandes hors périmètre. Un supplément client passe par une proposition ACCEPTÉE puis une
 * ligne de vente ; un supplément monteur par un coût additionnel engagé. Rien n'est réécrit :
 * la marge avant/après est conservée dans l'historique.
 */
import type { ChangeRequestInput } from "@/features/production/schemas";
import { changeRequestSchema } from "@/features/production/schemas";
import { parseDateOnly } from "@/lib/dates";
import { parseDecimalInput, roundMoney, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { str } from "../convert";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { convert, fxData, resolveFx } from "../fx";
import { assertCan, type Actor } from "../policies";
import { nextReference } from "../references";
import { agencyToday } from "./common";
import { getVideosFinancials } from "./profitability";

export async function createChangeRequest(actor: Actor, input: ChangeRequestInput) {
  assertCan(actor, "videos.write");
  const d = changeRequestSchema.parse(input);
  if (d.editorCost && !d.editorId) throw new DomainError("Indiquez le prestataire concerné par le coût supplémentaire.");
  if ((d.clientPrice || d.editorCost) && !(actorHasFinance(actor))) {
    throw new DomainError("La saisie de montants nécessite l'accès financier.");
  }
  const cr = await prisma.changeRequest.create({
    data: {
      videoId: d.videoId,
      title: d.title,
      description: str(d.description),
      clientPrice: d.clientPrice ? parseDecimalInput(d.clientPrice)!.toFixed(2) : null,
      clientCurrency: d.clientPrice ? d.clientCurrency : null,
      editorCost: d.editorCost ? parseDecimalInput(d.editorCost)!.toFixed(2) : null,
      editorCurrency: d.editorCost ? d.editorCurrency : null,
      editorId: str(d.editorId),
      createdById: actor.id,
    },
  });
  return { id: cr.id };
}

function actorHasFinance(actor: Actor) {
  return actor.role === "ADMIN" || actor.financeAccess;
}

export async function acceptChangeRequest(actor: Actor, id: string, note: string, manualFxRate = "") {
  assertCan(actor, "sales.write");
  const cr = await prisma.changeRequest.findUnique({ where: { id }, include: { video: { include: { project: true } } } });
  if (!cr) throw new NotFoundError();
  if (cr.status !== "PROPOSED") throw new DomainError("Demande déjà traitée.");
  if (!note.trim()) throw new DomainError("Indiquez la trace de l'accord client (email, date, interlocuteur).");
  if (!cr.clientPrice && !cr.editorCost) throw new DomainError("Aucun montant renseigné : complétez le supplément client et/ou le coût monteur.");
  const today = await agencyToday();
  const before = (await getVideosFinancials(prisma, [cr.videoId])).get(cr.videoId)!;
  await prisma.$transaction(async (tx) => {
    let salesOrderLineId: string | null = null;
    let directCostId: string | null = null;
    if (cr.clientPrice && cr.clientCurrency) {
      const fx = await resolveFx(tx, cr.clientCurrency, today, cr.clientCurrency === "EUR" ? null : manualFxRate);
      const net = roundMoney(parseDecimalInput(cr.clientPrice.toString())!, cr.clientCurrency as CurrencyCode);
      const netEur = convert(net, fx);
      const reference = await nextReference(tx, "SALES", Number(today.slice(0, 4)));
      const order = await tx.salesOrder.create({
        data: {
          reference,
          clientId: cr.video.project.clientId,
          projectId: cr.video.projectId,
          title: `Supplément — ${cr.title}`,
          acceptedOn: parseDateOnly(today),
          currency: cr.clientCurrency,
          ...fxData(fx),
          notes: `Demande hors périmètre acceptée : ${note}`,
          createdById: actor.id,
          lines: {
            create: {
              description: `${cr.title} (${cr.video.reference})`,
              quantity: "1",
              unitPrice: net.toFixed(2),
              netAmount: net.toFixed(2),
              netAmountEur: netEur.toFixed(2),
              allocationMethod: "MANUAL",
              allocations: { create: { videoId: cr.videoId, amount: net.toFixed(2), amountEur: netEur.toFixed(2) } },
            },
          },
        },
        include: { lines: true },
      });
      salesOrderLineId = order.lines[0].id;
    }
    if (cr.editorCost && cr.editorCurrency && cr.editorId) {
      const fx = await resolveFx(tx, cr.editorCurrency, today, cr.editorCurrency === "EUR" ? null : manualFxRate);
      const amount = roundMoney(parseDecimalInput(cr.editorCost.toString())!, cr.editorCurrency as CurrencyCode);
      const cost = await tx.directCost.create({
        data: {
          kind: "ADDITIONAL",
          stage: "COMMITTED",
          committedAt: new Date(),
          label: `Supplément monteur — ${cr.title}`,
          editorId: cr.editorId,
          projectId: cr.video.projectId,
          videoId: cr.videoId,
          currency: cr.editorCurrency,
          amount: amount.toFixed(2),
          amountEur: convert(amount, fx).toFixed(2),
          ...fxData(fx),
          incurredOn: parseDateOnly(today),
          createdById: actor.id,
        },
      });
      directCostId = cost.id;
    }
    await tx.changeRequest.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: actor.id, acceptanceNote: note, salesOrderLineId, directCostId },
    });
  });
  const after = (await getVideosFinancials(prisma, [cr.videoId])).get(cr.videoId)!;
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "change_request.accept",
    entityType: "ChangeRequest",
    entityId: id,
    before: { marginEur: before.marginEur.toFixed(2), ratePct: before.ratePct?.toFixed(2) ?? null },
    after: { marginEur: after.marginEur.toFixed(2), ratePct: after.ratePct?.toFixed(2) ?? null },
    reason: note,
  });
  return {
    id,
    marginBefore: before.marginEur.toFixed(2),
    marginAfter: after.marginEur.toFixed(2),
    rateBefore: before.ratePct?.toFixed(2) ?? null,
    rateAfter: after.ratePct?.toFixed(2) ?? null,
  };
}

export async function rejectChangeRequest(actor: Actor, id: string, note: string) {
  assertCan(actor, "videos.write");
  const cr = await prisma.changeRequest.findUnique({ where: { id } });
  if (!cr) throw new NotFoundError();
  if (cr.status !== "PROPOSED") throw new DomainError("Demande déjà traitée.");
  await prisma.changeRequest.update({ where: { id }, data: { status: "REJECTED", acceptanceNote: note || null } });
  return { id };
}
