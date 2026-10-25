import "server-only";
/**
 * Rapports filtrables et exportables. Chaque rapport déclare sa date de référence.
 * La même fonction alimente l'écran ET l'export CSV : un export ne révèle jamais un
 * champ que l'utilisateur ne peut pas voir à l'écran (contrôle des droits commun).
 */
import type { Period } from "@/lib/dates";
import { addDays, addMonths, diffInDays, endOfMonth, monthLabel, startOfWeek, toDateOnlyString } from "@/lib/dates";
import { Decimal, dec, marginRate, roundCents, sum } from "@/lib/money";
import { AGING_LABELS, agingBucket } from "../domain/invoice-state";
import { MARGIN_STATUS_LABELS } from "../domain/profitability";
import { ASSIGNMENT_ROLE_LABELS, CHANGE_REQUEST_STATUS, FEEDBACK_SOURCE_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { prisma } from "../db";
import { ForbiddenError } from "../errors";
import { can, type Actor, type Permission } from "../policies";
import { getSettings } from "../settings";
import { getEditorBalances } from "./billing";
import { agencyToday } from "./common";
import { getPeriodMetrics, getReceivables, recognizedVideos } from "./metrics";
import { getProjectsFinancials, getVideosFinancials } from "./profitability";

export interface ReportColumn {
  key: string;
  label: string;
  kind?: "text" | "money" | "percent" | "number";
}

export interface ReportTable {
  key: string;
  title: string;
  dateBasis: string;
  notes?: string[];
  columns: ReportColumn[];
  rows: Record<string, string | null>[];
  totals?: Record<string, string | null>;
}

export const REPORTS: { key: string; label: string; perm: Permission; usesPeriod: boolean }[] = [
  { key: "resultat", label: "Résultat mensuel", perm: "reports.finance", usesPeriod: false },
  { key: "clients", label: "Rentabilité client", perm: "reports.finance", usesPeriod: true },
  { key: "projets", label: "Rentabilité projet", perm: "reports.finance", usesPeriod: false },
  { key: "videos", label: "Rentabilité vidéo", perm: "reports.finance", usesPeriod: true },
  { key: "formats", label: "Rentabilité par format", perm: "reports.finance", usesPeriod: true },
  { key: "monteurs", label: "Coûts et règlements par monteur", perm: "reports.finance", usesPeriod: true },
  { key: "impayes", label: "Impayés et ancienneté", perm: "reports.finance", usesPeriod: false },
  { key: "charge", label: "Charge de production", perm: "reports.operational", usesPeriod: false },
  { key: "hors-perimetre", label: "Retouches hors périmètre", perm: "reports.operational", usesPeriod: true },
];

const m2 = (d: Decimal | null | undefined) => (d === null || d === undefined ? null : d.toFixed(2));

export async function buildReport(actor: Actor, key: string, period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const def = REPORTS.find((r) => r.key === key);
  if (!def) throw new ForbiddenError("Rapport inconnu.");
  if (!can(actor, def.perm)) throw new ForbiddenError();
  switch (key) {
    case "resultat":
      return monthlyResult();
    case "clients":
      return clientProfitability(period);
    case "projets":
      return projectProfitability();
    case "videos":
      return videoProfitability(period);
    case "formats":
      return formatProfitability(period);
    case "monteurs":
      return editorCosts(period);
    case "impayes":
      return receivablesAging();
    case "charge":
      return productionLoad();
    case "hors-perimetre":
      return outOfScope(actor, period);
    default:
      throw new ForbiddenError("Rapport inconnu.");
  }
}

async function monthlyResult(): Promise<ReportTable> {
  const today = await agencyToday();
  const rows: ReportTable["rows"] = [];
  for (let i = 11; i >= 0; i--) {
    const from = addMonths(`${today.slice(0, 7)}-01`, -i);
    const m = await getPeriodMetrics({ from, to: endOfMonth(from) });
    rows.push({
      month: monthLabel(from),
      signed: m2(m.salesSignedEur),
      invoiced: m2(m.invoicedNetEur),
      delivered: m2(m.deliveredRevenueEur),
      costs: m2(m.deliveredCostsEur),
      margin: m2(m.productionMarginEur),
      overhead: m2(m.overheadEur.plus(m.envelopeUnallocatedEur).plus(m.paymentFeesEur).plus(m.fxDifferenceEur)),
      result: m2(m.managementResultEur),
      cash: m2(m.netCashFlowEur),
      complete: m.deliveredMissingCosts ? `${m.deliveredMissingCosts} coût(s) manquant(s)` : m.marginIsProvisional ? "prévisionnelle" : "finale",
    });
  }
  return {
    key: "resultat",
    title: "Résultat mensuel (12 derniers mois)",
    dateBasis: "Ventes : acceptation · Facturé : émission · Livré et coûts : livraison · Charges : mois de rattachement · Trésorerie : date du mouvement",
    notes: ["Résultat de gestion estimé, avant fiscalité. Charges = structure + enveloppes non allouées + frais de paiement + écarts de change."],
    columns: [
      { key: "month", label: "Mois" },
      { key: "signed", label: "Ventes signées HT", kind: "money" },
      { key: "invoiced", label: "CA facturé HT net", kind: "money" },
      { key: "delivered", label: "CA de gestion livré", kind: "money" },
      { key: "costs", label: "Coûts directs livrables", kind: "money" },
      { key: "margin", label: "Marge de production", kind: "money" },
      { key: "overhead", label: "Charges et frais", kind: "money" },
      { key: "result", label: "Résultat de gestion", kind: "money" },
      { key: "cash", label: "Flux de trésorerie", kind: "money" },
      { key: "complete", label: "Complétude" },
    ],
    rows,
  };
}

async function clientProfitability(period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const settings = await getSettings();
  const videos = await recognizedVideos(prisma, period, settings.timezone);
  const fin = await getVideosFinancials(prisma, videos.map((v) => v.id));
  const details = await prisma.video.findMany({ where: { id: { in: videos.map((v) => v.id) } }, select: { id: true, project: { select: { client: { select: { id: true, displayName: true } } } } } });
  const metrics = await getPeriodMetrics(period);
  const byClient = new Map<string, { name: string; count: number; revenue: Decimal; costs: Decimal; missing: number }>();
  for (const v of details) {
    const f = fin.get(v.id)!;
    const c = v.project.client;
    const e = byClient.get(c.id) ?? { name: c.displayName, count: 0, revenue: new Decimal(0), costs: new Decimal(0), missing: 0 };
    e.count += 1;
    e.revenue = e.revenue.plus(f.revenueEur);
    e.costs = e.costs.plus(f.costsEur);
    e.missing += f.missingCostCount;
    byClient.set(c.id, e);
  }
  // Ventilation analytique facultative des charges de structure, méthode explicite et stable.
  let hours = new Map<string, Decimal>();
  if (settings.overheadMethod === "HOURS") {
    const entries = await prisma.timeEntry.findMany({ where: { workedOn: { gte: new Date(`${period.from}T00:00:00Z`), lte: new Date(`${period.to}T00:00:00Z`) }, video: { isNot: null } }, select: { minutes: true, video: { select: { project: { select: { clientId: true } } } } } });
    hours = new Map();
    for (const t of entries) {
      const id = t.video!.project.clientId;
      hours.set(id, (hours.get(id) ?? new Decimal(0)).plus(t.minutes));
    }
  }
  const totalRevenue = sum([...byClient.values()].map((e) => e.revenue));
  const totalHours = sum([...hours.values()]);
  const overhead = metrics.overheadEur;
  const rows = [...byClient.entries()].map(([id, e]) => {
    const margin = e.revenue.minus(e.costs);
    let share: Decimal | null = null;
    if (settings.overheadMethod === "REVENUE" && !totalRevenue.isZero()) share = roundCents(overhead.mul(e.revenue).div(totalRevenue));
    if (settings.overheadMethod === "HOURS" && !totalHours.isZero()) share = roundCents(overhead.mul(hours.get(id) ?? 0).div(totalHours));
    return {
      client: e.name, count: String(e.count), revenue: m2(e.revenue), costs: m2(e.costs), margin: m2(margin), rate: marginRate(e.revenue, margin)?.toFixed(2) ?? null,
      status: e.missing ? `provisoire (${e.missing} coût(s) manquant(s))` : "complète",
      ...(settings.overheadMethod !== "NONE" ? { overhead: m2(share), afterOverhead: share ? m2(margin.minus(share)) : null } : {}),
    };
  });
  rows.sort((a, b) => dec(b.margin ?? 0).comparedTo(dec(a.margin ?? 0)));
  const method = settings.overheadMethod === "REVENUE" ? "au prorata du CA alloué" : settings.overheadMethod === "HOURS" ? "au prorata des heures saisies" : null;
  return {
    key: "clients",
    title: `Rentabilité client — ${period.label}`,
    dateBasis: "Livrables livrés (ou annulés) sur la période · date de livraison",
    notes: [
      "Marge directe = revenu alloué aux livrables − coûts directs de ces livrables.",
      ...(method ? [`Charges de structure ventilées ${method} : analyse distincte de la marge directe.`] : []),
    ],
    columns: [
      { key: "client", label: "Client" },
      { key: "count", label: "Livrables", kind: "number" },
      { key: "revenue", label: "Revenu alloué", kind: "money" },
      { key: "costs", label: "Coûts directs", kind: "money" },
      { key: "margin", label: "Marge directe", kind: "money" },
      { key: "rate", label: "Taux", kind: "percent" },
      { key: "status", label: "Complétude" },
      ...(method ? [{ key: "overhead", label: "Charges ventilées", kind: "money" as const }, { key: "afterOverhead", label: "Après ventilation", kind: "money" as const }] : []),
    ],
    rows,
    totals: { client: "Total", count: String(details.length), revenue: m2(totalRevenue), costs: m2(sum([...byClient.values()].map((e) => e.costs))), margin: m2(totalRevenue.minus(sum([...byClient.values()].map((e) => e.costs)))), rate: null, status: null },
  };
}

async function projectProfitability(): Promise<ReportTable> {
  const projects = await prisma.project.findMany({ where: { status: { notIn: ["DRAFT"] } }, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, title: true, status: true, client: { select: { displayName: true } } } });
  const fin = await getProjectsFinancials(prisma, projects.map((p) => p.id));
  return {
    key: "projets",
    title: "Rentabilité projet (contractuelle)",
    dateBasis: "Toutes dates : ventes acceptées du projet (nettes des annulations) et coûts directs du projet",
    notes: ["Les factures n'entrent pas dans la marge (source unique : ventes). « Finale » uniquement quand les coûts sont tous validés et le projet livré."],
    columns: [
      { key: "project", label: "Projet" },
      { key: "client", label: "Client" },
      { key: "sold", label: "Vendu HT", kind: "money" },
      { key: "unallocated", label: "Non réparti", kind: "money" },
      { key: "costs", label: "Coûts directs", kind: "money" },
      { key: "margin", label: "Marge", kind: "money" },
      { key: "rate", label: "Taux", kind: "percent" },
      { key: "status", label: "Nature" },
    ],
    rows: projects.map((p) => {
      const f = fin.get(p.id)!;
      return {
        project: `${p.reference} — ${p.title}`, client: p.client.displayName, sold: m2(f.soldEur), unallocated: m2(f.unallocatedEur), costs: m2(f.costsEur),
        margin: m2(f.marginEur), rate: f.ratePct?.toFixed(2) ?? null, status: `${MARGIN_STATUS_LABELS[f.status]}${f.missingCostCount ? ` (${f.missingCostCount})` : ""}`,
      };
    }),
  };
}

