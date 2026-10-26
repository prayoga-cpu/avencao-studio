import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/app/action-button";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { DefinitionList, Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { setRetainerStatusAction } from "@/features/finance/actions";
import { GenerateRetainerButton, UseCreditForm } from "@/features/finance/finance-dialogs";
import { formatDateOnly } from "@/lib/dates";
import { CARRY_OVER_LABELS, RETAINER_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import type { VideoType } from "@/generated/prisma/enums";
import { requirePagePermission } from "@/server/auth/session";
import { remainingCredits, type CreditMap, type PeriodCredits } from "@/server/domain/retainer-credits";
import { can } from "@/server/policies";
import { getRetainer } from "@/server/queries/finance";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Forfait") };
}

export default async function RetainerPage(props: PageProps<"/finances/forfaits/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("retainers.read");
  const { id } = await props.params;
  const [{ retainer: r, videos }, today] = await Promise.all([getRetainer(actor, id), agencyToday()]);
  const canWrite = can(actor, "retainers.write");
  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge {...RETAINER_STATUS[r.status]} /><Link className="hover:text-brand" href={`/clients/${r.client.id}`}>{r.client.displayName}</Link></span>}
        actions={
          canWrite ? (
            <>
              {r.status === "ACTIVE" ? <GenerateRetainerButton retainerId={r.id} month={today} /> : null}
              {r.status === "ACTIVE" ? <ActionButton size="sm" action={setRetainerStatusAction.bind(null, r.id, "PAUSED")}>{tr("Mettre en pause")}</ActionButton> : <ActionButton size="sm" action={setRetainerStatusAction.bind(null, r.id, "ACTIVE")}>{tr("Réactiver")}</ActionButton>}
              {r.status !== "ENDED" ? <ActionButton size="sm" variant="ghost" action={setRetainerStatusAction.bind(null, r.id, "ENDED")}>{tr("Terminer")}</ActionButton> : null}
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title={tr("Contrat")}>
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: tr("Montant mensuel HT"), value: <Money value={r.amount.toFixed(2)} currency={r.currency as CurrencyCode} /> },
              { label: tr("Effet"), value: `${formatDateOnly(r.startsOn)} → ${r.endsOn ? formatDateOnly(r.endsOn) : tr("sans fin")}` },
              { label: tr("Quotas"), value: r.quotas.map((q) => `${q.quantity} × ${tr(VIDEO_TYPE_LABELS[q.videoType])}`).join(", ") },
              { label: tr("Report"), value: tr(CARRY_OVER_LABELS[r.carryOver]) },
              { label: tr("Facture brouillon"), value: r.createDraftInvoice ? tr("Oui (TVA {0} %)", [r.vatRate?.toFixed() ?? "0"]) : "Non" },
              { label: tr("Notes"), value: r.notes ?? "—" },
            ]}
          />
          <p className="mt-3 text-xs text-faint">{tr("La génération automatique tourne chaque jour via le worker (voir docs/jobs.md) ; ce bouton permet de la lancer à la main.")}</p>
        </Section>
        <div className="flex flex-col gap-4 xl:col-span-2">
          {r.periods.length === 0 ? <p className="text-sm text-subtle">{tr("Aucune période générée.")}</p> : null}
          {r.periods.map((p) => {
            const credits = p.credits as unknown as PeriodCredits;
            const used: CreditMap = {};
            for (const u of p.uses) used[u.videoType] = (used[u.videoType] ?? 0) + 1;
            const rest = remainingCredits(credits, used);
            return (
              <Section key={p.id} title={tr("Période {0}", [formatDateOnly(p.periodStart).slice(3)])} actions={canWrite ? <UseCreditForm periodId={p.id} videos={videos} /> : null}>
                <div className="mb-3 flex flex-wrap gap-2 text-sm">
                  {(Object.keys(rest) as VideoType[]).map((t) => (
                    <StatusBadge key={t} tone={(rest[t] ?? 0) < 0 ? "danger" : "info"} label={tr("{0} : {1} restant(s) sur {2}{3}", [tr(VIDEO_TYPE_LABELS[t]), rest[t], (credits.base[t] ?? 0) + (credits.carried[t] ?? 0), credits.carried[t] ? tr(" (dont {0} reporté·s)", [credits.carried[t]]) : ""])} />
                  ))}
                </div>
                <p className="text-xs text-subtle">
                  {tr("Vente :")}{" "}{p.salesOrder ? <Link className="text-brand hover:underline" href={`/finances/ventes/${p.salesOrder.id}`}>{p.salesOrder.reference}</Link> : "—"} {" "}{tr("· Facture :")}{" "}{p.invoice ? <Link className="text-brand hover:underline" href={`/finances/factures/${p.invoice.id}`}>{p.invoice.number ?? tr("brouillon")}</Link> : "—"}
                </p>
                {p.uses.length ? <ul className="mt-2 text-sm">{p.uses.map((u) => <li key={u.id}><Link className="hover:text-brand" href={`/videos/${u.video.id}`}>{u.video.reference} — {u.video.title}</Link></li>)}</ul> : null}
              </Section>
            );
          })}
        </div>
      </div>
    </>
  );
}
