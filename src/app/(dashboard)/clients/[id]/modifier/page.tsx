import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { toDateOnlyString } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { prisma } from "@/server/db";
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
  const s = (v: string | null) => v ?? "";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Modifier — {0}", [c.displayName])} />
      <ClientForm
        clientId={c.id}
        owners={owners}
        canArchive={can(actor, "clients.archive")}
        defaults={{
          displayName: c.displayName, kind: c.kind, status: c.status, legalName: s(c.legalName), email: s(c.email), phone: s(c.phone),
          whatsapp: s(c.whatsapp), country: s(c.country), billingAddress: s(c.billingAddress), vatNumber: s(c.vatNumber),
          companyRegistration: s(c.companyRegistration), website: s(c.website), instagram: s(c.instagram), tiktok: s(c.tiktok),
          youtube: s(c.youtube), linkedin: s(c.linkedin), otherSocial: s(c.otherSocial), acquisitionSource: s(c.acquisitionSource),
          ownerId: s(c.ownerId), currency: c.currency, paymentTermsDays: c.paymentTermsDays?.toString() ?? "", driveUrl: s(c.driveUrl),
          creativePreferences: s(c.creativePreferences), references: s(c.references), internalNotes: s(c.internalNotes),
          nextFollowUpOn: c.nextFollowUpOn ? toDateOnlyString(c.nextFollowUpOn) : "", tags: c.tags.map((t) => t.tag.name).join(", "),
          contactFirstName: "", contactLastName: "", contactJobTitle: "", contactEmail: "", contactPhone: "",
          confirmDuplicate: false, version: c.version,
        }}
      />
    </div>
  );
}