async function videoProfitability(period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const settings = await getSettings();
  const videos = await recognizedVideos(prisma, period, settings.timezone);
  const fin = await getVideosFinancials(prisma, videos.map((v) => v.id));
  const details = await prisma.video.findMany({ where: { id: { in: videos.map((v) => v.id) } }, orderBy: { deliveredAt: "asc" }, select: { id: true, reference: true, title: true, type: true, status: true, deliveredAt: true, cancelledAt: true, project: { select: { client: { select: { displayName: true } } } } } });
  return {
    key: "videos",
    title: `Rentabilité vidéo — ${period.label}`,
    dateBasis: "Date de livraison (ou d'annulation pour les vidéos annulées)",
    columns: [
      { key: "video", label: "Vidéo" },
      { key: "client", label: "Client" },
      { key: "type", label: "Format" },
      { key: "date", label: "Date" },
      { key: "revenue", label: "Revenu alloué", kind: "money" },
      { key: "costs", label: "Coûts directs", kind: "money" },
      { key: "margin", label: "Marge", kind: "money" },
      { key: "rate", label: "Taux", kind: "percent" },
      { key: "status", label: "Nature" },
    ],
    rows: details.map((v) => {
      const f = fin.get(v.id)!;
      return {
        video: `${v.reference} — ${v.title}${v.status === "CANCELLED" ? " (annulée)" : ""}`, client: v.project.client.displayName, type: VIDEO_TYPE_LABELS[v.type],
        date: toDateOnlyString((v.deliveredAt ?? v.cancelledAt)!), revenue: m2(f.revenueEur), costs: m2(f.costsEur), margin: m2(f.marginEur),
        rate: f.ratePct?.toFixed(2) ?? null, status: `${MARGIN_STATUS_LABELS[f.status]}${f.missingCostCount ? ` (${f.missingCostCount})` : ""}`,
      };
    }),
  };
}

