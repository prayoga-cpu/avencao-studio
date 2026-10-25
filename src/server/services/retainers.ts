import "server-only";
/**
 * Forfaits récurrents (phase 2). Génération mensuelle idempotente : la contrainte unique
 * (contrat, début de période) garantit qu'une relance ne crée ni deux périodes, ni deux
 * ventes, ni deux factures brouillon. Les crédits de production ≠ encaissements.
 */
import type { RetainerInput } from "@/features/finance/schemas";
import { retainerSchema } from "@/features/finance/schemas";
import { addMonths, endOfMonth, parseDateOnly, startOfMonth, toDateOnlyString } from "@/lib/dates";
import { dec, lineVat, parseDecimalInput, roundMoney, type CurrencyCode } from "@/lib/money";
import type { VideoType } from "@/generated/prisma/enums";
import { recordAudit } from "../audit";
import { dateOrNull, intOrNull, str } from "../convert";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { computePeriodCredits, type CreditMap, type PeriodCredits } from "../domain/retainer-credits";
import { convert, fxData, resolveFx } from "../fx";
import { assertCan, type Actor } from "../policies";
import { nextReference } from "../references";

export async function createRetainer(actor: Actor, input: RetainerInput) {
  assertCan(actor, "retainers.write");
  const d = retainerSchema.parse(input);
  if (d.endsOn && d.endsOn < d.startsOn) throw new DomainError("La fin précède le début.");
  const quotas = d.quotas.filter((q) => (intOrNull(q.quantity) ?? 0) > 0);
  if (new Set(quotas.map((q) => q.videoType)).size !== quotas.length) throw new DomainError("Un type de vidéo apparaît deux fois.");
  const retainer = await prisma.retainer.create({
    data: {
      clientId: d.clientId,
      title: d.title,
      startsOn: parseDateOnly(d.startsOn),
      endsOn: dateOrNull(d.endsOn),
      amount: roundMoney(parseDecimalInput(d.amount)!, d.currency as CurrencyCode).toFixed(2),
      currency: d.currency,
      carryOver: d.carryOver,
      createDraftInvoice: d.createDraftInvoice,
      vatRate: d.vatRate ? parseDecimalInput(d.vatRate)!.toFixed(2) : null,
      notes: str(d.notes),
      quotas: { create: quotas.map((q) => ({ videoType: q.videoType, quantity: intOrNull(q.quantity)! })) },
    },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "retainer.create", entityType: "Retainer", entityId: retainer.id });
  return { id: retainer.id };
}

async function usedCredits(periodId: string): Promise<CreditMap> {
  const uses = await prisma.retainerCreditUse.findMany({ where: { periodId }, select: { videoType: true } });
  const out: CreditMap = {};
  for (const u of uses) out[u.videoType] = (out[u.videoType] ?? 0) + 1;
  return out;
}

/**
 * Génère (une seule fois) la période d'un mois : crédits, vente du mois et facture brouillon.
 * Retourne { created: false } si la période existe déjà — relance sans effet de bord.
 */
