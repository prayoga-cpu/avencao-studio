import "server-only";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { clientOptions, projectOptions } from "./options";

/** Données des listes de choix du formulaire de facture. */
export async function invoiceFormData() {
  const [clients, projects, deposits, lines] = await Promise.all([
    clientOptions(),
    projectOptions(),
    prisma.invoice.findMany({ where: { kind: "DEPOSIT", status: "ISSUED" }, select: { id: true, number: true, clientId: true, currency: true, totalNet: true, deductedBy: { where: { invoice: { status: { not: "CANCELLED" } } }, select: { netAmount: true } } } }),
    prisma.salesOrderLine.findMany({ where: { salesOrder: { status: "ACCEPTED" } }, select: { id: true, description: true, netAmount: true, cancelledAmount: true, salesOrder: { select: { id: true, reference: true, clientId: true, projectId: true } } } }),
  ]);
  return {
    clients,
    projects,
    deposits: deposits
      .map((d) => ({ id: d.id, number: d.number ?? "?", clientId: d.clientId, currency: d.currency, remainingNet: dec(d.totalNet).plus(sum(d.deductedBy.map((x) => dec(x.netAmount)))).toFixed(2) }))
      .filter((d) => dec(d.remainingNet).gt(0)),
    orderLines: lines.map((l) => ({ id: l.id, label: `${l.salesOrder.reference} — ${l.description}`, clientId: l.salesOrder.clientId, projectId: l.salesOrder.projectId, salesOrderId: l.salesOrder.id, netRemaining: dec(l.netAmount).minus(dec(l.cancelledAmount)).toFixed(2) })),
  };
}
