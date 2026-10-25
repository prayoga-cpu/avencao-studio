import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { EditorForm } from "@/features/editors/editor-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can } from "@/server/policies";

export const metadata: Metadata = { title: "Modifier le prestataire" };

export default async function EditEditorPage(props: PageProps<"/monteurs/[id]/modifier">) {
  const actor = await requirePagePermission("editors.write");
  const { id } = await props.params;
  const e = await prisma.editorProfile.findUnique({ where: { id } });
  if (!e) notFound();
  const s = (v: string | null) => v ?? "";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Modifier — ${e.displayName}`} />
      <EditorForm
        editorId={e.id}
        canAppraise={can(actor, "editors.appraisal")}
        defaults={{
          displayName: e.displayName, email: s(e.email), whatsapp: s(e.whatsapp), country: s(e.country), timezone: s(e.timezone),
          languages: e.languages.join(", "), avatarUrl: s(e.avatarUrl), portfolioUrl: s(e.portfolioUrl), skills: e.skills, formats: e.formats,
          level: e.level ?? "", availabilityNote: s(e.availabilityNote), status: e.status, payCurrency: e.payCurrency, paymentTerms: s(e.paymentTerms),
          internalNotes: s(e.internalNotes), privateAppraisal: can(actor, "editors.appraisal") ? s(e.privateAppraisal) : "",
          weeklyCapacityHours: e.weeklyCapacityHours?.toFixed() ?? "", version: e.version,
        }}
      />
    </div>
  );
}
