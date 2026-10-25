import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { DirectCostForm } from "@/features/finance/movement-forms";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { editorOptions, projectOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";

export const metadata: Metadata = { title: "Nouveau coût direct" };

export default async function NewCostPage(props: PageProps<"/finances/couts/nouveau">) {
  await requirePagePermission("costs.write");
  const params = await props.searchParams;
  const [editors, projects, videos, today] = await Promise.all([
    editorOptions(),
    projectOptions(),
    prisma.video.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { reference: "asc" }, select: { id: true, reference: true, title: true, projectId: true } }),
    agencyToday(),
  ]);
  const videoId = typeof params.video === "string" ? params.video : "";
  const video = videos.find((v) => v.id === videoId);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouveau coût direct" subtitle="Achat, coût additionnel ou enveloppe mensuelle d'un prestataire." />
      <DirectCostForm
        editors={editors}
        projects={projects.map((p) => ({ value: p.value, label: p.label }))}
        videos={videos.map((v) => ({ value: v.id, label: `${v.reference} — ${v.title}`, projectId: v.projectId }))}
        defaults={{ kind: "PURCHASE", label: "", editorId: "", supplierName: "", projectId: video?.projectId ?? "", videoId, amount: "", currency: "EUR", manualFxRate: "", incurredOn: today, stage: "COMMITTED", periodMonth: today.slice(0, 7), nonRecoverableVat: "", notes: "" }}
      />
    </div>
  );
}
