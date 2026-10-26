import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { PipelineBoard } from "@/features/prospection/pipeline-board";
import { toDateOnlyString } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can } from "@/server/policies";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Prospection") };
}

export default async function ProspectionPage() {
  const tr = await getT();
  const actor = await requirePagePermission("prospection.read");
  const today = await agencyToday();
  const opps = await prisma.opportunity.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    include: { client: { select: { displayName: true } } },
  });
  const open = opps.filter((o) => o.stage !== "WON" && o.stage !== "LOST");
  // Pipeline pondéré : montant × probabilité, en EUR uniquement (prévisionnel, jamais du CA réalisé).
  const eurOpen = open.filter((o) => o.currency === "EUR" && o.estimatedAmount);
  const weighted = sum(eurOpen.map((o) => dec(o.estimatedAmount).mul(dec(o.probability ?? 0)).div(100)));
  const gross = sum(eurOpen.map((o) => dec(o.estimatedAmount)));
  const followUps = open.filter((o) => o.followUpOn && toDateOnlyString(o.followUpOn) <= today).length;
  return (
    <>
      <PageHeader
        title={tr("Prospection")}
        subtitle={tr("Pipeline commercial, distinct du statut client. Glissez une carte pour changer d'étape.")}
        actions={can(actor, "prospection.write") ? <Button asChild><Link href="/prospection/nouveau"><Plus aria-hidden /> {" "}{tr("Nouvelle opportunité")}</Link></Button> : null}
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-border bg-surface p-4">
          <p className="text-xs uppercase text-subtle">{tr("Pipeline ouvert (EUR)")}</p>
          <p className="mt-1 text-xl font-bold"><Money value={gross.toFixed(2)} /></p>
          <p className="text-xs text-faint">{open.length} {" "}{tr("opportunité(s) ouvertes")}</p>
        </div>
        <div className="rounded-xl border border-brand-border bg-surface p-4">
          <p className="text-xs uppercase text-subtle">{tr("Pipeline pondéré — prévisionnel")}</p>
          <p className="mt-1 text-xl font-bold"><Money value={weighted.toFixed(2)} /></p>
          <p className="text-xs text-faint">{tr("Montant × probabilité. Ce n'est pas du chiffre d'affaires réalisé.")}</p>
        </div>
        <div className="rounded-xl border border-brand-border bg-surface p-4">
          <p className="text-xs uppercase text-subtle">{tr("Relances dues")}</p>
          <p className={`mt-1 text-xl font-bold ${followUps ? "text-warning" : ""}`}>{followUps}</p>
          <p className="text-xs text-faint">{tr("Échéance de relance atteinte")}</p>
        </div>
      </div>
      {open.some((o) => o.currency !== "EUR") ? <Notice tone="info" className="mb-4">{tr("Les opportunités en IDR ou USD ne sont pas incluses dans les totaux EUR ci-dessus.")}</Notice> : null}
      {opps.length === 0 ? (
        <EmptyState title={tr("Aucune opportunité")} description={tr("Créez une opportunité depuis une fiche client ou ici.")} />
      ) : (
        <PipelineBoard
          items={opps.map((o) => ({
            id: o.id,
            title: o.title,
            client: o.client.displayName,
            stage: o.stage,
            amount: o.estimatedAmount?.toFixed(2) ?? null,
            currency: o.currency,
            probability: o.probability?.toFixed() ?? null,
            followUpOn: o.followUpOn ? toDateOnlyString(o.followUpOn) : null,
            overdueFollowUp: !!o.followUpOn && toDateOnlyString(o.followUpOn) <= today && o.stage !== "WON" && o.stage !== "LOST",
          }))}
        />
      )}
    </>
  );
}
