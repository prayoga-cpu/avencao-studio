import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { sp } from "@/components/app/pagination";
import { PeriodFilter } from "@/components/app/period-filter";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { voidClientPaymentAction, voidExpenseAction, voidSupplierPaymentAction } from "@/features/finance/actions";
import { MarkExpensePaidButton, RefundDialog } from "@/features/finance/finance-dialogs";
import { LegacyQualifyButtons } from "@/features/settings/legacy-qualify";
import { formatDateOnly } from "@/lib/dates";
import {
  COST_KIND_LABELS,
  COST_STAGE,
  INVOICE_KIND_LABELS,
  INVOICE_PAYMENT_STATE,
  PAYMENT_METHOD_LABELS,
  RECONCILIATION_STATUS,
  RECURRENCE_LABELS,
  RETAINER_STATUS,
  enumOptions,
} from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can, type Permission } from "@/server/policies";
import { periodFromParams } from "@/server/period";
import { clientOptions, editorOptions } from "@/server/queries/options";
import {
  listClientPayments,
  listDirectCosts,
  listExpenses,
  listInvoices,
  listLegacyPayments,
  listRetainers,
  listSalesOrders,
  listSupplierPayments,
} from "@/server/queries/finance";
import { getPeriodMetrics, getReceivables, getSupplierDebt } from "@/server/services/metrics";
import { getEditorBalances } from "@/server/services/billing";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Finances" };

const TABS: { value: string; label: string; perm: Permission }[] = [
  { value: "synthese", label: "Synthèse", perm: "invoices.read" },
  { value: "ventes", label: "Ventes", perm: "sales.read" },
  { value: "factures", label: "Factures", perm: "invoices.read" },
  { value: "encaissements", label: "Encaissements", perm: "payments.read" },
  { value: "couts", label: "Coûts directs", perm: "costs.read" },
  { value: "reglements", label: "Règlements monteurs", perm: "supplierPayments.read" },
  { value: "charges", label: "Charges", perm: "expenses.read" },
  { value: "forfaits", label: "Forfaits", perm: "retainers.read" },
  { value: "historique", label: "Historique à rapprocher", perm: "legacy.reconcile" },
];

