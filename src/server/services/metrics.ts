import "server-only";
/**
 * Indicateurs financiers de période. Définitions : docs/definitions-financieres.md
 *
 * | Indicateur                    | Source unique                                   | Date utilisée        |
 * |-------------------------------|-------------------------------------------------|----------------------|
 * | Ventes signées HT             | lignes de ventes acceptées − annulations        | acceptation / annul. |
 * | CA facturé HT net             | factures émises − avoirs émis (HT)              | émission             |
 * | CA de gestion livré           | allocations des livrables livrés                | livraison            |
 * | Encaissements (TTC)           | encaissements enregistrés                       | règlement            |
 * | Coûts directs des livrables   | coûts + allocations de coûts de ces livrables   | livraison            |
 * | Charges de structure          | charges (Expense) non annulées                  | mois de rattachement |
 * | Flux net de trésorerie        | entrées − sorties réelles                       | date du mouvement    |
 *
 * Toutes les agrégations se font par source puis sont combinées (aucune jointure
 * multiplicative). Les montants sont en EUR au taux figé de chaque opération.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, type Period } from "@/lib/dates";
import { Decimal, dec, marginRate, roundCents, sum } from "@/lib/money";
import { prisma, type Db } from "../db";
import { computeMargin } from "../domain/profitability";
import { getSettings } from "../settings";
import { getEditorBalances, getInvoiceBalances } from "./billing";
import { getVideosFinancials } from "./profitability";

/** Bornes UTC [début, fin) d'une période de dates locales dans le fuseau de l'agence. */
export function periodInstants(period: Pick<Period, "from" | "to">, timezone: string) {
  const [fy, fm, fd] = period.from.split("-").map(Number);
  const end = addDays(period.to, 1);
  const [ty, tm, td] = end.split("-").map(Number);
  return {
    start: new Date(new TZDate(fy, fm - 1, fd, 0, 0, 0, timezone).getTime()),
    end: new Date(new TZDate(ty, tm - 1, td, 0, 0, 0, timezone).getTime()),
  };
}

function dateRange(period: Pick<Period, "from" | "to">) {
  return { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) };
}

const ZERO = new Decimal(0);

/**
 * Livrables reconnus sur la période : vidéos livrées dans la période, plus les vidéos
 * annulées dans la période (à la date d'annulation) : leur revenu maintenu par accord client
 * et leurs coûts encore dus entrent ainsi dans le résultat, une seule fois.
 */
export async function recognizedVideoIds(db: Db, period: Pick<Period, "from" | "to">, timezone: string): Promise<string[]> {
  const { start, end } = periodInstants(period, timezone);
  const rows = await db.video.findMany({
    where: {
      OR: [
        { deliveredAt: { gte: start, lt: end }, status: { in: ["DELIVERED", "ARCHIVED"] } },
        { status: "CANCELLED", cancelledAt: { gte: start, lt: end } },
      ],
    },
    select: { id: true, status: true },
  });
  return rows.map((r) => r.id);
}

export async function recognizedVideos(db: Db, period: Pick<Period, "from" | "to">, timezone: string) {
  const { start, end } = periodInstants(period, timezone);
  return db.video.findMany({
    where: {
      OR: [
        { deliveredAt: { gte: start, lt: end }, status: { in: ["DELIVERED", "ARCHIVED"] } },
        { status: "CANCELLED", cancelledAt: { gte: start, lt: end } },
      ],
    },
    select: { id: true, status: true },
  });
}

export interface PeriodMetrics {
  salesSignedEur: Decimal;
  salesCancelledEur: Decimal;
  invoicedNetEur: Decimal;
  creditNotesNetEur: Decimal;
  invoicedCount: number;
  deliveredRevenueEur: Decimal;
  deliveredCount: number;
  cancelledCount: number;
  deliveredCostsEur: Decimal;
  deliveredMissingCosts: number;
  productionMarginEur: Decimal;
  productionMarginPct: Decimal | null;
  marginIsProvisional: boolean;
  overheadEur: Decimal;
  overheadByCategory: { name: string; amountEur: Decimal }[];
  envelopeUnallocatedEur: Decimal;
  paymentFeesEur: Decimal;
  fxDifferenceEur: Decimal;
  managementResultEur: Decimal;
  ownerTimeHours: Decimal;
  ownerTimeValuationEur: Decimal | null;
  ownerTimeAlreadyInCosts: boolean;
  managementResultAfterOwnerEur: Decimal | null;
  collectionsEur: Decimal;
  refundsEur: Decimal;
  clientFeesEur: Decimal;
  supplierPaymentsEur: Decimal;
  supplierFeesEur: Decimal;
  expensesPaidEur: Decimal;
  netCashFlowEur: Decimal;
  costsIncurredEur: Decimal;
  costsIncurredMissing: number;
}

