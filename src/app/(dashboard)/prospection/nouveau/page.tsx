import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { OpportunityForm } from "@/features/prospection/opportunity-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { staffOptions } from "@/server/queries/options";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Nouvelle opportunité") };
}

export default async function NewOpportunityPage(props: PageProps<"/prospection/nouveau">) {
  const tr = await getT();
  const actor = await requirePagePermission("prospection.write");
  const params = await props.searchParams;
  const [clients, owners] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    staffOptions(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Nouvelle opportunité")} subtitle={tr("Un client peut avoir plusieurs opportunités en parallèle.")} />
      <OpportunityForm
        clients={clients.map((c) => ({ value: c.id, label: c.displayName }))}
        owners={owners}
        defaults={{
          clientId: typeof params.client === "string" ? params.client : "", title: "", stage: "NEW", services: [], servicesNote: "", estimatedAmount: "",
          currency: "EUR", probability: "", expectedCloseOn: "", nextAction: "", followUpOn: "", lostReason: "", ownerId: actor.id,
        }}
      />
    </div>
  );
}
