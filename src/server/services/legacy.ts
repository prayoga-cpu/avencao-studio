import "server-only";
import { recordAudit } from "../audit";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { assertCan, type Actor } from "../policies";

/**
 * Qualification d'un « paiement » Rails : rattachement explicite à une facture ou à un
 * encaissement du nouveau CRM, ou archivage informatif. Tant qu'il n'est pas qualifié,
 * il reste exclu de tous les totaux. Rien n'est converti automatiquement en revenu.
 */
export async function qualifyLegacyPayment(
  actor: Actor,
  input: { id: string; status: "LINKED_INVOICE" | "LINKED_PAYMENT" | "ARCHIVED"; invoiceId?: string; paymentId?: string; note: string },
) {
  assertCan(actor, "legacy.reconcile");
  const row = await prisma.legacyPayment.findUnique({ where: { id: input.id } });
  if (!row) throw new NotFoundError();
  if (!input.note.trim()) throw new DomainError("Indiquez la justification de la qualification.");
  if (input.status === "LINKED_INVOICE") {
    const inv = input.invoiceId ? await prisma.invoice.findUnique({ where: { id: input.invoiceId } }) : null;
    if (!inv || inv.clientId !== row.clientId) throw new DomainError("Facture introuvable pour ce client.");
  }
  if (input.status === "LINKED_PAYMENT") {
    const p = input.paymentId ? await prisma.clientPayment.findUnique({ where: { id: input.paymentId } }) : null;
    if (!p || p.clientId !== row.clientId) throw new DomainError("Encaissement introuvable pour ce client.");
  }
  await prisma.legacyPayment.update({
    where: { id: input.id },
    data: {
      reconciliationStatus: input.status,
      linkedInvoiceId: input.status === "LINKED_INVOICE" ? input.invoiceId : null,
      linkedPaymentId: input.status === "LINKED_PAYMENT" ? input.paymentId : null,
      qualificationNote: input.note,
      qualifiedById: actor.id,
      qualifiedAt: new Date(),
    },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "legacy.qualify", entityType: "LegacyPayment", entityId: input.id, before: { status: row.reconciliationStatus }, after: input });
  return { id: input.id };
}