export async function getPeriodMetrics(period: Pick<Period, "from" | "to">): Promise<PeriodMetrics> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const range = dateRange(period);

  const [
    signedLines,
    cancelledLines,
    invoices,
    creditNotes,
    expenses,
    categories,
    envelopes,
    clientPayments,
    refunds,
    supplierPayments,
    fxAllocs,
    expensesPaid,
    ownerTime,
    incurred,
    recognized,
  ] = await Promise.all([
    prisma.salesOrderLine.aggregate({ where: { salesOrder: { acceptedOn: range } }, _sum: { netAmountEur: true } }),
    prisma.salesOrderLine.aggregate({ where: { cancelledOn: range }, _sum: { cancelledAmountEur: true } }),
    prisma.invoice.aggregate({ where: { status: "ISSUED", issueDate: range }, _sum: { totalNetEur: true }, _count: true }),
    prisma.creditNote.aggregate({ where: { status: "ISSUED", issueDate: range }, _sum: { totalNetEur: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { status: "RECORDED", periodMonth: range }, _sum: { costEur: true } }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true } }),
    prisma.directCost.findMany({
      where: { kind: "ENVELOPE", stage: { not: "CANCELLED" }, periodStart: range, amountEur: { not: null } },
      select: { amountEur: true, allocations: { select: { amountEur: true } } },
    }),
    prisma.clientPayment.aggregate({ where: { status: "RECORDED", receivedOn: range }, _sum: { amountEur: true, feesEur: true } }),
    prisma.clientRefund.aggregate({ where: { status: "RECORDED", refundedOn: range }, _sum: { amountEur: true } }),
    prisma.supplierPayment.aggregate({ where: { status: "RECORDED", paidOn: range }, _sum: { amountEur: true, feesEur: true } }),
    prisma.supplierPaymentAllocation.aggregate({ where: { reversedAt: null, payment: { status: "RECORDED", paidOn: range } }, _sum: { fxDifferenceEur: true } }),
    prisma.expense.aggregate({ where: { status: "RECORDED", isPaid: true, paidOn: range }, _sum: { grossEur: true } }),
    prisma.timeEntry.findMany({ where: { isOwnerTime: true, workedOn: range }, select: { minutes: true, valuationRate: true } }),
    prisma.directCost.findMany({ where: { stage: { not: "CANCELLED" }, incurredOn: range }, select: { amountEur: true } }),
    recognizedVideos(prisma, period, tz),
  ]);

  const videoIds = recognized.map((v) => v.id);
  const fin = await getVideosFinancials(prisma, videoIds);
  const deliveredRevenue = sum([...fin.values()].map((f) => f.revenueEur));
  const deliveredCosts = sum([...fin.values()].map((f) => f.costsEur));
  const deliveredMissing = [...fin.values()].reduce((n, f) => n + f.missingCostCount, 0);
  const productionMargin = deliveredRevenue.minus(deliveredCosts);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const overheadByCategory = expenses
    .map((e) => ({ name: catName.get(e.categoryId) ?? "Autre", amountEur: dec(e._sum.costEur ?? 0) }))
    .sort((a, b) => b.amountEur.comparedTo(a.amountEur));
  const overhead = sum(overheadByCategory.map((o) => o.amountEur));
  const envelopeUnallocated = sum(envelopes.map((e) => dec(e.amountEur).minus(sum(e.allocations.map((a) => dec(a.amountEur))))));
  const clientFees = dec(clientPayments._sum.feesEur ?? 0);
  const supplierFees = dec(supplierPayments._sum.feesEur ?? 0);
  const fxDiff = dec(fxAllocs._sum.fxDifferenceEur ?? 0);
  const managementResult = productionMargin.minus(overhead).minus(envelopeUnallocated).minus(clientFees).minus(supplierFees).minus(fxDiff);

  const ownerMinutes = ownerTime.reduce((n, t) => n + t.minutes, 0);
  const ownerHours = new Decimal(ownerMinutes).div(60);
  const ownerValuation = ownerTime.length
    ? roundCents(
        sum(
          ownerTime.map((t) => {
            const rate = t.valuationRate ?? settings.ownerHourlyRate;
            return rate ? new Decimal(t.minutes).div(60).mul(dec(rate)) : ZERO;
          }),
        ),
      )
    : settings.ownerHourlyRate
      ? ZERO
      : null;

  const collections = dec(clientPayments._sum.amountEur ?? 0);
  const refundsEur = dec(refunds._sum.amountEur ?? 0);
  const supplierPaid = dec(supplierPayments._sum.amountEur ?? 0);
  const expensesPaidEur = dec(expensesPaid._sum.grossEur ?? 0);

  return {
    salesSignedEur: dec(signedLines._sum.netAmountEur ?? 0).minus(dec(cancelledLines._sum.cancelledAmountEur ?? 0)),
    salesCancelledEur: dec(cancelledLines._sum.cancelledAmountEur ?? 0),
    invoicedNetEur: dec(invoices._sum.totalNetEur ?? 0).minus(dec(creditNotes._sum.totalNetEur ?? 0)),
    creditNotesNetEur: dec(creditNotes._sum.totalNetEur ?? 0),
    invoicedCount: invoices._count,
    deliveredRevenueEur: deliveredRevenue,
    deliveredCount: recognized.filter((v) => v.status !== "CANCELLED").length,
    cancelledCount: recognized.filter((v) => v.status === "CANCELLED").length,
    deliveredCostsEur: deliveredCosts,
    deliveredMissingCosts: deliveredMissing,
    productionMarginEur: productionMargin,
    productionMarginPct: marginRate(deliveredRevenue, productionMargin),
    marginIsProvisional: deliveredMissing > 0 || [...fin.values()].some((f) => f.status !== "FINAL"),
    overheadEur: overhead,
    overheadByCategory,
    envelopeUnallocatedEur: envelopeUnallocated,
    paymentFeesEur: clientFees.plus(supplierFees),
    fxDifferenceEur: fxDiff,
    managementResultEur: managementResult,
    ownerTimeHours: ownerHours,
    ownerTimeValuationEur: ownerValuation,
    ownerTimeAlreadyInCosts: settings.ownerTimeIncludedInCosts,
    managementResultAfterOwnerEur:
      ownerValuation === null ? null : settings.ownerTimeIncludedInCosts ? managementResult : managementResult.minus(ownerValuation),
    collectionsEur: collections,
    refundsEur,
    clientFeesEur: clientFees,
    supplierPaymentsEur: supplierPaid,
    supplierFeesEur: supplierFees,
    expensesPaidEur,
    netCashFlowEur: collections.minus(clientFees).minus(refundsEur).minus(supplierPaid).minus(supplierFees).minus(expensesPaidEur),
    costsIncurredEur: sum(incurred.filter((c) => c.amountEur !== null).map((c) => dec(c.amountEur))),
    costsIncurredMissing: incurred.filter((c) => c.amountEur === null).length,
  };
}