async function formatProfitability(period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const base = await videoProfitability(period);
  const byType = new Map<string, { count: number; revenue: Decimal; costs: Decimal }>();
  for (const r of base.rows) {
    const e = byType.get(r.type!) ?? { count: 0, revenue: new Decimal(0), costs: new Decimal(0) };
    e.count += 1;
    e.revenue = e.revenue.plus(dec(r.revenue));
    e.costs = e.costs.plus(dec(r.costs));
    byType.set(r.type!, e);
  }
  return {
    key: "formats",
    title: `Rentabilité par format — ${period.label}`,
    dateBasis: base.dateBasis,
    columns: [
      { key: "type", label: "Format" },
      { key: "count", label: "Livrables", kind: "number" },
      { key: "revenue", label: "Revenu alloué", kind: "money" },
      { key: "costs", label: "Coûts directs", kind: "money" },
      { key: "margin", label: "Marge", kind: "money" },
      { key: "avg", label: "Marge moyenne / vidéo", kind: "money" },
      { key: "rate", label: "Taux", kind: "percent" },
    ],
    rows: [...byType.entries()].map(([type, e]) => {
      const margin = e.revenue.minus(e.costs);
      return { type, count: String(e.count), revenue: m2(e.revenue), costs: m2(e.costs), margin: m2(margin), avg: m2(roundCents(margin.div(e.count))), rate: marginRate(e.revenue, margin)?.toFixed(2) ?? null };
    }),
  };
}

