import "server-only";
/**
 * Rentabilité par livrable / projet / client.
 * Règle anti-multiplication : chaque source (allocations de revenu, coûts directs,
 * allocations de coûts) est agrégée séparément par vidéo/projet AVANT d'être combinée.
 * Une facture n'entre jamais dans la marge contractuelle (source unique : ventes).
 */
import type { CostStage } from "@/generated/prisma/enums";
import { Decimal, dec, sum } from "@/lib/money";
import type { Db } from "../db";
import { computeMargin, type CostItem, type MarginResult } from "../domain/profitability";

export interface VideoFinancials extends MarginResult {
  videoId: string;
  costItems: (CostItem & { label: string; costId: string })[];
  /** Missions sous enveloppe mensuelle sans allocation analytique. */
  envelopeWithoutAllocation: number;
}

const ZERO = new Decimal(0);

export async function getVideosFinancials(db: Db, videoIds: string[]): Promise<Map<string, VideoFinancials>> {
  const result = new Map<string, VideoFinancials>();
  if (videoIds.length === 0) return result;

  const [allocations, directCosts, costAllocations, envelopeAssignments, videos] = await Promise.all([
    db.revenueAllocation.groupBy({
      by: ["videoId"],
      where: { videoId: { in: videoIds }, salesOrderLine: { salesOrder: { status: "ACCEPTED" } } },
      _sum: { amountEur: true },
    }),
    db.directCost.findMany({
      where: { videoId: { in: videoIds }, kind: { not: "ENVELOPE" } },
      select: { id: true, videoId: true, amountEur: true, stage: true, label: true },
    }),
    db.costAllocation.findMany({
      where: { videoId: { in: videoIds } },
      select: { videoId: true, amountEur: true, directCost: { select: { id: true, stage: true, label: true, editorId: true, kind: true } } },
    }),
    db.assignment.findMany({
      where: { videoId: { in: videoIds }, rateMode: "MONTHLY_ENVELOPE", status: { not: "CANCELLED" } },
      select: { videoId: true, editorId: true },
    }),
    db.video.findMany({ where: { id: { in: videoIds } }, select: { id: true, status: true } }),
  ]);

  const revenue = new Map(allocations.map((a) => [a.videoId, dec(a._sum.amountEur ?? 0)]));
  const items = new Map<string, VideoFinancials["costItems"]>();
  for (const c of directCosts) {
    const list = items.get(c.videoId!) ?? [];
    list.push({ costId: c.id, label: c.label, stage: c.stage, amountEur: c.amountEur === null ? null : dec(c.amountEur) });
    items.set(c.videoId!, list);
  }
  const allocatedEnvelopeEditors = new Set<string>();
  for (const a of costAllocations) {
    const list = items.get(a.videoId) ?? [];
    list.push({ costId: a.directCost.id, label: a.directCost.label, stage: a.directCost.stage as CostStage, amountEur: dec(a.amountEur) });
    items.set(a.videoId, list);
    if (a.directCost.kind === "ENVELOPE" && a.directCost.editorId) allocatedEnvelopeEditors.add(`${a.videoId}:${a.directCost.editorId}`);
  }
  const envelopeMissing = new Map<string, number>();
  for (const a of envelopeAssignments) {
    if (!allocatedEnvelopeEditors.has(`${a.videoId}:${a.editorId}`)) {
      envelopeMissing.set(a.videoId, (envelopeMissing.get(a.videoId) ?? 0) + 1);
    }
  }
  for (const v of videos) {
    const costItems = items.get(v.id) ?? [];
    const margin = computeMargin(revenue.get(v.id) ?? ZERO, costItems, {
      delivered: v.status === "DELIVERED" || v.status === "ARCHIVED",
      uncostedAssignments: envelopeMissing.get(v.id) ?? 0,
    });
    result.set(v.id, { ...margin, videoId: v.id, costItems, envelopeWithoutAllocation: envelopeMissing.get(v.id) ?? 0 });
  }
  return result;
}

export interface ProjectFinancials extends MarginResult {
  projectId: string;
  soldEur: Decimal;
  allocatedEur: Decimal;
  unallocatedEur: Decimal;
  estimatedCostsEur: Decimal;
  committedCostsEur: Decimal;
  validatedCostsEur: Decimal;
}

