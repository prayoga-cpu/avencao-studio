"use server";

import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { revalidateApp } from "@/server/revalidate";
import { qualifyLegacyPayment } from "@/server/services/legacy";

export async function qualifyLegacyAction(input: { id: string; status: "LINKED_INVOICE" | "LINKED_PAYMENT" | "ARCHIVED"; invoiceId?: string; paymentId?: string; note: string }) {
  return safeAction(async () => {
    const r = await qualifyLegacyPayment(await actorFor("legacy.reconcile"), input);
    revalidateApp();
    return r;
  }, "Paiement historique qualifié.");
}

export async function legacyTargetsAction(clientId: string) {
  return safeAction(async () => {
    await actorFor("legacy.reconcile");
    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({ where: { clientId, status: "ISSUED" }, select: { id: true, number: true, totalGross: true, currency: true }, orderBy: { issueDate: "desc" } }),
      prisma.clientPayment.findMany({ where: { clientId, status: "RECORDED" }, select: { id: true, reference: true, amount: true, currency: true, receivedOn: true }, orderBy: { receivedOn: "desc" } }),
    ]);
    return {
      invoices: invoices.map((i) => ({ id: i.id, label: `${i.number ?? "?"} — ${i.totalGross.toFixed(2)} ${i.currency}` })),
      payments: payments.map((p) => ({ id: p.id, label: `${p.receivedOn.toISOString().slice(0, 10)} — ${p.amount.toFixed(2)} ${p.currency}${p.reference ? ` (${p.reference})` : ""}` })),
    };
  });
}
