import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { convertOpportunityAction } from "@/features/prospection/actions";
import { OpportunityForm } from "@/features/prospection/opportunity-form";
import { ActivityForm } from "@/features/prospection/activity-form";
import { formatDateTime } from "@/lib/dates";
import { ACTIVITY_TYPE_LABELS, OPPORTUNITY_STAGE } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { opportunityFormDefaults } from "@/server/queries/form-defaults";
import { can } from "@/server/policies";
import { staffOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";
import { getSettings } from "@/server/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Opportunité") };
}

export default async function OpportunityPage(props: PageProps<"/prospection/[id]">) {
  const tr = await getT();
  const actor = await requirePagePermission("prospection.read");
  const { id } = await props.params;
  const [o, owners, clients, settings, today] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      include: { client: { select: { id: true, displayName: true } }, project: { select: { id: true, reference: true, title: true } }, activities: { orderBy: { occurredAt: "desc" }, include: { author: { select: { name: true } } } } },
    }),
    staffOptions(),
    prisma.client.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    getSettings(),
    agencyToday(),
  ]);
  if (!o) notFound();
  return (
    <>
      <PageHeader
        title={o.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge {...OPPORTUNITY_STAGE[o.stage]} /><Link className="hover:text-brand" href={`/clients/${o.client.id}`}>{o.client.displayName}</Link></span>}
        actions={
          o.stage === "WON" && !o.project && can(actor, "projects.write") ? (
            <ActionButton variant="default" action={convertOpportunityAction.bind(null, o.id)}>
              <FolderPlus aria-hidden /> {" "}{tr("Créer le projet")}</ActionButton>
          ) : o.project ? (
            <Link className="text-sm text-brand hover:underline" href={`/projets/${o.project.id}`}>{tr("Projet")}{" "}{o.project.reference} — {o.project.title}</Link>
          ) : null
        }
      />
      {o.stage === "WON" && !o.project ? (
        <Notice tone="info" className="mb-4">{tr("Opportunité gagnée : créez le projet. Aucune facture émise ni encaissement ne sera généré automatiquement ; la vente se saisit ensuite dans Finances.")}</Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title={tr("Détails")} className="xl:col-span-2">
          {can(actor, "prospection.write") ? (
            <OpportunityForm
              id={o.id}
              clients={clients.map((c) => ({ value: c.id, label: c.displayName }))}
              owners={owners}
              defaults={opportunityFormDefaults(o)}
            />
          ) : (
            <p className="text-sm text-subtle">{tr("Lecture seule.")}</p>
          )}
        </Section>
        <Section title={tr("Activités")} description={tr("Historisées, jamais supprimées.")}>
          {can(actor, "prospection.write") ? <ActivityForm opportunityId={o.id} today={today} /> : null}
          <ol className="mt-4 flex flex-col gap-3 text-sm">
            {o.activities.map((a) => (
              <li key={a.id}>
                <span className="text-xs text-faint">{formatDateTime(a.occurredAt, settings.timezone)} · {tr(ACTIVITY_TYPE_LABELS[a.type])}{a.author ? ` · ${a.author.name}` : ""}</span>
                <p>{a.subject}</p>
                {a.body ? <p className="whitespace-pre-wrap text-xs text-subtle">{a.body}</p> : null}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
