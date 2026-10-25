import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { InvoiceForm } from "@/features/finance/invoice-form";
import { dec } from "@/lib/money";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { invoiceFormData } from "@/server/queries/finance-forms";
import { agencyToday } from "@/server/services/common";

export const metadata: Metadata = { title: "Enregistrer une facture" };

export default async function NewInvoicePage(props: PageProps<"/finances/factures/nouvelle">) {
  await requirePagePermission("invoices.write");
  const params = await props.searchParams;
  const [data, today] = await Promise.all([invoiceFormData(), agencyToday()]);
  const project = data.projects.find((p) => p.value === params.projet);
  const order = typeof params.vente === "string" ? await prisma.salesOrder.findUnique({ where: { id: params.vente }, include: { lines: true } }) : null;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Enregistrer une facture" subtitle="Factures d'acompte et finales : la finale déduit l'acompte, le revenu n'est jamais compté deux fois." />
      <InvoiceForm
        {...data}
        defaults={{
          clientId: order?.clientId ?? project?.clientId ?? (typeof params.client === "string" ? params.client : ""),
          projectId: order?.projectId ?? project?.value ?? "", salesOrderId: order?.id ?? "", kind: "STANDARD", status: "ISSUED", number: "", externalRef: "",
          issueDate: today, dueDate: "", currency: order?.currency ?? "EUR", manualFxRate: "", notes: "",
          lines: order
            ? order.lines.map((l) => ({ description: l.description, quantity: "1", unitPrice: dec(l.netAmount).minus(dec(l.cancelledAmount)).toFixed(2), vatRate: "", salesOrderLineId: l.id, deductsInvoiceId: "" }))
            : [{ description: "", quantity: "1", unitPrice: "", vatRate: "", salesOrderLineId: "", deductsInvoiceId: "" }],
        }}
      />
    </div>
  );
}
