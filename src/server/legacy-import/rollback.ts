import "server-only";
/**
 * Annulation d'un import appliqué : supprime ce que l'exécution a créé (via LegacyIdMap),
 * en ordre inverse des dépendances. Refuse si des données métier ont été ajoutées depuis
 * sur ces fiches (factures, ventes, vidéos…) : dans ce cas, revue manuelle.
 */
import { prisma } from "../db";
import { DomainError } from "../errors";

export async function rollbackImportRun(runId: string) {
  const run = await prisma.importRun.findUnique({ where: { id: runId } });
  if (!run) throw new DomainError("Exécution d'import introuvable");
  if (run.mode !== "APPLY") throw new DomainError("Une simulation n'a rien enregistré : rien à annuler");

  return prisma.$transaction(async (tx) => {
    const maps = await tx.legacyIdMap.findMany({ where: { importRunId: runId } });
    const ids = (type: string) => maps.filter((m) => m.entityType === type).map((m) => m.entityId);
    const clientIds = ids("Client");
    const projectIds = ids("Project");
    const videoIds = ids("Video");
    const userIds = ids("User");

    const [sales, invoices, payments, newProjects] = await Promise.all([
      tx.salesOrder.count({ where: { clientId: { in: clientIds } } }),
      tx.invoice.count({ where: { clientId: { in: clientIds } } }),
      tx.clientPayment.count({ where: { clientId: { in: clientIds } } }),
      tx.project.count({ where: { clientId: { in: clientIds }, id: { notIn: projectIds }, reference: { not: { startsWith: "LEG-" } } } }),
    ]);
    if (sales + invoices + payments + newProjects > 0) {
      throw new DomainError("Des ventes, factures, encaissements ou projets ont été créés depuis l'import sur ces clients : annulation automatique refusée");
    }
    const linked = await tx.legacyPayment.count({ where: { source: run.source, clientId: { in: clientIds }, reconciliationStatus: { not: "TO_RECONCILE" } } });
    if (linked > 0) throw new DomainError("Des paiements historiques ont déjà été qualifiés : annulation automatique refusée");

    // Comptes : uniquement ceux créés par cette exécution, jamais activés, et non rattachés par une autre source.
    const sharedUsers = new Set(
      (await tx.legacyIdMap.findMany({ where: { entityType: "User", entityId: { in: userIds }, importRunId: { not: runId } }, select: { entityId: true } })).map((m) => m.entityId),
    );
    const createdUsers = (
      await tx.user.findMany({ where: { id: { in: userIds }, status: "PENDING_REVIEW", legacyRole: { not: null }, accounts: { none: {} } }, select: { id: true } })
    ).filter((u) => !sharedUsers.has(u.id));

    const legacyPayments = await tx.legacyPayment.findMany({ where: { source: run.source, clientId: { in: clientIds } }, select: { id: true } });
    await tx.attachment.deleteMany({ where: { ownerType: "LEGACY_PAYMENT", ownerId: { in: legacyPayments.map((p) => p.id) } } });
    await tx.attachment.deleteMany({ where: { ownerType: "USER", ownerId: { in: createdUsers.map((u) => u.id) } } });
    await tx.legacyPayment.deleteMany({ where: { id: { in: legacyPayments.map((p) => p.id) } } });
    await tx.note.deleteMany({ where: { id: { in: ids("Note") } } });
    await tx.video.deleteMany({ where: { id: { in: videoIds } } });
    await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    await tx.user.deleteMany({ where: { id: { in: createdUsers.map((u) => u.id) } } });
    const removedMaps = await tx.legacyIdMap.deleteMany({ where: { importRunId: runId } });
    await tx.importRun.update({ where: { id: runId }, data: { status: "FAILED", summary: { ...(run.summary as object), rolledBackAt: new Date().toISOString() } } });
    return { clients: clientIds.length, users: createdUsers.length, mappings: removedMaps.count };
  });
}
