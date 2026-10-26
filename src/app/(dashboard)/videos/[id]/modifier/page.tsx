import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { VideoForm } from "@/features/production/video-form";
import { formatDurationSeconds, toDateOnlyString } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
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
  const d = (x: Date | null) => (x ? toDateOnlyString(x) : "");
  const dur = (s: number | null) => (s === null ? "" : formatDurationSeconds(s));
  const s = (x: string | null) => x ?? "";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [v.reference])} />
      <VideoForm
        videoId={v.id}
        hasDeadline
        projects={projects.map((p) => ({ value: p.value, label: `${p.label} (${p.clientName})` }))}
        defaults={{
          projectId: v.projectId, title: v.title, type: v.type, format: s(v.format), ratio: s(v.ratio), language: s(v.language),
          rushDuration: dur(v.rushDurationSec), expectedDuration: dur(v.expectedDurationSec), finalDuration: dur(v.finalDurationSec),
          brief: s(v.brief), objectives: s(v.objectives), audience: s(v.audience), references: s(v.references), subtitleStyle: s(v.subtitleStyle),
          brandConstraints: s(v.brandConstraints), exportInstructions: s(v.exportInstructions), priority: v.priority,
          plannedStartOn: d(v.plannedStartOn), internalDeadline: d(v.internalDeadline), clientDeadline: d(v.clientDeadline),
          includedRevisionRounds: v.includedRevisionRounds?.toString() ?? "", estimatedHours: v.estimatedHours?.toFixed() ?? "", deadlineReason: "", version: v.version,
        }}
      />
    </div>
  );
}