async function editorCosts(period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const range = { gte: new Date(`${period.from}T00:00:00Z`), lte: new Date(`${period.to}T00:00:00Z`) };
  const [editors, costs, payments, balances] = await Promise.all([
    prisma.editorProfile.findMany({ select: { id: true, displayName: true } }),
    prisma.directCost.findMany({ where: { editorId: { not: null }, incurredOn: range, stage: { not: "CANCELLED" } }, select: { editorId: true, amountEur: true, stage: true } }),
    prisma.supplierPayment.findMany({ where: { status: "RECORDED", paidOn: range, editorId: { not: null } }, select: { editorId: true, amountEur: true, feesEur: true, allocations: { where: { reversedAt: null }, select: { fxDifferenceEur: true } } } }),
    getEditorBalances(prisma),
  ]);
  const rows = editors
    .map((e) => {
      const c = costs.filter((x) => x.editorId === e.id);
      const p = payments.filter((x) => x.editorId === e.id);
      return {
        editor: e.displayName,
        engaged: m2(sum(c.filter((x) => x.amountEur).map((x) => dec(x.amountEur)))),
        missing: String(c.filter((x) => !x.amountEur).length),
        validated: m2(sum(c.filter((x) => x.stage === "VALIDATED" && x.amountEur).map((x) => dec(x.amountEur)))),
        paid: m2(sum(p.map((x) => dec(x.amountEur)))),
        fees: m2(sum(p.map((x) => dec(x.feesEur)))),
        fx: m2(sum(p.flatMap((x) => x.allocations.map((a) => dec(a.fxDifferenceEur))))),
        due: m2(balances.get(e.id)?.dueEur ?? new Decimal(0)),
      };
    })
    .filter((r) => r.engaged !== "0.00" || r.paid !== "0.00" || r.due !== "0.00" || r.missing !== "0");
  return {
    key: "monteurs",
    title: `Coûts et règlements par monteur — ${period.label}`,
    dateBasis: "Coûts : date d'engagement · Règlements : date de paiement · Reste dû : aujourd'hui",
    notes: ["Montants en EUR au taux figé de chaque opération. L'écart de change est distinct du coût."],
    columns: [
      { key: "editor", label: "Prestataire" },
      { key: "engaged", label: "Coûts engagés (EUR)", kind: "money" },
      { key: "missing", label: "Coûts à renseigner", kind: "number" },
      { key: "validated", label: "Dont validés", kind: "money" },
      { key: "paid", label: "Réglé sur la période", kind: "money" },
      { key: "fees", label: "Frais", kind: "money" },
      { key: "fx", label: "Écarts de change", kind: "money" },
      { key: "due", label: "Reste dû (aujourd'hui)", kind: "money" },
    ],
    rows,
  };
}

