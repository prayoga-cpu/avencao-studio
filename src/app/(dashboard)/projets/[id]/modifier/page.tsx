import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/features/production/project-form";
import { toDateOnlyString } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { clientOptions, staffOptions } from "@/server/queries/options";

export const metadata: Metadata = { title: "Modifier le projet" };

export default async function EditProjectPage(props: PageProps<"/projets/[id]/modifier">) {
  await requirePagePermission("projects.write");
  const { id } = await props.params;
  const [p, clients, owners] = await Promise.all([prisma.project.findUnique({ where: { id } }), clientOptions(), staffOptions()]);
  if (!p) notFound();
  const d = (v: Date | null) => (v ? toDateOnlyString(v) : "");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Modifier — ${p.reference}`} subtitle="Un changement de deadline client est consigné (ancienne et nouvelle date)." />
      <ProjectForm
        projectId={p.id}
        clients={clients}
        owners={owners}
        templates={[]}
        defaults={{
          clientId: p.clientId, title: p.title, description: p.description ?? "", ownerId: p.ownerId ?? "", startOn: d(p.startOn), clientDeadline: d(p.clientDeadline),
          status: p.status, priority: p.priority, driveUrl: p.driveUrl ?? "", otherLinks: p.otherLinks ?? "",
          includedRevisionRounds: p.includedRevisionRounds?.toString() ?? "", revisionRoundDefinition: p.revisionRoundDefinition ?? "",
          productionErrorPolicy: p.productionErrorPolicy ?? "", templateId: "", videoCount: "", version: p.version,
        }}
      />
    </div>
  );
}
