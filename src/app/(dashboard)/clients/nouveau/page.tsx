import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { emptyClient } from "@/features/clients/schemas";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { staffOptions } from "@/server/queries/options";

export const metadata: Metadata = { title: "Nouveau client" };

export default async function NewClientPage() {
  const actor = await requirePagePermission("clients.write");
  const owners = await staffOptions();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nouveau client" subtitle="Les doublons sont détectés sur l'email, le téléphone et les identifiants administratifs — jamais sur le seul nom." />
      <ClientForm defaults={{ ...emptyClient, ownerId: actor.id }} owners={owners} canArchive={can(actor, "clients.archive")} />
    </div>
  );
}