async function receivablesAging(): Promise<ReportTable> {
  const today = await agencyToday();
  const r = await getReceivables(today);
  const buckets = new Map<string, Decimal>();
  for (const i of r.open) buckets.set(agingBucket(i.daysOverdue), (buckets.get(agingBucket(i.daysOverdue)) ?? new Decimal(0)).plus(i.balanceEur));
  return {
    key: "impayes",
    title: "Impayés et ancienneté des créances",
    dateBasis: `Au ${today} · ancienneté calculée depuis l'échéance`,
    notes: [`Synthèse : ${Object.entries(AGING_LABELS).map(([k, l]) => `${l} ${m2(buckets.get(k) ?? new Decimal(0))} €`).join(" · ")}`],
    columns: [
      { key: "number", label: "Facture" },
      { key: "client", label: "Client" },
      { key: "due", label: "Échéance" },
      { key: "days", label: "Jours de retard", kind: "number" },
      { key: "bucket", label: "Tranche" },
      { key: "balance", label: "Solde (devise)", kind: "text" },
      { key: "balanceEur", label: "Solde EUR", kind: "money" },
    ],
    rows: r.open.map((i) => ({
      number: i.number, client: i.client, due: i.dueDate ? toDateOnlyString(i.dueDate) : null, days: String(i.daysOverdue),
      bucket: AGING_LABELS[agingBucket(i.daysOverdue)], balance: `${i.balance.toFixed(2)} ${i.currency}`, balanceEur: m2(i.balanceEur),
    })),
    totals: { number: "Total", client: null, due: null, days: null, bucket: null, balance: null, balanceEur: m2(r.totalEur) },
  };
}

async function productionLoad(): Promise<ReportTable> {
  const today = await agencyToday();
  const weeks = [0, 1, 2, 3].map((i) => addDays(startOfWeek(today), i * 7));
  const assignments = await prisma.assignment.findMany({
    where: { status: { in: ["PLANNED", "IN_PROGRESS", "SUBMITTED"] } },
    select: { estimatedHours: true, dueOn: true, role: true, editor: { select: { id: true, displayName: true, weeklyCapacityHours: true } } },
  });
  const byEditor = new Map<string, { name: string; capacity: string | null; weeks: Decimal[]; later: Decimal; missing: number; roles: Set<string> }>();
  for (const a of assignments) {
    const e = byEditor.get(a.editor.id) ?? { name: a.editor.displayName, capacity: a.editor.weeklyCapacityHours?.toFixed(1) ?? null, weeks: weeks.map(() => new Decimal(0)), later: new Decimal(0), missing: 0, roles: new Set<string>() };
    e.roles.add(ASSIGNMENT_ROLE_LABELS[a.role]);
    if (!a.estimatedHours) e.missing += 1;
    else {
      // Semaine de l'échéance (une mission en retard compte dans la semaine en cours).
      const due = a.dueOn ? toDateOnlyString(a.dueOn) : today;
      const idx = Math.max(0, Math.floor(diffInDays(weeks[0], due) / 7));
      if (idx < weeks.length) e.weeks[idx] = e.weeks[idx].plus(dec(a.estimatedHours));
      else e.later = e.later.plus(dec(a.estimatedHours));
    }
    byEditor.set(a.editor.id, e);
  }
  return {
    key: "charge",
    title: "Charge de production (4 semaines)",
    dateBasis: `Échéances des missions actives, semaines à partir du ${weeks[0]}`,
    notes: ["Heures estimées (pas le nombre de vidéos : une VSL et un Reel n'ont pas la même charge). Missions sans estimation : charge incomplète."],
    columns: [
      { key: "editor", label: "Prestataire" },
      { key: "roles", label: "Rôles" },
      { key: "capacity", label: "Capacité / sem.", kind: "number" },
      ...weeks.map((w, i) => ({ key: `w${i}`, label: `Sem. ${w.slice(5).split("-").reverse().join("/")}`, kind: "number" as const })),
      { key: "later", label: "Plus tard", kind: "number" },
      { key: "missing", label: "Sans estimation", kind: "number" },
    ],
    rows: [...byEditor.values()].map((e) => ({
      editor: e.name, roles: [...e.roles].join(", "), capacity: e.capacity,
      ...Object.fromEntries(e.weeks.map((w, i) => [`w${i}`, w.toFixed(1)])),
      later: e.later.toFixed(1), missing: String(e.missing),
    })),
  };
}

