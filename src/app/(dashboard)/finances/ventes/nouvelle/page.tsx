import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SalesOrderForm } from "@/features/finance/sales-order-form";
import { emptyLine } from "@/features/finance/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { clientOptions, projectOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function NewSalePage(props: PageProps<"/finances/ventes/nouvelle">) {
  await requirePagePermission("sales.write");
  const params = await props.searchParams;
  const [clients, projects, videos, catalog, today] = await Promise.all([
    clientOptions(),
    projectOptions(),
    prisma.video.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: [{ projectId: "asc" }, { position: "asc" }], select: { id: true, reference: true, title: true, projectId: true } }),
    prisma.serviceCatalogItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    agencyToday(),
  ]);
  const projectId = typeof params.projet === "string" ? params.projet : "";
  const project = projects.find((p) => p.value === projectId);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nouvelle vente acceptée" subtitle="Source unique des « Ventes signées ». La facture se saisit séparément et ne s'ajoute jamais à la vente." />
      <SalesOrderForm
        clients={clients}
        projects={projects}
        videos={videos}
        catalog={catalog.map((c) => ({ id: c.id, name: c.name, unitPrice: c.unitPrice.toFixed(2), currency: c.currency, videoType: c.videoType, includedRevisions: c.includedRevisions }))}
        defaults={{
          clientId: project?.clientId ?? (typeof params.client === "string" ? params.client : ""),
          projectId, opportunityId: typeof params.opportunite === "string" ? params.opportunite : "",
          title: project ? project.label.split(" — ").slice(1).join(" — ") : "", acceptedOn: today, currency: "EUR", manualFxRate: "", notes: "", lines: [emptyLine()],
        }}
      />
    </div>
  );
}
