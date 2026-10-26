import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { InvoiceForm } from "@/features/finance/invoice-form";
import { toDateOnlyString } from "@/lib/dates";
import { requirePagePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { invoiceFormData } from "@/server/queries/finance-forms";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Modifier le brouillon") };
}

export default async function EditInvoicePage(props: PageProps<"/finances/factures/[id]/modifier">) {
  const tr = await getT();
  await requirePagePermission("invoices.write");
  const { id } = await props.params;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!inv) notFound();
  if (inv.status !== "DRAFT") redirect(`/finances/factures/${id}`);
  const data = await invoiceFormData();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={tr("Modifier le brouillon")} subtitle={tr("Seuls les brouillons sont modifiables. Une facture émise se corrige par un avoir.")} />
      <InvoiceForm
        invoiceId={inv.id}
        {...data}
        defaults={{
          clientId: inv.clientId, projectId: inv.projectId ?? "", salesOrderId: inv.salesOrderId ?? "", kind: inv.kind, status: "DRAFT", number: inv.number ?? "", externalRef: inv.externalRef ?? "",
          issueDate: inv.issueDate ? toDateOnlyString(inv.issueDate) : "", dueDate: inv.dueDate ? toDateOnlyString(inv.dueDate) : "", currency: inv.currency, manualFxRate: "", notes: inv.notes ?? "",
          lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity.toFixed(), unitPrice: l.deductsInvoiceId ? l.netAmount.abs().toFixed(2) : l.unitPrice.toFixed(2), vatRate: l.vatRate.toFixed(), salesOrderLineId: l.salesOrderLineId ?? "", deductsInvoiceId: l.deductsInvoiceId ?? "" })),
        }}
      />
    </div>
  );
}
