import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { cancelDraftInvoiceAction, reverseAllocationAction } from "@/features/finance/actions";
import { AllocatePaymentDialog, CreditNoteDialog, IssueInvoiceDialog, RefundDialog } from "@/features/finance/finance-dialogs";
import { AttachmentsPanel } from "@/features/shared/attachments-panel";
import { formatDateOnly, toDateOnlyString } from "@/lib/dates";
import { INVOICE_KIND_LABELS, INVOICE_PAYMENT_STATE, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { dec, sum, type CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { getInvoice } from "@/server/queries/finance";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Facture") };
}

export default async function InvoicePage(props: PageProps<"/finances/factures/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("invoices.read");
  const { id } = await props.params;
  const [{ invoice: inv, balance, pdf, unallocatedPayments }, today, settings] = await Promise.all([getInvoice(actor, id), agencyToday(), getSettings()]);
  const cur = inv.currency as CurrencyCode;
  const canWrite = can(actor, "invoices.write");
  const canPay = can(actor, "payments.write");
  const defaultVat = inv.lines[0]?.vatRate.toFixed() ?? "0";
  return (
    <>
      <PageHeader
        title={inv.number ? tr("Facture {0}", [inv.number]) : tr("Facture (brouillon)")}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...INVOICE_PAYMENT_STATE[balance.state]} />
            {balance.overdue ? <StatusBadge label={tr("En retard ({0} j)", [balance.daysOverdue])} tone="danger" /> : null}
            <span>{tr(INVOICE_KIND_LABELS[inv.kind])}</span>
            <Link className="hover:text-brand" href={`/clients/${inv.client.id}`}>· {inv.client.displayName}</Link>
            {inv.project ? <Link className="hover:text-brand" href={`/projets/${inv.project.id}`}>· {inv.project.reference}</Link> : null}
          </span>
        }
        actions={
          <>
            {inv.status === "DRAFT" && canWrite ? (
              <>
                <Button asChild size="sm" variant="outline"><Link href={`/finances/factures/${inv.id}/modifier`}><Pencil aria-hidden /> {" "}{tr("Modifier")}</Link></Button>
                <IssueInvoiceDialog invoiceId={inv.id} today={today} number={inv.number ?? ""} issueDate={inv.issueDate ? toDateOnlyString(inv.issueDate) : ""} dueDate={inv.dueDate ? toDateOnlyString(inv.dueDate) : ""} />
                <ConfirmAction trigger={<Button size="sm" variant="ghost">{tr("Annuler le brouillon")}</Button>} title={tr("Annuler ce brouillon ?")} reason="optional" destructive confirmLabel={tr("Annuler")} action={cancelDraftInvoiceAction.bind(null, inv.id)} />
              </>
            ) : null}
            {inv.status === "ISSUED" && canWrite ? <CreditNoteDialog invoiceId={inv.id} today={today} defaultVat={defaultVat} /> : null}
            {inv.status === "ISSUED" && canPay && balance.balance.gt(0) ? (
              <>
                <AllocatePaymentDialog invoiceId={inv.id} payments={unallocatedPayments} balance={balance.balance.toFixed(2)} />
                <Button asChild size="sm"><Link href={`/finances/encaissements/nouveau?client=${inv.client.id}&facture=${inv.id}`}>{tr("Enregistrer un encaissement")}</Link></Button>
              </>
            ) : null}
          </>
        }
      />
      {inv.status === "DRAFT" ? <Notice tone="info" className="mb-4">{tr("Brouillon : exclu du CA facturé tant qu'il n'est pas marqué émis.")}</Notice> : null}
      {balance.overpaid.gt(0) ? <Notice tone="warning" className="mb-4">{tr("Trop-perçu de")}{" "}<Money value={balance.overpaid.toFixed(2)} currency={cur} /> {" "}{tr(": remboursez-le via l'avoir concerné ou conservez-le en crédit client.")}</Notice> : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section title={tr("Lignes")}>
            <div className="overflow-x-auto av-scroll">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-subtle">
                    <th className="py-2">{tr("Description")}</th><th className="py-2 text-right">{tr("Qté")}</th><th className="py-2 text-right">{tr("PU HT")}</th><th className="py-2 text-right">{tr("TVA")}</th><th className="py-2 text-right">{tr("HT")}</th><th className="py-2 text-right">{tr("TTC")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id} className="border-b border-white/5">
                      <td className="py-2">{l.description}{l.deductsInvoice ? <span className="block text-xs text-warning">{tr("Déduction de l'acompte")}{" "}{l.deductsInvoice.number}</span> : null}</td>
                      <td className="num py-2 text-right">{l.quantity.toFixed()}</td>
                      <td className="py-2 text-right"><Money value={l.unitPrice.toFixed(2)} currency={cur} /></td>
                      <td className="num py-2 text-right">{l.vatRate.toFixed()} %</td>
                      <td className="py-2 text-right"><Money value={l.netAmount.toFixed(2)} currency={cur} /></td>
                      <td className="py-2 text-right"><Money value={l.grossAmount.toFixed(2)} currency={cur} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4} className="pt-3 text-right text-subtle">{tr("Total HT")}</td><td colSpan={2} className="pt-3 text-right font-semibold"><Money value={inv.totalNet.toFixed(2)} currency={cur} /></td></tr>
                  <tr><td colSpan={4} className="text-right text-subtle">{tr("TVA")}</td><td colSpan={2} className="text-right"><Money value={inv.totalVat.toFixed(2)} currency={cur} /></td></tr>
                  <tr><td colSpan={4} className="text-right text-subtle">{tr("Total TTC")}</td><td colSpan={2} className="text-right text-lg font-bold"><Money value={inv.totalGross.toFixed(2)} currency={cur} /></td></tr>
                </tfoot>
              </table>
            </div>
          </Section>
          <Section title={tr("Encaissements affectés")} description={tr("Plusieurs paiements possibles ; un paiement peut couvrir plusieurs factures.")}>
            {inv.allocations.length === 0 ? <p className="text-sm text-subtle">{tr("Aucun encaissement affecté.")}</p> : (
              <ul className="divide-y divide-border text-sm">
                {inv.allocations.map((a) => (
                  <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${a.reversedAt ? "opacity-50" : ""}`}>
                    <span>{formatDateOnly(a.payment.receivedOn)} · {tr(PAYMENT_METHOD_LABELS[a.payment.method])}{a.payment.reference ? ` · ${a.payment.reference}` : ""}{a.reversedAt ? tr(" · affectation annulée ({0})", [a.reverseReason]) : ""}{a.payment.status === "VOIDED" ? tr(" · encaissement annulé") : ""}</span>
                    <span className="flex items-center gap-2">
                      <Money value={a.amount.toFixed(2)} currency={cur} />
                      {!a.reversedAt && canPay ? <ConfirmAction trigger={<Button size="xs" variant="ghost">{tr("Annuler l'affectation")}</Button>} title={tr("Annuler cette affectation ?")} description={tr("Le paiement redevient disponible ; l'opération est tracée.")} reason="required" confirmLabel={tr("Annuler l'affectation")} action={reverseAllocationAction.bind(null, a.id)} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={tr("Avoirs")}>
            {inv.creditNotes.length === 0 ? <p className="text-sm text-subtle">{tr("Aucun avoir.")}</p> : (
              <ul className="divide-y divide-border text-sm">
                {inv.creditNotes.map((c) => {
                  const refunded = sum(c.refunds.map((r) => dec(r.amount)));
                  const refundable = dec(c.totalGross).minus(refunded);
                  const max = refundable.lt(balance.overpaid) ? refundable : balance.overpaid;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{c.number ?? tr("Avoir")} · {formatDateOnly(c.issueDate)} · {c.reason}{refunded.gt(0) ? tr(" · remboursé {0}", [refunded.toFixed(2)]) : ""}</span>
                      <span className="flex items-center gap-2">
                        <Money value={`-${c.totalGross.toFixed(2)}`} currency={cur} />
                        {canPay && max.gt(0) ? <RefundDialog creditNoteId={c.id} today={today} max={max.toFixed(2)} currency={inv.currency} label={tr("Rembourser")} /> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          <Section title={tr("Solde")}>
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: tr("Total TTC"), value: <Money value={balance.totalGross.toFixed(2)} currency={cur} /> },
                { label: tr("Avoirs"), value: <Money value={balance.creditedGross.toFixed(2)} currency={cur} /> },
                { label: tr("Encaissé (affecté)"), value: <Money value={balance.allocated.toFixed(2)} currency={cur} /> },
                { label: tr("Remboursé sur avoirs"), value: <Money value={balance.refundedOnCredits.toFixed(2)} currency={cur} /> },
                { label: tr("Reste à encaisser"), value: <span className="text-lg font-bold"><Money value={balance.balance.gt(0) ? balance.balance.toFixed(2) : "0.00"} currency={cur} /></span> },
              ]}
            />
          </Section>
          <Section title={tr("Document")}>
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: tr("Émise le"), value: formatDateOnly(inv.issueDate) },
                { label: tr("Échéance"), value: formatDateOnly(inv.dueDate) },
                { label: tr("Référence externe"), value: inv.externalRef ?? "—" },
                { label: tr("Vente liée"), value: inv.salesOrder ? <Link className="text-brand hover:underline" href={`/finances/ventes/${inv.salesOrder.id}`}>{inv.salesOrder.reference}</Link> : "—" },
                { label: tr("HT en EUR (taux figé)"), value: <>{inv.totalNetEur.toFixed(2)} €{inv.currency !== "EUR" ? ` · ${inv.fxUnitsPerEur.toFixed()} ${inv.currency}/€ (${inv.fxSource === "MANUAL" ? "manuel" : "référence"})` : ""}</> },
                { label: tr("Acompte déduit par"), value: inv.deductedBy.length ? inv.deductedBy.map((l) => <Link key={l.id} className="mr-2 text-brand hover:underline" href={`/finances/factures/${l.invoice.id}`}>{l.invoice.number ?? tr("brouillon")}</Link>) : "—" },
                { label: tr("Notes"), value: inv.notes ?? "—" },
              ]}
            />
          </Section>
          <Section title={tr("PDF de la facture")}>
            <AttachmentsPanel items={pdf ? [pdf] : []} ownerType="INVOICE" ownerId={inv.id} canUpload={canWrite} timezone={settings.timezone} hint={tr("PDF émis par votre outil de facturation.")} />
          </Section>
        </div>
      </div>
    </>
  );
}
