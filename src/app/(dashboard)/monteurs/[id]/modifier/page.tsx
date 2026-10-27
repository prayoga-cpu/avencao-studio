import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { EditorForm } from "@/features/editors/editor-form";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { editorFormDefaults } from "@/server/queries/form-defaults";
import { can } from "@/server/policies";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Modifier le prestataire") };
}

export default async function EditEditorPage(props: PageProps<"/monteurs/[id]/modifier">) {
  const tr = await getT();
  const actor = await requirePagePermission("editors.write");
  const { id } = await props.params;
  const e = await prisma.editorProfile.findUnique({ where: { id } });
  if (!e) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [e.displayName])} />
      <EditorForm
        editorId={e.id}
        canAppraise={can(actor, "editors.appraisal")}
        defaults={editorFormDefaults(e, can(actor, "editors.appraisal"))}
      />
    </div>
  );
}