/** Créances clients (au jour J) : soldes des factures émises, convertis au taux de la facture. */
export async function getReceivables(today: string) {
  const invoices = await prisma.invoice.findMany({
    where: { status: "ISSUED" },
    select: { id: true, number: true, clientId: true, client: { select: { displayName: true } }, currency: true, totalGross: true, totalNet: true, totalNetEur: true, fxUnitsPerEur: true, dueDate: true, issueDate: true },
  });
  const balances = await getInvoiceBalances(prisma, invoices.map((i) => i.id), today);
  let totalEur = ZERO;
  let overdueEur = ZERO;
  let overdueCount = 0;
  const open: { id: string; number: string | null; client: string; clientId: string; currency: string; balance: Decimal; balanceEur: Decimal; dueDate: Date | null; daysOverdue: number; overdue: boolean }[] = [];
  for (const inv of invoices) {
    const b = balances.get(inv.id)!;
    if (b.balance.lte(0)) continue;
    const balanceEur = roundCents(b.balance.div(dec(inv.fxUnitsPerEur)));
    totalEur = totalEur.plus(balanceEur);
    if (b.overdue) {
      overdueEur = overdueEur.plus(balanceEur);
      overdueCount += 1;
    }
    open.push({ id: inv.id, number: inv.number, client: inv.client.displayName, clientId: inv.clientId, currency: inv.currency, balance: b.balance, balanceEur, dueDate: inv.dueDate, daysOverdue: b.daysOverdue, overdue: b.overdue });
  }
  return { totalEur, overdueEur, overdueCount, open: open.sort((a, b) => b.daysOverdue - a.daysOverdue) };
}

