import "server-only";
/**
 * Lectures production. Les montants ne sont sélectionnés que si l'acteur a le droit
 * de les voir : un monteur ou un responsable sans accès financier ne reçoit jamais
 * de prix de vente, de marge ni le coût d'un autre monteur.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Priority, ProjectStatus, VideoStatus, VideoType } from "@/generated/prisma/enums";
import { addDays, toDateOnlyString } from "@/lib/dates";
import { dec } from "@/lib/money";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { ACTIVE_VIDEO_STATUSES, CLOSED_VIDEO_STATUSES, TO_VALIDATE_STATUSES, allowedTransitions } from "../domain/video-workflow";
import { can, type Actor } from "../policies";
import { agencyToday } from "../services/common";
import { getProjectsFinancials, getVideosFinancials } from "../services/profitability";
import { revisionRoundsUsed } from "../services/videos";

export async function listProjects(actor: Actor, f: { q?: string; status?: string; client?: string; owner?: string; page: number; pageSize: number }) {
  const where: Prisma.ProjectWhereInput = {
    ...(f.status ? { status: f.status as ProjectStatus } : { status: { notIn: ["ARCHIVED", "CANCELLED"] } }),
    ...(f.client ? { clientId: f.client } : {}),
    ...(f.owner ? { ownerId: f.owner } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }, { client: { displayName: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ clientDeadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { client: { select: { id: true, displayName: true } }, owner: { select: { name: true } }, videos: { select: { status: true } } },
    }),
    prisma.project.count({ where }),
  ]);
  const fin = can(actor, "margins.project") ? await getProjectsFinancials(prisma, rows.map((r) => r.id)) : null;
  return {
    total,
    rows: rows.map((p) => {
      const f2 = fin?.get(p.id);
      return {
        id: p.id,
        reference: p.reference,
        title: p.title,
        client: p.client,
        owner: p.owner?.name ?? null,
        status: p.status,
        priority: p.priority,
        clientDeadline: p.clientDeadline ? toDateOnlyString(p.clientDeadline) : null,
        videoCount: p.videos.length,
        deliveredCount: p.videos.filter((v) => v.status === "DELIVERED" || v.status === "ARCHIVED").length,
        finance: f2 ? { soldEur: f2.soldEur.toFixed(2), marginEur: f2.marginEur.toFixed(2), ratePct: f2.ratePct?.toFixed(2) ?? null, status: f2.status, missing: f2.missingCostCount } : null,
      };
    }),
  };
}

export async function getProjectDetail(actor: Actor, id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true, driveUrl: true } },
      owner: { select: { id: true, name: true } },
      template: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
      videos: {
        orderBy: [{ position: "asc" }, { reference: "asc" }],
        include: {
          assignments: { where: { status: { not: "CANCELLED" } }, select: { id: true, role: true, editor: { select: { id: true, displayName: true } } } },
        },
      },
    },
  });
  if (!project) throw new NotFoundError();
  const canMargin = can(actor, "margins.project");
  const [projectFin, videoFin, orders, deadlineChanges] = await Promise.all([
    canMargin ? getProjectsFinancials(prisma, [id]) : null,
    canMargin ? getVideosFinancials(prisma, project.videos.map((v) => v.id)) : null,
    can(actor, "sales.read")
      ? prisma.salesOrder.findMany({
          where: { projectId: id },
          include: { lines: { select: { netAmount: true, cancelledAmount: true } } },
          orderBy: { acceptedOn: "desc" },
        })
      : null,
    prisma.deadlineChange.findMany({ where: { OR: [{ projectId: id }, { video: { projectId: id } }] }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const pf = projectFin?.get(id);
  return {
    project,
    finance: pf
      ? {
          soldEur: pf.soldEur.toFixed(2),
          allocatedEur: pf.allocatedEur.toFixed(2),
          unallocatedEur: pf.unallocatedEur.toFixed(2),
          estimatedCostsEur: pf.estimatedCostsEur.toFixed(2),
          committedCostsEur: pf.committedCostsEur.toFixed(2),
          validatedCostsEur: pf.validatedCostsEur.toFixed(2),
          costsEur: pf.costsEur.toFixed(2),
          marginEur: pf.marginEur.toFixed(2),
          ratePct: pf.ratePct?.toFixed(2) ?? null,
          status: pf.status,
          missing: pf.missingCostCount,
        }
      : null,
    videoFinance: videoFin
      ? Object.fromEntries(
          [...videoFin.entries()].map(([vid, f]) => [vid, { revenueEur: f.revenueEur.toFixed(2), costsEur: f.costsEur.toFixed(2), marginEur: f.marginEur.toFixed(2), ratePct: f.ratePct?.toFixed(2) ?? null, status: f.status, missing: f.missingCostCount }]),
        )
      : null,
    orders: orders?.map((o) => ({
      id: o.id,
      reference: o.reference,
      title: o.title,
      currency: o.currency,
      acceptedOn: toDateOnlyString(o.acceptedOn),
      status: o.status,
      net: o.lines.reduce((acc, l) => acc.plus(dec(l.netAmount)).minus(dec(l.cancelledAmount)), dec(0)).toFixed(2),
    })) ?? null,
    deadlineChanges,
  };
}

export type VideoView = "tableau" | "kanban" | "a-attribuer" | "a-valider" | "en-retard" | "mes-videos" | "bloquees";

export interface VideoFilters {
  q?: string;
  client?: string;
  project?: string;
  editor?: string;
  type?: string;
  status?: string;
  priority?: string;
  from?: string;
  to?: string;
  view: VideoView;
}

export async function listVideos(actor: Actor, f: VideoFilters) {
  const today = await agencyToday();
  const where: Prisma.VideoWhereInput = { AND: [] };
  const and = where.AND as Prisma.VideoWhereInput[];
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }] });
  if (f.client) and.push({ project: { clientId: f.client } });
  if (f.project) and.push({ projectId: f.project });
  if (f.editor) and.push({ assignments: { some: { editorId: f.editor, status: { not: "CANCELLED" } } } });
  if (f.type) and.push({ type: f.type as VideoType });
  if (f.priority) and.push({ priority: f.priority as Priority });
  if (f.from) and.push({ clientDeadline: { gte: new Date(`${f.from}T00:00:00Z`) } });
  if (f.to) and.push({ clientDeadline: { lte: new Date(`${f.to}T00:00:00Z`) } });
  if (f.status) and.push({ status: f.status as VideoStatus });
  switch (f.view) {
    case "a-attribuer":
      and.push({ status: "TO_ASSIGN" });
      break;
    case "a-valider":
      and.push({ status: { in: TO_VALIDATE_STATUSES } });
      break;
    case "en-retard":
      and.push({
        status: { notIn: [...CLOSED_VIDEO_STATUSES, "APPROVED"] },
        OR: [{ clientDeadline: { lt: new Date(`${today}T00:00:00Z`) } }, { internalDeadline: { lt: new Date(`${today}T00:00:00Z`) } }],
      });
      break;
    case "bloquees":
      and.push({ isBlocked: true });
      break;
    case "mes-videos":
      and.push({ project: { ownerId: actor.id } });
      break;
    case "kanban":
      if (!f.status) and.push({ status: { notIn: ["ARCHIVED"] } });
      break;
    default:
      if (!f.status) and.push({ status: { notIn: ["ARCHIVED", "CANCELLED"] } });
  }
  const videos = await prisma.video.findMany({
    where,
    orderBy: [{ clientDeadline: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    take: 500,
    include: {
      project: { select: { id: true, reference: true, title: true, client: { select: { id: true, displayName: true } } } },
      assignments: { where: { status: { not: "CANCELLED" } }, select: { role: true, isPrimary: true, editor: { select: { id: true, displayName: true } } } },
    },
  });
  const fin = can(actor, "margins.project") ? await getVideosFinancials(prisma, videos.map((v) => v.id)) : null;
  return {
    today,
    rows: videos.map((v) => {
      const vf = fin?.get(v.id);
      const internal = v.internalDeadline ? toDateOnlyString(v.internalDeadline) : null;
      const client = v.clientDeadline ? toDateOnlyString(v.clientDeadline) : null;
      const closed = CLOSED_VIDEO_STATUSES.includes(v.status) || v.status === "APPROVED";
      return {
        id: v.id,
        reference: v.reference,
        title: v.title,
        type: v.type,
        status: v.status,
        priority: v.priority,
        isBlocked: v.isBlocked,
        blockedReason: v.blockedReason,
        internalDeadline: internal,
        clientDeadline: client,
        overdue: !closed && ((client !== null && client < today) || (internal !== null && internal < today)),
        dueSoon: !closed && client !== null && client >= today && client <= addDays(today, 7),
        estimatedHours: v.estimatedHours?.toFixed() ?? null,
        project: { id: v.project.id, reference: v.project.reference, title: v.project.title },
        client: v.project.client,
        editors: v.assignments.map((a) => a.editor.displayName),
        allowed: allowedTransitions(v.status, "manager"),
        finance: vf ? { revenueEur: vf.revenueEur.toFixed(2), marginEur: vf.marginEur.toFixed(2), ratePct: vf.ratePct?.toFixed(2) ?? null, status: vf.status, missing: vf.missingCostCount } : null,
      };
    }),
  };
}

export type VideoListRow = Awaited<ReturnType<typeof listVideos>>["rows"][number];

/** Fiche vidéo côté agence (admin / production). */
export async function getVideoDetail(actor: Actor, id: string) {
  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, reference: true, title: true, includedRevisionRounds: true, revisionRoundDefinition: true, productionErrorPolicy: true, client: { select: { id: true, displayName: true } } } },
      links: { orderBy: { createdAt: "asc" } },
      assignments: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          editor: { select: { id: true, displayName: true, payCurrency: true } },
          directCosts: { include: { paymentAllocations: { where: { reversedAt: null }, select: { amount: true } } } },
        },
      },
      versions: { orderBy: { number: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
      checklist: { orderBy: { position: "asc" } },
      statusEvents: { orderBy: { createdAt: "desc" }, take: 30 },
      deadlineChanges: { orderBy: { createdAt: "desc" }, take: 20 },
      changeRequests: { orderBy: { createdAt: "desc" }, include: { editor: { select: { displayName: true } } } },
      timeEntries: { orderBy: { workedOn: "desc" }, take: 30, include: { user: { select: { name: true } } } },
    },
  });
  if (!video) throw new NotFoundError();
  // Sans accès aux coûts, les montants ne quittent pas la couche serveur.
  if (!can(actor, "costs.read")) {
    for (const a of video.assignments) a.directCosts = [];
    for (const c of video.changeRequests) {
      c.clientPrice = null;
      c.editorCost = null;
    }
  }
  const userIds = [...new Set([...video.statusEvents.map((e) => e.actorId), ...video.feedback.map((f) => f.authorId), ...video.versions.map((v) => v.authorId), ...video.deadlineChanges.map((d) => d.actorId)].filter(Boolean) as string[])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const rounds = await revisionRoundsUsed(id);
  const finance = can(actor, "margins.project") ? (await getVideosFinancials(prisma, [id])).get(id) : null;
  const otherCosts = can(actor, "costs.read")
    ? await prisma.directCost.findMany({ where: { videoId: id, assignmentId: null }, orderBy: { createdAt: "asc" } })
    : null;
  const allocations = can(actor, "sales.read")
    ? await prisma.revenueAllocation.findMany({ where: { videoId: id }, include: { salesOrderLine: { include: { salesOrder: { select: { id: true, reference: true, currency: true } } } } } })
    : null;
  const finalDocs = await prisma.attachment.findMany({ where: { ownerType: "VIDEO", ownerId: id }, orderBy: { createdAt: "desc" } });
  return { video, names, rounds, finance, otherCosts, allocations, finalDocs };
}

