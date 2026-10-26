import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { cancelSalesOrderAction } from "@/features/finance/actions";
import { CancelLineDialog, ReallocateDialog } from "@/features/finance/finance-dialogs";
import { formatDateOnly } from "@/lib/dates";
import { VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { dec, sum, type CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { getSalesOrder } from "@/server/queries/finance";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Vente") };
}

export default async function SalePage(props: PageProps<"/finances/ventes/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("sales.read");
  const { id } = await props.params;
  const [{ order: o, videos }, today] = await Promise.all([getSalesOrder(actor, id), agencyToday()]);
  const cur = o.currency as CurrencyCode;
  const total = sum(o.lines.map((l) => dec(l.netAmount).minus(dec(l.cancelledAmount))));
  const canWrite = can(actor, "sales.write");
  return (
    <>
      <PageHeader
        title={<><span className="mr-2 text-base font-semibold text-subtle">{o.reference}</span>{o.title}</>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge label={o.status === "ACCEPTED" ? tr("Acceptée") : tr("Annulée")} tone={o.status === "ACCEPTED" ? "success" : "danger"} /><Link href={`/clients/${o.client.id}`} className="hover:text-brand">{o.client.displayName}</Link>{o.project ? <Link href={`/projets/${o.project.id}`} className="hover:text-brand">· {o.project.reference}</Link> : null}<span>{tr("· acceptée le")}{" "}{formatDateOnly(o.acceptedOn)}</span></span>}
        actions={
          canWrite && o.status === "ACCEPTED" ? (
            <>
              {can(actor, "invoices.write") ? <Button asChild size="sm" variant="outline"><Link href={`/finances/factures/nouvelle?vente=${o.id}`}>{tr("Enregistrer une facture")}</Link></Button> : null}
              <ConfirmAction trigger={<Button size="sm" variant="ghost">{tr("Annuler la vente")}</Button>} title={tr("Annuler toute la vente ?")} description={tr("Chaque ligne est annulée à la date du jour (réduction des ventes signées). Impossible si une facture émise la référence : émettez d'abord un avoir.")} reason="required" destructive confirmLabel={tr("Annuler la vente")} action={cancelSalesOrderAction.bind(null, o.id)} />
            </>
          ) : null
        }
      />
      {o.retainerPeriod ? <Notice tone="info" className="mb-4">{tr("Vente générée par un forfait récurrent (période")}{" "}{formatDateOnly(o.retainerPeriod.periodStart).slice(3)}).</Notice> : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {o.lines.map((l) => {
            const net = dec(l.netAmount).minus(dec(l.cancelledAmount));
            const allocated = sum(l.allocations.map((a) => dec(a.amount)));
            return (
              <Section
                key={l.id}
                title={l.description}
                description={`${l.quantity.toFixed()} × ${l.unitPrice.toFixed(2)} ${o.currency}${dec(l.discountAmount).gt(0) ? ` − remise ${l.discountAmount.toFixed(2)}` : ""}${l.videoType ? ` · ${tr(VIDEO_TYPE_LABELS[l.videoType])}` : ""}${l.autoAllocate ? ` · ${tr("forfait réparti automatiquement")}` : ""}`}
                actions={canWrite && o.status === "ACCEPTED" ? <>{net.gt(0) ? <ReallocateDialog lineId={l.id} method={l.allocationMethod} net={net.toFixed(2)} videos={videos} autoAllocate={l.autoAllocate} hasProject={!!o.project} current={l.allocations.map((a) => ({ videoId: a.videoId, weight: a.weight?.toFixed() ?? null, amount: a.amount.toFixed(2) }))} /> : null}{net.gt(0) ? <CancelLineDialog lineId={l.id} max={net.toFixed(2)} today={today} /> : null}</> : null}
              >
                <DefinitionList
                  items={[
                    { label: tr("Net HT figé"), value: <Money value={l.netAmount.toFixed(2)} currency={cur} /> },
                    { label: tr("Annulé"), value: dec(l.cancelledAmount).gt(0) ? <span className="text-danger"><Money value={l.cancelledAmount.toFixed(2)} currency={cur} /> {" "}{tr("le")}{" "}{formatDateOnly(l.cancelledOn)} — {l.cancelReason}</span> : "—" },
                    { label: tr("Retouches incluses"), value: l.includedRevisions ?? "—" },
                    { label: tr("Factures liées"), value: l.invoiceLines.length ? l.invoiceLines.map((il) => <Link key={il.id} href={`/finances/factures/${il.invoice.id}`} className="mr-2 text-brand hover:underline">{il.invoice.number ?? tr("brouillon")}</Link>) : "—" },
                  ]}
                />
                <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">{tr("Répartition analytique interne")}</h3>
                {l.allocations.length === 0 ? (
                  <p className="text-sm text-warning">{tr("Non répartie : le CA de gestion livré ne comptera pas cette ligne.")}</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {l.allocations.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <Link href={`/videos/${a.video.id}`} className="hover:text-brand">{a.video.reference} — {a.video.title}</Link>
                        <span className="flex items-center gap-2"><StatusBadge {...VIDEO_STATUS[a.video.status]} />{a.weight ? <span className="text-xs text-subtle">{tr("poids")}{" "}{a.weight.toFixed()}</span> : null}<Money value={a.amount.toFixed(2)} currency={cur} /></span>
                      </li>
                    ))}
                    <li className="flex justify-between py-1.5 text-xs text-subtle"><span>{tr("Total alloué / net restant")}</span><span className="num">{allocated.toFixed(2)} / {net.toFixed(2)}</span></li>
                  </ul>
                )}
              </Section>
            );
          })}
        </div>
        <Section title={tr("Synthèse")}>
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: tr("Total net (après annulations)"), value: <span className="text-lg font-bold"><Money value={total.toFixed(2)} currency={cur} /></span> },
              { label: tr("Taux de change figé"), value: o.currency === "EUR" ? "—" : `${o.fxUnitsPerEur.toFixed()} ${o.currency}/€ (${o.fxSource === "MANUAL" ? "manuel" : "référence"}, ${formatDateOnly(o.fxRateDate)})` },
              { label: tr("Notes"), value: o.notes ?? "—" },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
