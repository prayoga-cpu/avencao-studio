import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { EditorForm } from "@/features/editors/editor-form";
import { emptyEditor } from "@/features/editors/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Nouveau prestataire") };
}

export default async function NewEditorPage() {
  const tr = await getT();
  const actor = await requirePagePermission("editors.write");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Nouveau prestataire")} subtitle={tr("Aucun accès n'est créé : invitez le monteur plus tard depuis Réglages › Utilisateurs.")} />
      <EditorForm defaults={emptyEditor} canAppraise={can(actor, "editors.appraisal")} />
    </div>
  );
}
