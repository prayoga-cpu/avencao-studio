import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ImportWizard } from "@/features/clients/import-wizard";
import { requirePagePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Import de clients" };

export default async function ClientImportPage() {
  await requirePagePermission("clients.import");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Importer des clients (CSV)" subtitle="Aperçu avant import, détection des doublons, création uniquement après confirmation." />
      <ImportWizard />
    </div>
  );
}
