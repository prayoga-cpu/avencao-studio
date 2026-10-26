import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SupplierPaymentForm } from "@/features/finance/movement-forms";
import { requirePagePermission } from "@/server/auth/session";
import { payableCosts } from "@/server/queries/finance";
import { editorOptions } from "@/server/queries/options";
import { agencyToday } from "@/server/services/common";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Enregistrer un règlement monteur") };
}

export default async function NewSupplierPaymentPage(props: PageProps<"/finances/reglements/nouveau">) {
  const tr = await getT();
  const actor = await requirePagePermission("supplierPayments.write");
  const params = await props.searchParams;
  const [editors, payable, today] = await Promise.all([editorOptions(), payableCosts(actor), agencyToday()]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={tr("Enregistrer un règlement monteur")} subtitle={tr("Sélectionnez les missions validées couvertes par ce paiement : payé et restant dû sont mis à jour précisément.")} />
      <SupplierPaymentForm editors={editors} payable={payable} defaults={{ editorId: typeof params.monteur === "string" ? params.monteur : "", paidOn: today }} />
    </div>
  );
}
