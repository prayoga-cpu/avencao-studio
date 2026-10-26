import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ImportWizard } from "@/features/clients/import-wizard";
import { requirePagePermission } from "@/server/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Import de clients") };
}

export default async function ClientImportPage() {
  const tr = await getT();
  await requirePagePermission("clients.import");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={tr("Importer des clients (CSV)")} subtitle={tr("Aperçu avant import, détection des doublons, création uniquement après confirmation.")} />
      <ImportWizard />
    </div>
  );
}
