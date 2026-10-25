import "server-only";
import type { VideoStatus, VideoType } from "@/generated/prisma/enums";
import { addDays, toDateOnlyString, type Period } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { ACTIVE_VIDEO_STATUSES, CLOSED_VIDEO_STATUSES, TO_VALIDATE_STATUSES } from "../domain/video-workflow";
import { can, type Actor } from "../policies";
import { getSettings } from "../settings";
import { periodInstants } from "../services/metrics";

/** Indicateurs opérationnels du jour (aucun montant). */
export async function getOperationalSnapshot(actor: Actor, today: string) {
  const todayDate = new Date(`${today}T00:00:00Z`);
  const in7 = new Date(`${addDays(today, 7)}T00:00:00Z`);
  const notClosed = { status: { notIn: [...CLOSED_VIDEO_STATUSES, "APPROVED" as VideoStatus] } };
  const [active, toAssign, overdue, toValidate, dueSoon, blocked, missingCosts, envelopeMissing, followClients, followOpps, overdueList, validateList, assignList] = await Promise.all([
    prisma.video.count({ where: { status: { in: ACTIVE_VIDEO_STATUSES } } }),
    prisma.video.count({ where: { status: "TO_ASSIGN" } }),
    prisma.video.count({ where: { ...notClosed, OR: [{ clientDeadline: { lt: todayDate } }, { internalDeadline: { lt: todayDate } }] } }),
    prisma.video.count({ where: { status: { in: TO_VALIDATE_STATUSES } } }),
    prisma.video.count({ where: { ...notClosed, clientDeadline: { gte: todayDate, lte: in7 } } }),
    prisma.video.count({ where: { isBlocked: true, status: { notIn: CLOSED_VIDEO_STATUSES } } }),
    prisma.directCost.count({ where: { amount: null, stage: { not: "CANCELLED" } } }),
    prisma.assignment.count({ where: { rateMode: "MONTHLY_ENVELOPE", status: { not: "CANCELLED" }, video: { costAllocations: { none: {} } } } }),
    prisma.client.count({ where: { nextFollowUpOn: { lte: todayDate }, status: { notIn: ["ARCHIVED", "LOST"] } } }),
    prisma.opportunity.count({ where: { followUpOn: { lte: todayDate }, stage: { notIn: ["WON", "LOST"] } } }),
    prisma.video.findMany({
      where: { ...notClosed, OR: [{ clientDeadline: { lt: todayDate } }, { internalDeadline: { lt: todayDate } }] },
      orderBy: { clientDeadline: "asc" },
      take: 5,
      select: { id: true, reference: true, title: true, clientDeadline: true, internalDeadline: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
    prisma.video.findMany({ where: { status: { in: TO_VALIDATE_STATUSES } }, orderBy: { clientDeadline: "asc" }, take: 5, select: { id: true, reference: true, title: true, status: true } }),
    prisma.video.findMany({ where: { status: "TO_ASSIGN" }, orderBy: { clientDeadline: "asc" }, take: 5, select: { id: true, reference: true, title: true, clientDeadline: true } }),
  ]);
  return {
    active, toAssign, overdue, toValidate, dueSoon, blocked, missingCosts: missingCosts + envelopeMissing, followUps: followClients + followOpps,
    overdueList: overdueList.map((v) => ({ ...v, clientDeadline: v.clientDeadline ? toDateOnlyString(v.clientDeadline) : null })),
    validateList,
    assignList: assignList.map((v) => ({ ...v, clientDeadline: v.clientDeadline ? toDateOnlyString(v.clientDeadline) : null })),
    showCosts: can(actor, "costs.read"),
  };
}

/** Capacité des monteurs sur 7 jours : heures estimées vs capacité indicative. */
export async function getEditorCapacity(today: string) {
  const horizon = new Date(`${addDays(today, 7)}T00:00:00Z`);
  const editors = await prisma.editorProfile.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: {
      id: true, displayName: true, weeklyCapacityHours: true,
      assignments: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] }, OR: [{ dueOn: null }, { dueOn: { lte: horizon } }] }, select: { estimatedHours: true } },
    },
  });
  return editors.map((e) => {
    const planned = sum(e.assignments.filter((a) => a.estimatedHours).map((a) => dec(a.estimatedHours)));
    const capacity = e.weeklyCapacityHours ? dec(e.weeklyCapacityHours) : null;
    return {
      id: e.id, name: e.displayName, missions: e.assignments.length, planned: planned.toFixed(1), capacity: capacity?.toFixed(1) ?? null,
      missingEstimates: e.assignments.filter((a) => !a.estimatedHours).length, overloaded: capacity ? planned.gt(capacity) : false,
      loadPct: capacity && !capacity.isZero() ? planned.div(capacity).mul(100).toDecimalPlaces(0).toNumber() : null,
    };
  });
}

/** Répartitions (comptages) : étapes de production en cours, volumes livrés par type. */
export async function getVolumeCharts(period: Pick<Period, "from" | "to">) {
  const settings = await getSettings();
  const { start, end } = periodInstants(period, settings.timezone);
  const [byStatus, byType] = await Promise.all([
    prisma.video.groupBy({ by: ["status"], where: { status: { in: ACTIVE_VIDEO_STATUSES } }, _count: true }),
    prisma.video.groupBy({ by: ["type"], where: { deliveredAt: { gte: start, lt: end }, status: { in: ["DELIVERED", "ARCHIVED"] } }, _count: true }),
  ]);
  return {
    byStatus: byStatus.map((r) => ({ key: r.status as VideoStatus, count: r._count })),
    byType: byType.map((r) => ({ key: r.type as VideoType, count: r._count })).sort((a, b) => b.count - a.count),
  };
}
