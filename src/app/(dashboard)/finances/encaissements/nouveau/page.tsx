import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ClientPaymentForm } from "@/features/finance/movement-forms";
import { requirePagePermission } from "@/server/auth/session";
import { openInvoicesByClient } from "@/server/queries/finance";
import { clientOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Enregistrer un encaissement") };
}

export default async function NewPaymentPage(props: PageProps<"/finances/encaissements/nouveau">) {
  const tr = await getT();
  const actor = await requirePagePermission("payments.write");
  const params = await props.searchParams;
  const [clients, open, today] = await Promise.all([clientOptions(), openInvoicesByClient(actor), agencyToday()]);
  const inv = open.find((i) => i.id === params.facture);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Enregistrer un encaissement")} subtitle={tr("Acompte, solde, paiement partiel ou couvrant plusieurs factures.")} />
      <ClientPaymentForm
        clients={clients}
        openInvoices={open}
        defaults={{
          clientId: inv?.clientId ?? (typeof params.client === "string" ? params.client : ""), receivedOn: today, amount: inv?.balance ?? "",
          currency: (inv?.currency as "EUR") ?? "EUR", manualFxRate: "", fees: "", method: "BANK_TRANSFER", reference: "", notes: "",
          allocations: inv ? [{ invoiceId: inv.id, amount: inv.balance }] : [],
        }}
      />
    </div>
  );
}
