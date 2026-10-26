import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { setCostStageWithReasonAction } from "@/features/finance/actions";
import { CostAllocationEditor } from "@/features/finance/finance-dialogs";
import { CostAmountDialog } from "@/features/production/video-panels";
import { formatDateOnly } from "@/lib/dates";
import { COST_KIND_LABELS, COST_STAGE } from "@/lib/labels";
import { dec, sum, type CurrencyCode } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { getDirectCost } from "@/server/queries/finance";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Coût direct") };
}

export default async function CostPage(props: PageProps<"/finances/couts/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("costs.read");
  const { id } = await props.params;
  const { cost: c, videos } = await getDirectCost(actor, id);
  const cur = c.currency as CurrencyCode;
  const paid = sum(c.paymentAllocations.filter((p) => !p.reversedAt && p.payment.status === "RECORDED").map((p) => dec(p.amount)));
  const canWrite = can(actor, "costs.write");
  const stageButton = (stage: "COMMITTED" | "VALIDATED" | "CANCELLED", label: string, reason: "none" | "required" = "none") => (
    <ConfirmAction key={stage} trigger={<Button size="sm" variant={stage === "CANCELLED" ? "ghost" : "outline"}>{tr(label)}</Button>} title={label} reason={reason} destructive={stage === "CANCELLED"} confirmLabel={label} action={setCostStageWithReasonAction.bind(null, c.id, stage)} />
  );
  return (
    <>
      <PageHeader
        title={tr(c.label)}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge {...COST_STAGE[c.stage]} /><span>{tr(COST_KIND_LABELS[c.kind])}</span>{c.editor ? <Link className="hover:text-brand" href={`/monteurs/${c.editor.id}`}>· {c.editor.displayName}</Link> : null}</span>}
        actions={
          canWrite && c.stage !== "CANCELLED" ? (
            <>
              {paid.isZero() ? <CostAmountDialog costId={c.id} currency={c.currency} current={c.amount?.toFixed(2) ?? null} label={tr(c.label)} validated={c.stage === "VALIDATED"} /> : null}
              {c.stage === "ESTIMATED" ? stageButton("COMMITTED", "Marquer engagé") : null}
              {c.stage !== "VALIDATED" && can(actor, "costs.validate") ? stageButton("VALIDATED", "Valider (payable)") : null}
              {paid.isZero() ? stageButton("CANCELLED", "Annuler le coût", "required") : null}
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title={tr("Montants")} className="xl:col-span-1">
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: tr("Montant"), value: <span className="text-lg font-bold"><Money value={c.amount?.toFixed(2) ?? null} currency={cur} /></span> },
              { label: tr("En EUR (taux figé)"), value: c.amountEur ? <>{c.amountEur.toFixed(2)} €{c.currency !== "EUR" ? ` · ${c.fxUnitsPerEur?.toFixed()} ${c.currency}/€ (${c.fxSource === "MANUAL" ? "manuel" : "référence"}, ${formatDateOnly(c.fxRateDate)})` : ""}</> : "—" },
              { label: tr("Payé"), value: <Money value={paid.toFixed(2)} currency={cur} /> },
              { label: tr("Date d'engagement"), value: formatDateOnly(c.incurredOn) },
              { label: tr("Période"), value: c.periodStart ? `${formatDateOnly(c.periodStart)} → ${formatDateOnly(c.periodEnd)}` : "—" },
              { label: tr("Rattachement"), value: c.video ? <Link className="text-brand hover:underline" href={`/videos/${c.video.id}`}>{c.video.reference} — {c.video.title}</Link> : c.project ? <Link className="text-brand hover:underline" href={`/projets/${c.project.id}`}>{c.project.reference} — {c.project.title}</Link> : "—" },
              { label: tr("Annulation"), value: c.cancelReason ?? "—" },
              { label: tr("Notes"), value: c.notes ?? "—" },
            ]}
          />
        </Section>
        <div className="flex flex-col gap-5 xl:col-span-2">
          {!c.videoId && c.amount ? (
            <Section title={tr("Allocation analytique")} description={c.kind === "ENVELOPE" ? tr("L'enveloppe est la dépense ; les allocations la répartissent entre vidéos sans s'y ajouter.") : tr("Répartition de l'achat entre les vidéos du projet.")}>
              {canWrite ? (
                <CostAllocationEditor costId={c.id} amount={c.amount.toFixed(2)} currency={c.currency} videos={videos} current={c.allocations.map((a) => ({ videoId: a.videoId, amount: a.amount.toFixed(2) }))} />
              ) : (
                <ul className="text-sm">{c.allocations.map((a) => <li key={a.id}>{a.video.reference} — <Money value={a.amount.toFixed(2)} currency={cur} /></li>)}</ul>
              )}
            </Section>
          ) : null}
          <Section title={tr("Règlements")}>
            {c.paymentAllocations.length === 0 ? <p className="text-sm text-subtle">{tr("Aucun règlement.")}</p> : (
              <ul className="divide-y divide-border text-sm">
                {c.paymentAllocations.map((p) => (
                  <li key={p.id} className={`flex justify-between gap-2 py-1.5 ${p.reversedAt || p.payment.status === "VOIDED" ? "opacity-50" : ""}`}>
                    <span>{formatDateOnly(p.payment.paidOn)}{p.payment.reference ? ` · ${p.payment.reference}` : ""}{p.reversedAt ? tr(" · annulé") : ""}</span>
                    <span><Money value={p.amount.toFixed(2)} currency={cur} />{!dec(p.fxDifferenceEur).isZero() ? <span className="ml-2 text-xs text-subtle">{tr("écart de change")}{" "}{p.fxDifferenceEur.toFixed(2)} €</span> : null}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