export async function getSupplierDebt() {
  const balances = await getEditorBalances(prisma);
  let dueEur = ZERO;
  for (const b of balances.values()) dueEur = dueEur.plus(b.dueEur);
  return { dueEur, editors: balances };
}

/** Séries mensuelles : CA facturé HT net et encaissements, sur les 12 derniers mois. */
export async function getMonthlySeries(lastMonthIso: string, months = 12) {
  const end = lastMonthIso.slice(0, 7);
  const [y, m] = end.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - months, 1));
  const endDate = new Date(Date.UTC(y, m, 0));
  const [inv, cn, pay] = await Promise.all([
    prisma.$queryRaw<{ month: string; total: string }[]>`
      SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') AS month, COALESCE(SUM("totalNetEur"), 0)::text AS total
      FROM "Invoice" WHERE status = 'ISSUED' AND "issueDate" BETWEEN ${startDate} AND ${endDate} GROUP BY 1`,
    prisma.$queryRaw<{ month: string; total: string }[]>`
      SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') AS month, COALESCE(SUM("totalNetEur"), 0)::text AS total
      FROM "CreditNote" WHERE status = 'ISSUED' AND "issueDate" BETWEEN ${startDate} AND ${endDate} GROUP BY 1`,
    prisma.$queryRaw<{ month: string; total: string }[]>`
      SELECT to_char(date_trunc('month', "receivedOn"), 'YYYY-MM') AS month, COALESCE(SUM("amountEur"), 0)::text AS total
      FROM "ClientPayment" WHERE status = 'RECORDED' AND "receivedOn" BETWEEN ${startDate} AND ${endDate} GROUP BY 1`,
  ]);
  const map = (rows: { month: string; total: string }[]) => new Map(rows.map((r) => [r.month, dec(r.total)]));
  const invM = map(inv);
  const cnM = map(cn);
  const payM = map(pay);
  const out: { month: string; invoicedEur: string; collectedEur: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({
      month: key,
      invoicedEur: (invM.get(key) ?? ZERO).minus(cnM.get(key) ?? ZERO).toFixed(2),
      collectedEur: (payM.get(key) ?? ZERO).toFixed(2),
    });
  }
  return out;
}

/** Marge des livrables reconnus sur la période, par client. */
export async function getMarginByClient(period: Pick<Period, "from" | "to">) {
  const settings = await getSettings();
  const ids = await recognizedVideoIds(prisma, period, settings.timezone);
  const fin = await getVideosFinancials(prisma, ids);
  const videos = await prisma.video.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true, project: { select: { client: { select: { id: true, displayName: true } } } } },
  });
  const byClient = new Map<string, { clientId: string; name: string; revenue: Decimal; costs: Decimal; missing: number; count: number }>();
  for (const v of videos) {
    const f = fin.get(v.id)!;
    const c = v.project.client;
    const e = byClient.get(c.id) ?? { clientId: c.id, name: c.displayName, revenue: ZERO, costs: ZERO, missing: 0, count: 0 };
    e.revenue = e.revenue.plus(f.revenueEur);
    e.costs = e.costs.plus(f.costsEur);
    e.missing += f.missingCostCount;
    e.count += 1;
    byClient.set(c.id, e);
  }
  return [...byClient.values()]
    .map((e) => ({ ...e, margin: e.revenue.minus(e.costs), rate: marginRate(e.revenue, e.revenue.minus(e.costs)) }))
    .sort((a, b) => b.margin.comparedTo(a.margin));
}

export { computeMargin };