/**
 * Vue monteur d'une vidéo : uniquement ses missions, le brief, les liens autorisés,
 * les retours qui lui sont visibles et SA rémunération. Aucun prix de vente, aucune marge,
 * aucune rémunération d'un autre prestataire, aucune note interne.
 */
export async function getEditorMission(actor: Actor, videoId: string) {
  if (!actor.editorId) throw new NotFoundError();
  const mine = await prisma.assignment.findMany({
    where: { videoId, editorId: actor.editorId, status: { not: "CANCELLED" } },
    select: {
      id: true, role: true, scope: true, status: true, startOn: true, dueOn: true, estimatedHours: true, includedRevisions: true, isPrimary: true,
      rateMode: true, unitPrice: true, currency: true, quantity: true, minuteRounding: true,
      directCosts: { where: { stage: { not: "CANCELLED" } }, select: { id: true, label: true, amount: true, currency: true, stage: true, kind: true } },
    },
  });
  if (mine.length === 0) throw new NotFoundError();
  const video = await prisma.video.findUniqueOrThrow({
    where: { id: videoId },
    select: {
      id: true, reference: true, title: true, type: true, format: true, ratio: true, language: true, status: true, priority: true,
      rushDurationSec: true, expectedDurationSec: true, finalDurationSec: true, brief: true, objectives: true, audience: true,
      references: true, subtitleStyle: true, brandConstraints: true, exportInstructions: true, internalDeadline: true,
      isBlocked: true, blockedReason: true, includedRevisionRounds: true,
      project: { select: { title: true, client: { select: { displayName: true } } } },
      links: { where: { editorVisible: true }, select: { id: true, kind: true, url: true, label: true } },
      versions: { orderBy: { number: "desc" }, select: { id: true, number: true, url: true, description: true, status: true, createdAt: true, decisionNote: true, editorId: true } },
      feedback: { where: { visibleToEditor: true }, orderBy: { createdAt: "desc" }, select: { id: true, body: true, timecode: true, status: true, source: true, category: true, createdAt: true, versionId: true } },
      checklist: { orderBy: { position: "asc" }, select: { id: true, label: true, checked: true } },
    },
  });
  const paid = await prisma.supplierPaymentAllocation.groupBy({
    by: ["directCostId"],
    where: { directCostId: { in: mine.flatMap((a) => a.directCosts.map((c) => c.id)) }, reversedAt: null, payment: { status: "RECORDED" } },
    _sum: { amount: true },
  });
  const paidMap = new Map(paid.map((p) => [p.directCostId, dec(p._sum.amount ?? 0)]));
  return {
    video,
    assignments: mine.map((a) => ({
      ...a,
      unitPrice: a.unitPrice?.toFixed(2) ?? null,
      quantity: a.quantity.toFixed(),
      estimatedHours: a.estimatedHours?.toFixed() ?? null,
      directCosts: a.directCosts.map((c) => ({ ...c, amount: c.amount?.toFixed(2) ?? null, paid: (paidMap.get(c.id) ?? dec(0)).toFixed(2) })),
    })),
    allowed: allowedTransitions(video.status, "editor"),
  };
}

export async function listEditorMissions(actor: Actor) {
  if (!actor.editorId) return { today: await agencyToday(), rows: [] };
  const today = await agencyToday();
  const rows = await prisma.assignment.findMany({
    where: { editorId: actor.editorId, status: { not: "CANCELLED" }, video: { status: { notIn: ["ARCHIVED"] } } },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }],
    select: {
      id: true, role: true, status: true, dueOn: true, estimatedHours: true,
      video: { select: { id: true, reference: true, title: true, status: true, type: true, isBlocked: true, project: { select: { client: { select: { displayName: true } } } } } },
    },
  });
  return { today, rows };
}

export { ACTIVE_VIDEO_STATUSES };
