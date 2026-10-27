import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { VideoForm } from "@/features/production/video-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { videoFormDefaults } from "@/server/queries/form-defaults";
import { projectOptions } from "@/server/queries/options";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Modifier la vidéo") };
}

export default async function EditVideoPage(props: PageProps<"/videos/[id]/modifier">) {
  const tr = await getT();
  await requirePagePermission("videos.write");
  const { id } = await props.params;
  const [v, projects] = await Promise.all([prisma.video.findUnique({ where: { id } }), projectOptions()]);
  if (!v) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [v.reference])} />
      <VideoForm
        videoId={v.id}
        hasDeadline
        projects={projects.map((p) => ({ value: p.value, label: `${p.label} (${p.clientName})` }))}
        defaults={videoFormDefaults(v)}
      />
    </div>
  );
}
