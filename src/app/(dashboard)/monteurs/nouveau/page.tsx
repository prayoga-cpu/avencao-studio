import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { EditorForm } from "@/features/editors/editor-form";
import { emptyEditor } from "@/features/editors/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";

export const metadata: Metadata = { title: "Nouveau prestataire" };

export default async function NewEditorPage() {
  const actor = await requirePagePermission("editors.write");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouveau prestataire" subtitle="Aucun accès n'est créé : invitez le monteur plus tard depuis Réglages › Utilisateurs." />
      <EditorForm defaults={emptyEditor} canAppraise={can(actor, "editors.appraisal")} />
    </div>
  );
}