export default async function FinancesPage(props: PageProps<"/finances">) {
  const actor = await requireActor();
  const params = await props.searchParams;
  const tabs = TABS.filter((t) => can(actor, t.perm));
  if (tabs.length === 0) redirect("/acces-refuse");
  const tab = tabs.find((t) => t.value === params.onglet)?.value ?? tabs[0].value;
  const { period, today } = await periodFromParams(params);
  const keep: Record<string, string> = {};
  for (const k of ["periode", "du", "au"]) if (typeof params[k] === "string") keep[k] = params[k] as string;

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle="Indicateurs de gestion (hors TVA récupérable). Ce CRM n'est pas un logiciel comptable certifié."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(actor, "invoices.write") ? <Button asChild size="sm" variant="outline"><Link href="/finances/factures/nouvelle"><Plus aria-hidden /> Facture</Link></Button> : null}
            {can(actor, "payments.write") ? <Button asChild size="sm" variant="outline"><Link href="/finances/encaissements/nouveau"><Plus aria-hidden /> Encaissement</Link></Button> : null}
            {can(actor, "supplierPayments.write") ? <Button asChild size="sm" variant="outline"><Link href="/finances/reglements/nouveau"><Plus aria-hidden /> Règlement monteur</Link></Button> : null}
            {can(actor, "sales.write") ? <Button asChild size="sm"><Link href="/finances/ventes/nouvelle"><Plus aria-hidden /> Vente</Link></Button> : null}
          </div>
        }
      >
        {tab === "synthese" ? <PeriodFilter label={period.label} /> : null}
      </PageHeader>
      <TabLinks tabs={tabs} active={tab} basePath="/finances" extraParams={keep} />
      {tab === "synthese" ? await Summary() : null}
      {tab === "ventes" ? await Sales() : null}
      {tab === "factures" ? await Invoices() : null}
      {tab === "encaissements" ? await Payments() : null}
      {tab === "couts" ? await Costs() : null}
      {tab === "reglements" ? await SupplierPayments() : null}
      {tab === "charges" ? await Expenses() : null}
      {tab === "forfaits" ? await Retainers() : null}
      {tab === "historique" ? await Legacy() : null}
    </>
  );

  async function Summary() {
    const [m, receivables, debt] = await Promise.all([getPeriodMetrics(period), getReceivables(today), can(actor, "supplierPayments.read") ? getSupplierDebt() : null]);
    const exportHref = (r: string) => `/api/exports/${r}?du=${period.from}&au=${period.to}`;
    return (
      <div className="flex flex-col gap-5">
        {m.marginIsProvisional ? (
          <Notice tone="warning" title="Marge provisoire">
            {m.deliveredMissingCosts > 0 ? `${m.deliveredMissingCosts} coût(s) à renseigner sur les livrables de la période. ` : ""}
            Tant que tous les coûts ne sont pas validés, la marge reste prévisionnelle.
          </Notice>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Ventes signées HT" value={<Money value={m.salesSignedEur.toFixed(2)} />} basis={`Lignes acceptées − annulations · date d'acceptation · ${period.label}`} href="/finances?onglet=ventes" />
          <KpiCard label="CA facturé HT net" value={<Money value={m.invoicedNetEur.toFixed(2)} />} basis={`Factures émises − avoirs (${m.creditNotesNetEur.toFixed(2)} €) · date d'émission · brouillons exclus`} href="/finances?onglet=factures" />
          <KpiCard label="CA de gestion livré" value={<Money value={m.deliveredRevenueEur.toFixed(2)} />} basis={`Allocation des ventes aux ${m.deliveredCount} livrable(s) livrés${m.cancelledCount ? ` (+${m.cancelledCount} annulé·s)` : ""} · date de livraison · analytique`} href="/rapports?rapport=videos" />
          <KpiCard label="Encaissements (TTC)" value={<Money value={m.collectionsEur.toFixed(2)} />} basis={`Mouvements reçus · date de règlement · remboursements : ${m.refundsEur.toFixed(2)} €`} href="/finances?onglet=encaissements" />
          <KpiCard label="Coûts directs des livrables" value={<Money value={m.deliveredCostsEur.toFixed(2)} />} basis="Coûts + allocations des mêmes livrables (estimés, engagés, validés : un seul coût par étape)" warning={m.deliveredMissingCosts ? `${m.deliveredMissingCosts} coût(s) manquant(s)` : null} href="/finances?onglet=couts" />
          <KpiCard label="Marge de production" value={<span><Money value={m.productionMarginEur.toFixed(2)} colorize /> <span className="text-sm text-subtle">{m.productionMarginPct ? `${m.productionMarginPct.toFixed(2)} %` : "non calculable"}</span></span>} basis={`CA de gestion livré − coûts directs de ces livrables · ${m.marginIsProvisional ? "prévisionnelle" : "finale"}`} href="/rapports?rapport=resultat" />
          <KpiCard label="Résultat de gestion estimé, avant fiscalité" value={<Money value={m.managementResultEur.toFixed(2)} colorize />} basis={`Marge − charges de structure (${m.overheadEur.toFixed(2)} €) − enveloppes non allouées (${m.envelopeUnallocatedEur.toFixed(2)} €) − frais de paiement (${m.paymentFeesEur.toFixed(2)} €) − écarts de change (${m.fxDifferenceEur.toFixed(2)} €)`} href="/rapports?rapport=resultat" />
          <KpiCard label="Flux net de trésorerie" value={<Money value={m.netCashFlowEur.toFixed(2)} colorize />} basis="Encaissements − remboursements − règlements monteurs − charges payées − frais. Pas un solde bancaire." href="/finances?onglet=encaissements" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Créances clients (aujourd'hui)" value={<Money value={receivables.totalEur.toFixed(2)} />} basis={`Soldes des factures émises · dont en retard : ${receivables.overdueEur.toFixed(2)} € (${receivables.overdueCount})`} href="/finances?onglet=factures&etat=overdue" />
          {debt ? <KpiCard label="Dettes monteurs (aujourd'hui)" value={<Money value={debt.dueEur.toFixed(2)} />} basis="Coûts engagés ou validés non réglés, au taux d'engagement" href="/finances?onglet=reglements" /> : null}
          <KpiCard
            label="Valorisation du temps du dirigeant"
            value={m.ownerTimeValuationEur === null ? "Taux non défini" : <Money value={m.ownerTimeValuationEur.toFixed(2)} />}
            basis={`${m.ownerTimeHours.toFixed(1)} h × taux interne · analyse séparée, aucune sortie de trésorerie${m.ownerTimeAlreadyInCosts ? " · déjà incluse dans les coûts" : ""}`}
          />
          <KpiCard
            label="Résultat après valorisation du dirigeant"
            value={m.managementResultAfterOwnerEur === null ? "—" : <Money value={m.managementResultAfterOwnerEur.toFixed(2)} colorize />}
            basis="Résultat de gestion − valorisation du temps (sauf si déjà comprise dans les coûts)"
          />
        </div>
        <Section title="Charges de structure par catégorie" description={`Rattachées à la période ${period.label} (mois de rattachement).`} actions={<Button asChild size="sm" variant="outline"><a href={exportHref("charges")}><Download aria-hidden /> CSV</a></Button>}>
          {m.overheadByCategory.length === 0 ? <p className="text-sm text-subtle">Aucune charge sur la période.</p> : (
            <ul className="divide-y divide-border text-sm">
              {m.overheadByCategory.map((c) => <li key={c.name} className="flex justify-between py-1.5"><span>{c.name}</span><Money value={c.amountEur.toFixed(2)} /></li>)}
            </ul>
          )}
        </Section>
      </div>
    );
  }

  async function Sales() {
    const [rows, clients] = await Promise.all([listSalesOrders(actor, { client: sp(params.client), q: sp(params.q) }), clientOptions()]);
    return (
      <>
        <div className="mb-3"><FilterBar searchPlaceholder="Référence ou intitulé…" filters={[{ name: "client", label: "Client", options: clients }]} /></div>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finances/ventes/${r.id}`}
          empty={<EmptyState title="Aucune vente acceptée" description="Une vente se crée à l'acceptation du client (après une opportunité gagnée, par exemple)." />}
          columns={[
            { key: "r", header: "Vente", cell: (r) => <><span className="text-xs text-faint">{r.reference}</span><span className="block">{r.title}</span></> },
            { key: "c", header: "Client", cell: (r) => r.client.displayName },
            { key: "p", header: "Projet", cell: (r) => r.project?.reference ?? "—", hideOnCard: true },
            { key: "d", header: "Acceptée le", cell: (r) => formatDateOnly(r.acceptedOn) },
            { key: "s", header: "Statut", cell: (r) => <StatusBadge label={r.status === "ACCEPTED" ? "Acceptée" : "Annulée"} tone={r.status === "ACCEPTED" ? "success" : "danger"} /> },
            { key: "n", header: "Net HT", numeric: true, cell: (r) => <Money value={r.net} currency={r.currency as CurrencyCode} /> },
            { key: "u", header: "Non réparti", numeric: true, cell: (r) => (r.unallocated === "0.00" ? "—" : <span className="text-warning"><Money value={r.unallocated} currency={r.currency as CurrencyCode} /></span>) },
          ]}
        />
      </>
    );
  }

  async function Invoices() {
    const [rows, clients] = await Promise.all([listInvoices(actor, { client: sp(params.client), state: sp(params.etat), q: sp(params.q) }), clientOptions()]);
    return (
      <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <FilterBar
            searchPlaceholder="Numéro ou client…"
            filters={[
              { name: "client", label: "Client", options: clients },
              { name: "etat", label: "État", options: [...enumOptions(INVOICE_PAYMENT_STATE), { value: "overdue", label: "En retard" }] },
            ]}
          />
          <Button asChild size="sm" variant="outline"><a href={`/api/exports/factures${sp(params.client) ? `?client=${sp(params.client)}` : ""}`}><Download aria-hidden /> CSV</a></Button>
        </div>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finances/factures/${r.id}`}
          empty={<EmptyState title="Aucune facture" description="Enregistrez les factures émises par votre outil de facturation (numéro, montants, PDF)." />}
          columns={[
            { key: "n", header: "Facture", cell: (r) => <>{r.number ?? "Brouillon"}<span className="block text-xs text-faint">{INVOICE_KIND_LABELS[r.kind]}</span></> },
            { key: "c", header: "Client", cell: (r) => r.client.displayName },
            { key: "d", header: "Émise le", cell: (r) => formatDateOnly(r.issueDate) },
            { key: "e", header: "Échéance", cell: (r) => <span className={r.overdue ? "font-semibold text-danger" : undefined}>{formatDateOnly(r.dueDate)}{r.overdue ? ` · ${r.daysOverdue} j de retard` : ""}</span> },
            { key: "s", header: "État", cell: (r) => <StatusBadge {...INVOICE_PAYMENT_STATE[r.state]} /> },
            { key: "ht", header: "HT", numeric: true, hideOnCard: true, cell: (r) => <Money value={r.totalNet} currency={r.currency as CurrencyCode} /> },
            { key: "t", header: "TTC", numeric: true, cell: (r) => <Money value={r.totalGross} currency={r.currency as CurrencyCode} /> },
            { key: "b", header: "Solde", numeric: true, cell: (r) => <Money value={r.balance} currency={r.currency as CurrencyCode} /> },
          ]}
        />
      </>
    );
  }

  async function Payments() {
    const [rows, clients, refunds] = await Promise.all([
      listClientPayments(actor, { client: sp(params.client), status: sp(params.statut) }),
      clientOptions(),
      prisma.clientRefund.findMany({ orderBy: { refundedOn: "desc" }, take: 50, include: { client: { select: { displayName: true } } } }),
    ]);
    return (
      <div className="flex flex-col gap-5">
        <FilterBar showSearch={false} filters={[{ name: "client", label: "Client", options: clients }, { name: "statut", label: "Statut", options: [{ value: "RECORDED", label: "Enregistré" }, { value: "VOIDED", label: "Annulé" }] }]} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Aucun encaissement" />}
          columns={[
            { key: "d", header: "Reçu le", cell: (r) => formatDateOnly(r.receivedOn) },
            { key: "c", header: "Client", cell: (r) => r.client.displayName },
            { key: "m", header: "Moyen", cell: (r) => `${PAYMENT_METHOD_LABELS[r.method]}${r.reference ? ` · ${r.reference}` : ""}`, hideOnCard: true },
            { key: "i", header: "Factures", cell: (r) => r.invoices.map((i) => <Link key={i.allocationId} href={`/finances/factures/${i.id}`} className="mr-2 text-brand hover:underline">{i.number} ({i.amount})</Link>) },
            { key: "a", header: "Montant", numeric: true, cell: (r) => <><Money value={r.amount} currency={r.currency as CurrencyCode} />{r.fees !== "0.00" ? <span className="block text-xs text-subtle">frais {r.fees}</span> : null}</> },
            { key: "av", header: "Non affecté", numeric: true, cell: (r) => (r.status === "VOIDED" ? <StatusBadge label="Annulé" tone="danger" title={r.voidReason ?? undefined} /> : r.available === "0.00" ? "—" : <span className="text-warning"><Money value={r.available} currency={r.currency as CurrencyCode} /></span>) },
            {
              key: "x",
              header: "",
              cell: (r) =>
                r.status === "RECORDED" && can(actor, "payments.write") ? (
                  <span className="flex gap-1">
                    {r.available !== "0.00" ? <RefundDialog paymentId={r.id} today={today} max={r.available} currency={r.currency} label="Rembourser" /> : null}
                    <ConfirmAction trigger={<Button size="xs" variant="ghost">Annuler</Button>} title="Annuler cet encaissement ?" description="Rectification tracée : l'encaissement est conservé avec le statut « annulé », ses affectations sont annulées." reason="required" destructive confirmLabel="Annuler l'encaissement" action={voidClientPaymentAction.bind(null, r.id)} />
                  </span>
                ) : null,
            },
          ]}
        />
        <Section title="Remboursements" description="Sorties de trésorerie : ne réduisent pas une seconde fois le CA.">
          {refunds.length === 0 ? <p className="text-sm text-subtle">Aucun remboursement.</p> : (
            <ul className="divide-y divide-border text-sm">
              {refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>{formatDateOnly(r.refundedOn)} · {r.client.displayName} · {r.reason}</span>
                  <span className="flex items-center gap-2">{r.status === "VOIDED" ? <StatusBadge label="Annulé" tone="danger" /> : null}<Money value={r.amount.toFixed(2)} currency={r.currency as CurrencyCode} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    );
  }

  async function Costs() {
    const [rows, editors] = await Promise.all([
      listDirectCosts(actor, { stage: sp(params.etape), kind: sp(params.nature), editor: sp(params.monteur), missing: sp(params.manquants) === "1" }),
      editorOptions(),
    ]);
    const missing = rows.filter((r) => r.amount === null && r.stage !== "CANCELLED").length;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterBar
            showSearch={false}
            filters={[
              { name: "etape", label: "Étape", options: enumOptions(COST_STAGE) },
              { name: "nature", label: "Nature", options: enumOptions(COST_KIND_LABELS) },
              { name: "monteur", label: "Prestataire", options: editors },
              { name: "manquants", label: "Complétude", options: [{ value: "1", label: "À renseigner uniquement" }] },
            ]}
          />
          {can(actor, "costs.write") ? <Button asChild size="sm"><Link href="/finances/couts/nouveau"><Plus aria-hidden /> Coût direct</Link></Button> : null}
        </div>
        {missing ? <Notice tone="warning">{missing} coût(s) « À renseigner » : les marges concernées restent provisoires.</Notice> : null}
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finances/couts/${r.id}`}
          empty={<EmptyState title="Aucun coût" />}
          columns={[
            { key: "l", header: "Coût", cell: (r) => <>{r.label}<span className="block text-xs text-faint">{COST_KIND_LABELS[r.kind]}</span></> },
            { key: "w", header: "Prestataire / fournisseur", cell: (r) => r.editor?.displayName ?? r.supplierName ?? "—" },
            { key: "v", header: "Rattachement", cell: (r) => r.video?.reference ?? r.project?.reference ?? (r.kind === "ENVELOPE" ? `Enveloppe ${r.periodStart?.slice(0, 7) ?? ""}` : "—"), hideOnCard: true },
            { key: "s", header: "Étape", cell: (r) => <StatusBadge {...COST_STAGE[r.stage]} /> },
            { key: "a", header: "Montant", numeric: true, cell: (r) => <><Money value={r.amount} currency={r.currency as CurrencyCode} />{r.currency !== "EUR" && r.amountEur ? <span className="block text-xs text-subtle">≈ {r.amountEur} €{r.fxSource === "MANUAL" ? " (taux manuel)" : ""}</span> : null}</> },
            { key: "p", header: "Payé", numeric: true, cell: (r) => <Money value={r.paid} currency={r.currency as CurrencyCode} /> },
            { key: "u", header: "Non alloué", numeric: true, hideOnCard: true, cell: (r) => (r.unallocated && r.unallocated !== "0.00" ? <span className="text-warning"><Money value={r.unallocated} currency={r.currency as CurrencyCode} /></span> : "—") },
          ]}
        />
      </div>
    );
  }

  async function SupplierPayments() {
    const [rows, editors, balances] = await Promise.all([listSupplierPayments(actor, { editor: sp(params.monteur) }), editorOptions(), getEditorBalances(prisma)]);
    const editorNames = new Map(editors.map((e) => [e.value, e.label]));
    const balanceRows = [...balances.entries()].flatMap(([editorId, b]) => [...b.byCurrency.entries()].map(([currency, v]) => ({ key: `${editorId}-${currency}`, editorId, name: editorNames.get(editorId) ?? "Prestataire inactif", currency, committed: v.committed.toFixed(2), payable: v.payable.toFixed(2), paid: v.paid.toFixed(2), due: v.due.toFixed(2) }))).filter((r) => r.due !== "0.00");
    return (
      <div className="flex flex-col gap-5">
        <Section title="Restant dû par prestataire" description="Engagé = dû après validation ; payable = validé non réglé." actions={can(actor, "supplierPayments.write") ? <Button asChild size="sm"><Link href="/finances/reglements/nouveau"><Plus aria-hidden /> Règlement</Link></Button> : null}>
          <DataTable
            rows={balanceRows}
            rowKey={(r) => r.key}
            rowHref={(r) => `/monteurs/${r.editorId}`}
            empty={<p className="text-sm text-subtle">Rien à régler.</p>}
            columns={[
              { key: "n", header: "Prestataire", cell: (r) => r.name },
              { key: "c", header: "Devise", cell: (r) => r.currency },
              { key: "e", header: "Engagé (à valider)", numeric: true, cell: (r) => <Money value={r.committed} currency={r.currency as CurrencyCode} /> },
              { key: "p", header: "Payable", numeric: true, cell: (r) => <Money value={r.payable} currency={r.currency as CurrencyCode} /> },
              { key: "d", header: "Reste dû", numeric: true, cell: (r) => <Money value={r.due} currency={r.currency as CurrencyCode} /> },
            ]}
          />
        </Section>
        <Section title="Règlements enregistrés">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<p className="text-sm text-subtle">Aucun règlement.</p>}
            columns={[
              { key: "d", header: "Payé le", cell: (r) => formatDateOnly(r.paidOn) },
              { key: "e", header: "Prestataire", cell: (r) => r.editor?.displayName ?? r.supplierName ?? "—" },
              { key: "c", header: "Coûts couverts", cell: (r) => r.costs.join(", "), hideOnCard: true },
              { key: "a", header: "Montant", numeric: true, cell: (r) => <><Money value={r.amount} currency={r.currency as CurrencyCode} />{r.fees !== "0.00" ? <span className="block text-xs text-subtle">frais {r.fees}</span> : null}</> },
              { key: "fx", header: "Écart de change", numeric: true, hideOnCard: true, cell: (r) => (r.fxDifferenceEur === "0.00" ? "—" : <Money value={r.fxDifferenceEur} />) },
              { key: "j", header: "Justificatif", cell: (r) => (r.proofAttachmentId ? <a className="text-brand hover:underline" href={`/api/files/${r.proofAttachmentId}`}>PDF</a> : "—") },
              {
                key: "x",
                header: "",
                cell: (r) =>
                  r.status === "VOIDED" ? <StatusBadge label="Annulé" tone="danger" title={r.voidReason ?? undefined} /> : can(actor, "supplierPayments.write") ? (
                    <ConfirmAction trigger={<Button size="xs" variant="ghost">Annuler</Button>} title="Annuler ce règlement ?" description="Rectification tracée : le règlement reste visible avec le statut « annulé » ; les coûts redeviennent dus." reason="required" destructive confirmLabel="Annuler le règlement" action={voidSupplierPaymentAction.bind(null, r.id)} />
                  ) : null,
              },
            ]}
          />
        </Section>
      </div>
    );
  }

  async function Expenses() {
    const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
    const rows = await listExpenses(actor, { category: sp(params.categorie), unpaid: sp(params.impayees) === "1" });
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterBar showSearch={false} filters={[{ name: "categorie", label: "Catégorie", options: categories.map((c) => ({ value: c.id, label: c.name })) }, { name: "impayees", label: "Paiement", options: [{ value: "1", label: "Non payées" }] }]} />
          {can(actor, "expenses.write") ? <Button asChild size="sm"><Link href="/finances/charges/nouvelle"><Plus aria-hidden /> Charge</Link></Button> : null}
        </div>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Aucune charge" description="Abonnements, stockage, musique, publicité, frais bancaires…" />}
          columns={[
            { key: "l", header: "Charge", cell: (r) => <>{r.label}<span className="block text-xs text-faint">{r.category} · {RECURRENCE_LABELS[r.recurrence]}</span></> },
            { key: "p", header: "Rattachement", cell: (r) => r.periodMonth },
            { key: "d", header: "Date", cell: (r) => formatDateOnly(r.expenseDate), hideOnCard: true },
            { key: "a", header: "HT", numeric: true, cell: (r) => <Money value={r.amountNet} currency={r.currency as CurrencyCode} /> },
            { key: "e", header: "Coût EUR", numeric: true, cell: (r) => <><Money value={r.costEur} />{!r.vatRecoverable && r.vatAmount !== "0.00" ? <span className="block text-xs text-subtle">TVA non récup. incluse</span> : null}</> },
            {
              key: "s",
              header: "Paiement",
              cell: (r) =>
                r.status === "VOIDED" ? <StatusBadge label="Annulée" tone="danger" title={r.voidReason ?? undefined} /> : r.isPaid ? <StatusBadge label={`Payée ${formatDateOnly(r.paidOn)}`} tone="success" /> : can(actor, "expenses.write") ? <MarkExpensePaidButton id={r.id} today={today} /> : <StatusBadge label="Non payée" tone="warning" />,
            },
            {
              key: "x",
              header: "",
              cell: (r) => (r.status === "RECORDED" && can(actor, "expenses.write") ? <ConfirmAction trigger={<Button size="xs" variant="ghost">Annuler</Button>} title="Annuler cette charge ?" reason="required" destructive confirmLabel="Annuler" action={voidExpenseAction.bind(null, r.id)} /> : null),
            },
          ]}
        />
      </div>
    );
  }

  async function Retainers() {
    const rows = await listRetainers(actor);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">{can(actor, "retainers.write") ? <Button asChild size="sm"><Link href="/finances/forfaits/nouveau"><Plus aria-hidden /> Forfait</Link></Button> : null}</div>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finances/forfaits/${r.id}`}
          empty={<EmptyState title="Aucun forfait récurrent" description="Contrats mensuels avec quotas de vidéos et report de crédits." />}
          columns={[
            { key: "t", header: "Forfait", cell: (r) => r.title },
            { key: "c", header: "Client", cell: (r) => r.client.displayName },
            { key: "s", header: "Statut", cell: (r) => <StatusBadge {...RETAINER_STATUS[r.status]} /> },
            { key: "a", header: "Mensuel HT", numeric: true, cell: (r) => <Money value={r.amount.toFixed(2)} currency={r.currency as CurrencyCode} /> },
            { key: "q", header: "Quotas", cell: (r) => r.quotas.map((q) => `${q.quantity} ${q.videoType}`).join(", ") },
            { key: "p", header: "Dernière période", cell: (r) => (r.periods[0] ? formatDateOnly(r.periods[0].periodStart).slice(3) : "—") },
          ]}
        />
      </div>
    );
  }

  async function Legacy() {
    const rows = await listLegacyPayments(actor);
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="Paiements de l'ancien CRM">
          Le champ « devis » d&apos;origine ne prouve ni une facture émise ni un encaissement. Ces lignes sont exclues de tous les totaux tant qu&apos;elles ne sont pas qualifiées.
        </Notice>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Aucun historique importé" description="L'import Rails se lance en ligne de commande (voir Réglages › Import et historique)." />}
          columns={[
            { key: "c", header: "Client", cell: (r) => <Link className="hover:text-brand" href={`/clients/${r.client.id}`}>{r.client.displayName}</Link> },
            { key: "d", header: "« Devis » (brut)", numeric: true, cell: (r) => r.quoteAmountRaw ?? "—" },
            { key: "s", header: "Statut Rails", cell: (r) => r.legacyStatus },
            { key: "n", header: "Prochain paiement", cell: (r) => formatDateOnly(r.nextPaymentOn) },
            { key: "o", header: "Créé (Rails)", cell: (r) => formatDateTime(r.legacyCreatedAt), hideOnCard: true },
            { key: "r", header: "Rapprochement", cell: (r) => <StatusBadge {...RECONCILIATION_STATUS[r.reconciliationStatus]} /> },
            { key: "x", header: "", cell: (r) => (r.reconciliationStatus === "TO_RECONCILE" ? <LegacyQualifyButtons id={r.id} clientId={r.client.id} /> : r.qualificationNote ?? "") },
          ]}
        />
      </div>
    );
  }
}