/** Marge projet : ventes acceptées nettes du projet − coûts directs du projet (enveloppes via allocations). */
export async function getProjectsFinancials(db: Db, projectIds: string[]): Promise<Map<string, ProjectFinancials>> {
  const out = new Map<string, ProjectFinancials>();
  if (projectIds.length === 0) return out;
  const [lines, allocations, costs, envelopeAllocs, projects] = await Promise.all([
    db.salesOrderLine.findMany({
      where: { salesOrder: { projectId: { in: projectIds }, status: "ACCEPTED" } },
      select: { netAmountEur: true, cancelledAmountEur: true, salesOrder: { select: { projectId: true } } },
    }),
    db.revenueAllocation.findMany({
      where: { video: { projectId: { in: projectIds } }, salesOrderLine: { salesOrder: { status: "ACCEPTED" } } },
      select: { amountEur: true, video: { select: { projectId: true } } },
    }),
    db.directCost.findMany({
      where: { projectId: { in: projectIds }, kind: { not: "ENVELOPE" } },
      select: { projectId: true, amountEur: true, stage: true },
    }),
    db.costAllocation.findMany({
      where: { video: { projectId: { in: projectIds } }, directCost: { kind: "ENVELOPE" } },
      select: { amountEur: true, video: { select: { projectId: true } }, directCost: { select: { stage: true } } },
    }),
    db.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, status: true, videos: { select: { status: true } } },
    }),
  ]);
  for (const p of projects) {
    const sold = sum(lines.filter((l) => l.salesOrder.projectId === p.id).map((l) => dec(l.netAmountEur).minus(dec(l.cancelledAmountEur))));
    const allocated = sum(allocations.filter((a) => a.video.projectId === p.id).map((a) => dec(a.amountEur)));
    const costItems: CostItem[] = [
      ...costs.filter((c) => c.projectId === p.id).map((c) => ({ stage: c.stage, amountEur: c.amountEur === null ? null : dec(c.amountEur) })),
      ...envelopeAllocs.filter((a) => a.video.projectId === p.id).map((a) => ({ stage: a.directCost.stage, amountEur: dec(a.amountEur) })),
    ];
    const delivered = p.videos.length > 0 && p.videos.every((v) => ["DELIVERED", "ARCHIVED", "CANCELLED"].includes(v.status));
    const margin = computeMargin(sold, costItems, { delivered });
    const byStage = (stage: CostStage) => sum(costItems.filter((c) => c.stage === stage && c.amountEur).map((c) => c.amountEur as Decimal));
    out.set(p.id, {
      ...margin,
      projectId: p.id,
      soldEur: sold,
      allocatedEur: allocated,
      unallocatedEur: sold.minus(allocated),
      estimatedCostsEur: byStage("ESTIMATED"),
      committedCostsEur: byStage("COMMITTED"),
      validatedCostsEur: byStage("VALIDATED"),
    });
  }
  return out;
}

/** Charge planifiée d'un prestataire : heures estimées des missions actives à échéance dans la fenêtre. */
export async function getEditorLoad(db: Db, editorId: string, fromIso: string, toIso: string) {
  const [editor, assignments, unavailable] = await Promise.all([
    db.editorProfile.findUnique({ where: { id: editorId }, select: { weeklyCapacityHours: true } }),
    db.assignment.findMany({
      where: {
        editorId,
        status: { in: ["PLANNED", "IN_PROGRESS"] },
        OR: [{ dueOn: null }, { dueOn: { gte: new Date(`${fromIso}T00:00:00Z`), lte: new Date(`${toIso}T00:00:00Z`) } }],
      },
      select: { estimatedHours: true, dueOn: true },
    }),
    db.editorUnavailability.count({
      where: { editorId, startsOn: { lte: new Date(`${toIso}T00:00:00Z`) }, endsOn: { gte: new Date(`${fromIso}T00:00:00Z`) } },
    }),
  ]);
  const plannedHours = sum(assignments.filter((a) => a.estimatedHours !== null).map((a) => dec(a.estimatedHours)));
  const missingEstimates = assignments.filter((a) => a.estimatedHours === null).length;
  const capacity = editor?.weeklyCapacityHours ? dec(editor.weeklyCapacityHours) : null;
  return {
    activeMissions: assignments.length,
    plannedHours,
    missingEstimates,
    capacityHours: capacity,
    unavailable: unavailable > 0,
    overloaded: capacity !== null && plannedHours.gt(capacity),
  };
}
