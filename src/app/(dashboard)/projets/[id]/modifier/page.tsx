import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ProjectForm } from "@/features/production/project-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { projectFormDefaults } from "@/server/queries/form-defaults";
import { ACTIVE_VIDEO_STATUSES } from "@/server/domain/video-workflow";
import { clientOptions, staffOptions } from "@/server/queries/options";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Modifier le projet") };
}

export default async function EditProjectPage(props: PageProps<"/projets/[id]/modifier">) {
  const tr = await getT();
  await requirePagePermission("projects.write");
  const { id } = await props.params;
  const [p, clients, owners, activeVideos] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    clientOptions(),
    staffOptions(),
    prisma.video.count({ where: { projectId: id, status: { in: ACTIVE_VIDEO_STATUSES } } }),
  ]);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [p.reference])} subtitle={tr("Un changement de deadline client est consigné (ancienne et nouvelle date).")} />
      <ProjectForm
        projectId={p.id}
        clients={clients}
        owners={owners}
        templates={[]}
        activeVideos={activeVideos}
        defaults={projectFormDefaults(p)}
      />
    </div>
  );
}
