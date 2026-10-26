import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDollarSign, Clock, Hammer, UserPlus } from "lucide-react";
import { BarList, MonthlyFinanceChart } from "@/components/app/charts";
import { KpiCard, type KpiCardProps } from "@/components/app/kpi-card";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { Section } from "@/components/app/section";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { Decimal } from "@/lib/money";
import { redirect } from "next/navigation";
import { requireActor, requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { periodFromParams } from "@/server/period";
import { getEditorCapacity, getOperationalSnapshot, getVolumeCharts } from "@/server/queries/dashboard";
import { getMarginByClient, getMonthlySeries, getPeriodMetrics, getReceivables, getSupplierDebt } from "@/server/services/metrics";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Tableau de bord") };
}

/** Variation vs période précédente comparable ; « favorable » dépend du sens de l'indicateur. */
function delta(tr: T, current: Decimal, previous: Decimal, label: string, higherIsBetter = true): KpiCardProps["delta"] {
  if (previous.isZero() && current.isZero()) return { label: tr("stable vs {0}", [label]), direction: "flat" };
  if (previous.isZero()) return { label: tr("nouveau vs {0}", [label]), direction: "up", favorable: higherIsBetter };
  const pct = current.minus(previous).div(previous.abs()).mul(100).toDecimalPlaces(0);
  const dir = pct.gt(0) ? "up" : pct.lt(0) ? "down" : "flat";
  return { label: tr("{0}{1} % vs {2}", [pct.gt(0) ? "+" : "", pct.toString(), label]), direction: dir, favorable: dir === "up" ? higherIsBetter : !higherIsBetter };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const tr = await getT();
  // Page d'accueil après connexion : un monteur arrive directement sur ses missions.
  const current = await requireActor();
  if (current.role === "EDITOR") redirect("/missions");
  const actor = await requirePagePermission("dashboard.view");
  const params = await props.searchParams;
  const { period, previous, today } = await periodFromParams(params);
  const finance = can(actor, "finance.kpis");
  const [ops, capacity, volumes, m, prev, receivables, debt, monthly, byClient] = await Promise.all([
    getOperationalSnapshot(actor, today),
    getEditorCapacity(today),
    getVolumeCharts(period),
    finance ? getPeriodMetrics(period) : null,
    finance ? getPeriodMetrics(previous) : null,
    finance ? getReceivables(today) : null,
    finance ? getSupplierDebt() : null,
    finance ? getMonthlySeries(today) : null,
    finance ? getMarginByClient(period) : null,
  ]);
  const actions: { icon: React.ReactNode; text: React.ReactNode; href: string; cta: string; tone: "danger" | "warning" | "info" }[] = [
    ...ops.overdueList.map((v) => ({ icon: <Clock className="size-4" />, text: <><strong>{v.reference}</strong> {v.title} {" "}{tr("— en retard (")}{formatDateOnly(v.clientDeadline ?? v.internalDeadline)}) · {v.project.client.displayName}</>, href: `/videos/${v.id}`, cta: tr("Ouvrir"), tone: "danger" as const })),
    ...ops.validateList.map((v) => ({ icon: <Hammer className="size-4" />, text: <><strong>{v.reference}</strong> {v.title} — {tr(VIDEO_STATUS[v.status].label).toLowerCase()}</>, href: `/videos/${v.id}?onglet=versions`, cta: tr("Valider"), tone: "info" as const })),
    ...ops.assignList.map((v) => ({ icon: <UserPlus className="size-4" />, text: <><strong>{v.reference}</strong> {v.title} {" "}{tr("— à attribuer (deadline")}{" "}{formatDateOnly(v.clientDeadline)})</>, href: `/videos/${v.id}`, cta: tr("Affecter"), tone: "warning" as const })),
    ...(receivables && receivables.overdueCount ? [{ icon: <CircleDollarSign className="size-4" />, text: <>{receivables.overdueCount} {" "}{tr("facture(s) en retard de paiement —")}{" "}<Money value={receivables.overdueEur.toFixed(2)} /></>, href: "/finances?onglet=factures&etat=overdue", cta: tr("Relancer"), tone: "danger" as const }] : []),
    ...(ops.missingCosts && ops.showCosts ? [{ icon: <AlertTriangle className="size-4" />, text: <>{ops.missingCosts} {" "}{tr("mission(s) sans coût renseigné : marges provisoires")}</>, href: "/finances?onglet=couts&manquants=1", cta: tr("Compléter"), tone: "warning" as const }] : []),
    ...(ops.followUps ? [{ icon: <ArrowRight className="size-4" />, text: <>{ops.followUps} {" "}{tr("relance(s) commerciale(s) à faire")}</>, href: "/prospection", cta: tr("Voir"), tone: "info" as const }] : []),
  ];

  return (
    <>
      <PageHeader
        title={tr("Tableau de bord")}
        subtitle={tr("Bonjour {0}. {1}", [actor.name.split(" ")[0], finance ? tr("Période : {0}, comparée à {1}.", [period.label, previous.label]) : tr("Production du jour.")])}
      >
        {finance ? <PeriodFilter /> : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title={tr("Actions prioritaires")} description={tr("Ce qui demande une décision aujourd'hui.")} className="xl:col-span-2" bodyClassName="p-0">
          {actions.length === 0 ? (
            <p className="p-4 text-sm text-subtle">{tr("Rien d'urgent pour le moment.")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {actions.slice(0, 10).map((a, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-info"} aria-hidden>{a.icon}</span>
                  <span className="min-w-0 flex-1">{a.text}</span>
                  <Button asChild size="xs" variant="outline"><Link href={a.href}>{a.cta}</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tr("Production")} bodyClassName="grid grid-cols-2 gap-3">
          {[
            { label: tr("Vidéos actives"), value: ops.active, href: "/videos" },
            { label: tr("À attribuer"), value: ops.toAssign, href: "/videos?vue=a-attribuer", tone: ops.toAssign ? "text-warning" : "" },
            { label: tr("En retard"), value: ops.overdue, href: "/videos?vue=en-retard", tone: ops.overdue ? "text-danger" : "" },
            { label: tr("À valider"), value: ops.toValidate, href: "/videos?vue=a-valider", tone: ops.toValidate ? "text-info" : "" },
            { label: tr("Livraisons sous 7 jours"), value: ops.dueSoon, href: "/planning?mode=liste" },
            { label: tr("Bloquées"), value: ops.blocked, href: "/videos?vue=bloquees", tone: ops.blocked ? "text-danger" : "" },
            ...(ops.showCosts ? [{ label: tr("Missions sans coût"), value: ops.missingCosts, href: "/finances?onglet=couts&manquants=1", tone: ops.missingCosts ? "text-warning" : "" }] : []),
            { label: tr("Relances à faire"), value: ops.followUps, href: "/prospection", tone: ops.followUps ? "text-warning" : "" },
          ].map((k) => (
            <Link key={k.label} href={k.href} className="rounded-lg border border-border p-2.5 hover:border-brand/50">
              <p className={`num text-2xl font-bold ${k.tone ?? ""}`}>{k.value}</p>
              <p className="text-xs text-subtle">{tr(k.label)}</p>
            </Link>
          ))}
        </Section>
      </div>

      {m && prev && receivables && debt && monthly && byClient ? (
        <>
          {m.marginIsProvisional ? (
            <Notice tone="warning" className="mt-5">
              {m.deliveredMissingCosts > 0
                ? <>{tr("Marges provisoires :")}{" "}{m.deliveredMissingCosts} {" "}{tr("coût(s) manquant(s) sur les livrables de la période, ou coûts non encore validés.")}</>
                : tr("Marges provisoires : des coûts des livrables de la période ne sont pas encore validés.")}
            </Notice>
          ) : null}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={tr("CA facturé HT net")} value={<Money value={m.invoicedNetEur.toFixed(2)} />} basis={tr("Factures émises − avoirs · date d'émission")} delta={delta(tr, m.invoicedNetEur, prev.invoicedNetEur, previous.label)} href="/finances?onglet=factures" />
            <KpiCard label={tr("Encaissements (TTC)")} value={<Money value={m.collectionsEur.toFixed(2)} />} basis={tr("Paiements reçus · date de règlement")} delta={delta(tr, m.collectionsEur, prev.collectionsEur, previous.label)} href="/finances?onglet=encaissements" />
            <KpiCard label={tr("Coûts directs des livrables")} value={<Money value={m.deliveredCostsEur.toFixed(2)} />} basis={tr("Coûts des vidéos livrées ou annulées sur la période")} delta={delta(tr, m.deliveredCostsEur, prev.deliveredCostsEur, previous.label, false)} warning={m.deliveredMissingCosts ? tr("{0} coût(s) manquant(s)", [m.deliveredMissingCosts]) : null} href="/finances?onglet=couts" />
            <KpiCard label={tr("Marge de production")} value={<span><Money value={m.productionMarginEur.toFixed(2)} colorize /> <span className="text-sm text-subtle">{m.productionMarginPct ? `${m.productionMarginPct.toFixed(1)} %` : tr("non calculable")}</span></span>} basis={tr("CA de gestion livré ({0} €) − coûts directs", [m.deliveredRevenueEur.toFixed(2)])} delta={delta(tr, m.productionMarginEur, prev.productionMarginEur, previous.label)} href="/rapports?rapport=videos" />
            <KpiCard label={tr("Résultat de gestion estimé, avant fiscalité")} value={<Money value={m.managementResultEur.toFixed(2)} colorize />} basis={tr("Marge − charges de structure − frais − écarts de change")} delta={delta(tr, m.managementResultEur, prev.managementResultEur, previous.label)} href="/rapports?rapport=resultat" />
            <KpiCard label={tr("Créances clients")} value={<Money value={receivables.totalEur.toFixed(2)} />} basis={tr("Au {0} · dont en retard {1} €", [formatDateOnly(today), receivables.overdueEur.toFixed(2)])} href="/finances?onglet=factures" warning={receivables.overdueCount ? tr("{0} facture(s) en retard", [receivables.overdueCount]) : null} />
            <KpiCard label={tr("Dettes monteurs")} value={<Money value={debt.dueEur.toFixed(2)} />} basis={tr("Coûts engagés ou validés non réglés")} href="/finances?onglet=reglements" />
            <KpiCard label={tr("Ventes signées HT")} value={<Money value={m.salesSignedEur.toFixed(2)} />} basis={tr("Lignes acceptées − annulations · date d'acceptation")} delta={delta(tr, m.salesSignedEur, prev.salesSignedEur, previous.label)} href="/finances?onglet=ventes" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section title={tr("CA facturé et encaissements")} description={tr("12 derniers mois · un seul axe en euros")}>
              <MonthlyFinanceChart data={monthly} />
            </Section>
            <Section title={tr("Marge par client")} description={tr("Livrables reconnus sur {0} · marge directe", [period.label])}>
              <BarList money valueLabel={tr("Marge directe")} emptyText={tr("Aucun livrable reconnu sur la période.")} data={byClient.map((c) => ({ label: c.name, value: c.margin.toFixed(2), note: c.missing ? `${c.missing} coût(s) manquant(s)` : undefined }))} />
            </Section>
            <Section title={tr("Coûts par catégorie")} description={tr("{0} · coûts directs des livrables + charges de structure", [period.label])}>
              <BarList
                money
                valueLabel={tr("Montant (EUR)")}
                emptyText={tr("Aucun coût sur la période.")}
                data={[
                  ...(m.deliveredCostsEur.gt(0) ? [{ label: tr("Sous-traitance et achats directs"), value: m.deliveredCostsEur.toFixed(2) }] : []),
                  ...m.overheadByCategory.map((c) => ({ label: c.name, value: c.amountEur.toFixed(2) })),
                ]}
              />
            </Section>
            <Section title={tr("Volumes livrés par type")} description={tr(period.label)}>
              <BarList valueLabel={tr("Vidéos livrées")} emptyText={tr("Aucune livraison sur la période.")} data={volumes.byType.map((v) => ({ label: tr(VIDEO_TYPE_LABELS[v.key]), value: String(v.count) }))} />
            </Section>
          </div>
        </>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title={tr("Étapes de production")} description={tr("Vidéos en cours, par étape")}>
          <BarList valueLabel={tr("Vidéos")} emptyText={tr("Aucune vidéo en cours.")} data={[...volumes.byStatus].sort((a, b) => b.count - a.count).map((v) => ({ label: tr(VIDEO_STATUS[v.key].label), value: String(v.count) }))} />
        </Section>
        <Section title={tr("Capacité des monteurs (7 jours)")} description={tr("Heures estimées des missions vs capacité indicative. Sans estimation, la charge est incomplète.")}>
          <ul className="flex flex-col gap-2.5">
            {capacity.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/monteurs/${e.id}`} className="hover:text-brand">{e.name}</Link>
                  <span className={`num text-xs ${e.overloaded ? "font-semibold text-danger" : "text-subtle"}`}>
                    {e.planned} h{e.capacity ? ` / ${e.capacity} h` : tr(" · capacité non renseignée")} · {e.missions} {" "}{tr("mission(s)")}{e.overloaded ? tr(" · surcharge") : ""}
                  </span>
                </div>
                {e.loadPct !== null ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(e.loadPct, 100)} aria-label={tr("Charge de {0}", [e.name])}>
                    <div className={`h-full rounded-full ${e.overloaded ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.min(e.loadPct, 100)}%` }} />
                  </div>
                ) : null}
                {e.missingEstimates ? <p className="text-xs text-warning">{e.missingEstimates} {" "}{tr("mission(s) sans estimation d'heures")}</p> : null}
              </li>
            ))}
            {capacity.length === 0 ? <li className="text-sm text-subtle">{tr("Aucun prestataire actif.")}</li> : null}
          </ul>
        </Section>
      </div>
      <p className="mt-6 text-xs text-faint">
        {finance ? "" : tr("Les indicateurs financiers globaux sont réservés à l'administration. ")}{tr("Indicateurs de gestion, pas des écritures comptables. Définitions détaillées : Rapports › Définitions.")}</p>
    </>
  );
}
