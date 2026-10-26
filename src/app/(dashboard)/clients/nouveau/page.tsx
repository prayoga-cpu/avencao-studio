import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { emptyClient } from "@/features/clients/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { staffOptions } from "@/server/queries/options";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Nouveau client") };
}

export default async function NewClientPage() {
  const tr = await getT();
  const actor = await requirePagePermission("clients.write");
  const owners = await staffOptions();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Nouveau client")} subtitle={tr("Les doublons sont détectés sur l'email, le téléphone et les identifiants administratifs — jamais sur le seul nom.")} />
      <ClientForm defaults={{ ...emptyClient, ownerId: actor.id }} owners={owners} canArchive={can(actor, "clients.archive")} />
    </div>
  );
}
