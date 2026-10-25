import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { VideoForm } from "@/features/production/video-form";
import { emptyVideo } from "@/features/production/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { projectOptions } from "@/server/queries/options";

export const metadata: Metadata = { title: "Nouvelle vidéo" };

export default async function NewVideoPage(props: PageProps<"/videos/nouvelle">) {
  await requirePagePermission("videos.write");
  const params = await props.searchParams;
  const projects = await projectOptions();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouvelle vidéo" subtitle="Le nom suggéré suit « ID — Nom — Deadline » ; la référence stable est attribuée automatiquement." />
      <VideoForm projects={projects.map((p) => ({ value: p.value, label: `${p.label} (${p.clientName})` }))} defaults={emptyVideo(typeof params.projet === "string" ? params.projet : "")} />
    </div>
  );
}
