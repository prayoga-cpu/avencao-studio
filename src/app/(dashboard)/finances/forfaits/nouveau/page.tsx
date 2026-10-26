import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { RetainerForm } from "@/features/finance/movement-forms";
import { requirePagePermission } from "@/server/auth/session";
import { clientOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Nouveau forfait") };
}

export default async function NewRetainerPage() {
  const tr = await getT();
  await requirePagePermission("retainers.write");
  const [clients, today] = await Promise.all([clientOptions(), agencyToday()]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Nouveau forfait récurrent")} subtitle={tr("Génération mensuelle idempotente : une relance ne crée jamais deux fois une période, une vente ou une facture brouillon.")} />
      <RetainerForm clients={clients} defaults={{ clientId: "", title: "", startsOn: `${today.slice(0, 7)}-01`, endsOn: "", amount: "", currency: "EUR", carryOver: "NONE", createDraftInvoice: true, vatRate: "", notes: "", quotas: [{ videoType: "REEL", quantity: "" }] }} />
    </div>
  );
}