export async function generateRetainerPeriod(retainerId: string, monthIso: string, actorId: string | null = null) {
  const retainer = await prisma.retainer.findUnique({ where: { id: retainerId }, include: { quotas: true } });
  if (!retainer) throw new NotFoundError();
  const periodStart = startOfMonth(monthIso);
  const periodEnd = endOfMonth(periodStart);
  if (retainer.status !== "ACTIVE") return { created: false, reason: "contrat inactif" };
  if (periodEnd < toDateOnlyString(retainer.startsOn)) return { created: false, reason: "avant le début du contrat" };
  if (retainer.endsOn && periodStart > toDateOnlyString(retainer.endsOn)) return { created: false, reason: "après la fin du contrat" };

  const existing = await prisma.retainerPeriod.findUnique({ where: { retainerId_periodStart: { retainerId, periodStart: parseDateOnly(periodStart) } } });
  if (existing) return { created: false, periodId: existing.id, reason: "période déjà générée" };

  const previous = await prisma.retainerPeriod.findUnique({
    where: { retainerId_periodStart: { retainerId, periodStart: parseDateOnly(addMonths(periodStart, -1)) } },
  });
  const credits = computePeriodCredits(
    retainer.quotas.map((q) => ({ videoType: q.videoType, quantity: q.quantity })),
    previous ? { credits: previous.credits as unknown as PeriodCredits, used: await usedCredits(previous.id) } : null,
    retainer.carryOver,
  );
  const fx = await resolveFx(prisma, retainer.currency, periodStart);
  const amount = dec(retainer.amount);
  try {
    return await prisma.$transaction(async (tx) => {
      const period = await tx.retainerPeriod.create({
        data: { retainerId, periodStart: parseDateOnly(periodStart), periodEnd: parseDateOnly(periodEnd), credits: credits as unknown as object },
      });
      const reference = await nextReference(tx, "SALES", Number(periodStart.slice(0, 4)));
      const order = await tx.salesOrder.create({
        data: {
          reference,
          clientId: retainer.clientId,
          title: `${retainer.title} — ${periodStart.slice(0, 7)}`,
          acceptedOn: parseDateOnly(periodStart),
          currency: retainer.currency,
          ...fxData(fx),
          notes: "Vente générée automatiquement par le forfait récurrent.",
          lines: {
            create: {
              description: `${retainer.title} — forfait ${periodStart.slice(0, 7)}`,
              quantity: "1",
              unitPrice: amount.toFixed(2),
              netAmount: amount.toFixed(2),
              netAmountEur: convert(amount, fx).toFixed(2),
              allocationMethod: "EQUAL",
            },
          },
        },
      });
      let invoiceId: string | null = null;
      if (retainer.createDraftInvoice) {
        const rate = retainer.vatRate ? dec(retainer.vatRate) : dec(0);
        const vat = lineVat(amount, rate, retainer.currency as CurrencyCode);
        const inv = await tx.invoice.create({
          data: {
            clientId: retainer.clientId,
            salesOrderId: order.id,
            kind: "STANDARD",
            status: "DRAFT",
            currency: retainer.currency,
            ...fxData(fx),
            totalNet: amount.toFixed(2),
            totalVat: vat.toFixed(2),
            totalGross: amount.plus(vat).toFixed(2),
            totalNetEur: convert(amount, fx).toFixed(2),
            notes: "Brouillon généré par le forfait récurrent : à émettre dans l'outil de facturation puis à compléter ici (numéro, date).",
            lines: {
              create: {
                description: `${retainer.title} — ${periodStart.slice(0, 7)}`,
                quantity: "1",
                unitPrice: amount.toFixed(2),
                vatRate: rate.toFixed(2),
                netAmount: amount.toFixed(2),
                vatAmount: vat.toFixed(2),
                grossAmount: amount.plus(vat).toFixed(2),
              },
            },
          },
        });
        invoiceId = inv.id;
      }
      await tx.retainerPeriod.update({ where: { id: period.id }, data: { salesOrderId: order.id, invoiceId } });
      await recordAudit(tx, { actorId, action: "retainer.generate_period", entityType: "RetainerPeriod", entityId: period.id, after: { periodStart, credits } });
      return { created: true, periodId: period.id };
    });
  } catch (e) {
    // Course entre deux exécutions : la contrainte unique a tranché, la relance est sans effet.
    if ((e as { code?: string }).code === "P2002") return { created: false, reason: "période déjà générée (concurrence)" };
    throw e;
  }
}

export async function generateDueRetainerPeriods(monthIso: string) {
  const retainers = await prisma.retainer.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const results = [];
  for (const r of retainers) results.push({ retainerId: r.id, ...(await generateRetainerPeriod(r.id, monthIso)) });
  return results;
}

/** Consommation d'un crédit par une vidéo (une seule fois par vidéo). */
export async function useRetainerCredit(actor: Actor, periodId: string, videoId: string) {
  assertCan(actor, "retainers.write");
  const [period, video] = await Promise.all([
    prisma.retainerPeriod.findUnique({ where: { id: periodId }, include: { retainer: true } }),
    prisma.video.findUnique({ where: { id: videoId }, include: { project: true } }),
  ]);
  if (!period || !video) throw new NotFoundError();
  if (video.project.clientId !== period.retainer.clientId) throw new DomainError("La vidéo n'appartient pas au client du forfait.");
  const credits = period.credits as unknown as PeriodCredits;
  const used = await usedCredits(periodId);
  const type = video.type as VideoType;
  const available = (credits.base[type] ?? 0) + (credits.carried[type] ?? 0) - (used[type] ?? 0);
  if (available <= 0) throw new DomainError("Plus de crédit disponible pour ce type de vidéo sur la période.");
  await prisma.retainerCreditUse.create({ data: { periodId, videoId, videoType: type } });
  return { id: periodId };
}
