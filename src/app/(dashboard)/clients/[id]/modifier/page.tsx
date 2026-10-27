import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { prisma } from "@/server/db";
import { clientFormDefaults } from "@/server/queries/form-defaults";
import { staffOptions } from "@/server/queries/options";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Modifier le client") };
}

export default async function EditClientPage(props: PageProps<"/clients/[id]/modifier">) {
  const tr = await getT();
  const actor = await requirePagePermission("clients.write");
  const { id } = await props.params;
  const [c, owners] = await Promise.all([
    prisma.client.findUnique({ where: { id }, include: { tags: { include: { tag: true } } } }),
    staffOptions(),
  ]);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [c.displayName])} />
      <ClientForm
        clientId={c.id}
        owners={owners}
        canArchive={can(actor, "clients.archive")}
        defaults={clientFormDefaults(c)}
      />
    </div>
  );
}