async function outOfScope(actor: Actor, period: Pick<Period, "from" | "to" | "label">): Promise<ReportTable> {
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${addDays(period.to, 1)}T00:00:00Z`);
  const showAmounts = can(actor, "costs.read");
  const [requests, feedback] = await Promise.all([
    prisma.changeRequest.findMany({ where: { createdAt: { gte: start, lt: end } }, include: { video: { select: { reference: true, title: true, project: { select: { client: { select: { displayName: true } } } } } } } }),
    prisma.feedback.findMany({ where: { category: "OUT_OF_SCOPE", createdAt: { gte: start, lt: end } }, include: { video: { select: { reference: true, title: true, project: { select: { client: { select: { displayName: true } } } } } } } }),
  ]);
  return {
    key: "hors-perimetre",
    title: `Retouches hors périmètre — ${period.label}`,
    dateBasis: "Date de création de la demande ou du retour",
    columns: [
      { key: "date", label: "Date" },
      { key: "client", label: "Client" },
      { key: "video", label: "Vidéo" },
      { key: "what", label: "Demande" },
      { key: "status", label: "Statut" },
      ...(showAmounts ? [{ key: "price", label: "Supplément client", kind: "text" as const }, { key: "cost", label: "Coût monteur", kind: "text" as const }] : []),
    ],
    rows: [
      ...requests.map((r) => ({
        date: toDateOnlyString(r.createdAt), client: r.video.project.client.displayName, video: `${r.video.reference} — ${r.video.title}`, what: r.title,
        status: CHANGE_REQUEST_STATUS[r.status].label,
        ...(showAmounts ? { price: r.clientPrice ? `${r.clientPrice.toFixed(2)} ${r.clientCurrency}` : null, cost: r.editorCost ? `${r.editorCost.toFixed(2)} ${r.editorCurrency}` : null } : {}),
      })),
      ...feedback.map((f) => ({
        date: toDateOnlyString(f.createdAt), client: f.video.project.client.displayName, video: `${f.video.reference} — ${f.video.title}`, what: `Retour ${FEEDBACK_SOURCE_LABELS[f.source].toLowerCase()} : ${f.body.slice(0, 120)}`,
        status: "Retour classé hors périmètre",
        ...(showAmounts ? { price: null, cost: null } : {}),
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

/** Export CSV (séparateur « ; », BOM UTF-8 pour Excel, décimales avec virgule). */
export function toCsv(report: ReportTable): string {
  const esc = (v: string | null | undefined) => {
    const s = v ?? "";
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const fmt = (c: ReportColumn, v: string | null) => (v !== null && (c.kind === "money" || c.kind === "percent") ? v.replace(".", ",") : v);
  const lines = [
    [`# ${report.title}`],
    [`# Date de référence : ${report.dateBasis}`],
    ...(report.notes ?? []).map((n) => [`# ${n}`]),
    report.columns.map((c) => c.label + (c.kind === "money" ? " (EUR)" : c.kind === "percent" ? " (%)" : "")),
    ...report.rows.map((r) => report.columns.map((c) => fmt(c, r[c.key] ?? null))),
    ...(report.totals ? [report.columns.map((c) => fmt(c, report.totals![c.key] ?? null))] : []),
  ];
  return "﻿" + lines.map((l) => l.map(esc).join(";")).join("\r\n");
}
