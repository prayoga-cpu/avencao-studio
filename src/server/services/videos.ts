import "server-only";
/**
 * Workflow vidéo, versions, retours, checklist, liens et temps passé.
 * Aucune transition de production ne crée ni ne simule un mouvement financier.
 */
import type { BulkVideoInput, FeedbackInput, LinkInput, ReviewInput, TimeEntryInput, TransitionInput, VersionInput } from "@/features/production/schemas";
import {
  BULK_STEP_MAX, blockSchema, bulkVideoSchema, feedbackSchema, linkSchema, reviewSchema, timeEntrySchema, transitionSchema, versionSchema,
} from "@/features/production/schemas";
import type { VideoStatus } from "@/generated/prisma/enums";
import { VIDEO_STATUS } from "@/lib/labels";
import { parseDateOnly } from "@/lib/dates";
import { dec, parseDecimalInput, sum } from "@/lib/money";
import { recordAudit } from "../audit";
import { groupRefusals, refusalMessage, type BulkRefusal } from "../bulk";
import { str } from "../convert";
import { prisma, type Tx } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { CLOSED_VIDEO_STATUSES, checkTransition, type WorkflowActor } from "../domain/video-workflow";
import { isBelowThreshold } from "../domain/profitability";
import { notify, staffUserIds, adminUserIds } from "../notifications";
import { can, isStaff, type Actor } from "../policies";
import { getSettings } from "../settings";
import { agencyToday } from "./common";
import { getVideosFinancials } from "./profitability";
import { syncProjectAutoAllocations } from "./sales";

async function editorIsAssigned(actor: Actor, videoId: string): Promise<boolean> {
  if (!actor.editorId) return false;
  const n = await prisma.assignment.count({ where: { videoId, editorId: actor.editorId, status: { not: "CANCELLED" } } });
  return n > 0;
}

/** Acteur du workflow : responsable (admin/production) ou monteur affecté. */
async function workflowActor(actor: Actor, videoId: string): Promise<WorkflowActor> {
  if (can(actor, "videos.write")) return "manager";
  if (can(actor, "missions.own") && (await editorIsAssigned(actor, videoId))) return "editor";
  throw new ForbiddenError();
}

async function assignedEditorUserIds(tx: Tx, videoId: string): Promise<string[]> {
  const rows = await tx.assignment.findMany({
    where: { videoId, status: { not: "CANCELLED" } },
    select: { editor: { select: { userId: true } } },
  });
  return rows.map((r) => r.editor.userId).filter((v): v is string => !!v);
}

export async function transitionVideo(actor: Actor, input: TransitionInput) {
  const d = transitionSchema.parse(input);
  if (d.force && actor.role !== "ADMIN") throw new ForbiddenError("Seul un administrateur peut forcer une étape.");
  const kind = await workflowActor(actor, d.videoId);
  const video = await prisma.video.findUnique({
    where: { id: d.videoId },
    include: {
      assignments: { where: { status: { not: "CANCELLED" } }, select: { id: true, editorId: true, status: true } },
      links: { where: { kind: "FINAL_EXPORT" }, select: { id: true } },
      versions: { orderBy: { number: "desc" }, take: 1 },
    },
  });
  if (!video) throw new NotFoundError();
  const finalDocs = await prisma.attachment.count({ where: { ownerType: "VIDEO", ownerId: video.id } });
  const approvedVersion = await prisma.videoVersion.count({ where: { videoId: video.id, status: "APPROVED_CLIENT" } });
  const editorVersions = kind === "editor" ? await prisma.videoVersion.count({ where: { videoId: video.id, editorId: actor.editorId } }) : 0;
  const check = checkTransition(video.status, d.to, kind, {
    reason: d.reason,
    activeAssignments: video.assignments.length,
    hasFinalDeliverable: video.links.length > 0 || finalDocs > 0,
    hasRecordedApproval: approvedVersion > 0 || !!video.approvedAt,
    editorIsAssigned: kind === "editor",
    hasSubmittedVersion: kind === "editor" ? editorVersions > 0 && video.versions[0]?.status === "PENDING" : true,
  }, { force: d.force });
  if (!check.ok) throw new DomainError(check.error!);
  await applyTransition(actor, video.id, video.status, d.to, {
    reason: str(d.reason),
    isOverride: !!check.isOverride,
    isForced: !!check.isForced,
    revenueTreatment: d.revenueTreatment,
  });
  return { id: video.id };
}

const DELIVERED_STATES: VideoStatus[] = ["DELIVERED", "ARCHIVED"];
const APPROVED_STATES: VideoStatus[] = ["APPROVED", "DELIVERED", "ARCHIVED"];

async function applyTransition(
  actor: Actor,
  videoId: string,
  from: VideoStatus,
  to: VideoStatus,
  opts: { reason: string | null; isOverride: boolean; isForced?: boolean; revenueTreatment?: "KEEP" | "CANCEL" },
) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { status: to, version: { increment: 1 } };
    if (to === "APPROVED") data.approvedAt = now;
    if (to === "DELIVERED") {
      data.deliveredAt = now;
      if (opts.isOverride) data.deliveryOverrideReason = opts.reason;
    }
    if (to === "CANCELLED") {
      data.cancelledAt = now;
      data.cancelReason = opts.reason;
    }
    if (from === "CANCELLED") {
      data.cancelledAt = null;
      data.cancelReason = null;
    }
    // Retour en arrière (réouverture ou étape forcée) : la livraison / validation n'est plus acquise.
    if (DELIVERED_STATES.includes(from) && !DELIVERED_STATES.includes(to)) data.deliveredAt = null;
    if (APPROVED_STATES.includes(from) && !APPROVED_STATES.includes(to)) data.approvedAt = null;
    const updated = await tx.video.update({ where: { id: videoId }, data, select: { projectId: true } });
    await tx.videoStatusEvent.create({
      data: { videoId, fromStatus: from, toStatus: to, actorId: actor.id, reason: opts.reason, isOverride: opts.isOverride },
    });

    if (to === "EDITING") {
      await tx.assignment.updateMany({
        where: { videoId, status: "PLANNED", ...(actor.editorId && !isStaff(actor) ? { editorId: actor.editorId } : {}) },
        data: { status: "IN_PROGRESS" },
      });
    }
    if (to === "INTERNAL_REVIEW") {
      await tx.assignment.updateMany({ where: { videoId, status: "IN_PROGRESS" }, data: { status: "SUBMITTED", submittedAt: now } });
      const video = await tx.video.findUniqueOrThrow({ where: { id: videoId }, select: { title: true, reference: true } });
      await notify(tx, {
        userIds: await staffUserIds(tx),
        type: "VALIDATION_PENDING",
        title: `À valider : ${video.title}`,
        body: video.reference,
        link: `/videos/${videoId}`,
        entityType: "Video",
        entityId: videoId,
        eventKey: `validation:${videoId}:${now.getTime()}`,
      });
    }
    if (to === "CANCELLED") {
      // Les coûts engagés/validés restent dus ; seuls les coûts « estimés » sont annulés.
      await tx.directCost.updateMany({
        where: { videoId, stage: "ESTIMATED" },
        data: { stage: "CANCELLED", cancelledAt: now, cancelReason: `Vidéo annulée : ${opts.reason ?? ""}` },
      });
      if (opts.revenueTreatment === "CANCEL") await cancelVideoRevenue(tx, actor, videoId, opts.reason ?? "Vidéo annulée");
    }
    // Forfait projet réparti automatiquement : la part d'une vidéo annulée revient aux vidéos actives.
    if (to === "CANCELLED" || from === "CANCELLED") await syncProjectAutoAllocations(tx, actor.id, updated.projectId);
    if (to === "DELIVERED") await afterDelivery(tx, videoId);
    await recordAudit(tx, {
      actorId: actor.id,
      action: opts.isForced ? "video.force_status" : opts.isOverride ? "video.deliver_override" : "video.transition",
      entityType: "Video",
      entityId: videoId,
      before: { status: from },
      after: { status: to },
      reason: opts.reason,
    });
  });
}

/**
 * Annulation du revenu d'une vidéo annulée (selon l'accord client) : la part allouée de
 * la ligne de vente est annulée à la date du jour, l'allocation est retirée.
 */
async function cancelVideoRevenue(tx: Tx, actor: Actor, videoId: string, reason: string) {
  const allocations = await tx.revenueAllocation.findMany({
    where: { videoId },
    include: { salesOrderLine: true },
  });
  for (const a of allocations) {
    const line = a.salesOrderLine;
    const cancelled = dec(line.cancelledAmount).plus(dec(a.amount));
    const cancelledEur = dec(line.cancelledAmountEur).plus(dec(a.amountEur));
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: {
        cancelledAmount: cancelled.toFixed(2),
        cancelledAmountEur: cancelledEur.toFixed(2),
        cancelledOn: parseDateOnly(await agencyToday()),
        cancelReason: reason,
      },
    });
    await tx.revenueAllocation.delete({ where: { id: a.id } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "sales.cancel_video_allocation",
      entityType: "SalesOrderLine",
      entityId: line.id,
      before: { allocation: a.amount.toString() },
      reason,
    });
  }
}

async function afterDelivery(tx: Tx, videoId: string) {
  const settings = await getSettings();
  const fin = (await getVideosFinancials(tx, [videoId])).get(videoId);
  const video = await tx.video.findUniqueOrThrow({ where: { id: videoId }, select: { title: true, reference: true } });
  if (!fin) return;
  if (fin.status === "INCOMPLETE") {
    await notify(tx, {
      userIds: await adminUserIds(tx),
      type: "MISSING_COST",
      title: `Coût manquant : ${video.title}`,
      body: `${video.reference} livrée avec ${fin.missingCostCount} coût(s) à renseigner.`,
      link: `/videos/${videoId}`,
      entityType: "Video",
      entityId: videoId,
      eventKey: `missing-cost:${videoId}`,
    });
  } else if (isBelowThreshold(fin.ratePct, dec(settings.marginThresholdPct))) {
    await notify(tx, {
      userIds: await adminUserIds(tx),
      type: "MARGIN_BELOW_THRESHOLD",
      title: `Marge sous le seuil : ${video.title}`,
      body: `${fin.ratePct?.toFixed(2)} % (seuil ${settings.marginThresholdPct.toString()} %)`,
      link: `/videos/${videoId}`,
      entityType: "Video",
      entityId: videoId,
      eventKey: `margin:${videoId}`,
    });
  }
}

export async function setBlocked(actor: Actor, input: { videoId: string; blocked: boolean; reason: string; ownerId: string }) {
  if (!can(actor, "videos.write")) throw new ForbiddenError();
  const d = blockSchema.parse(input);
  if (d.blocked && !str(d.reason)) throw new DomainError("Indiquez le motif du blocage.");
  await prisma.$transaction(async (tx) => {
    await tx.video.update({
      where: { id: d.videoId },
      data: {
        isBlocked: d.blocked,
        blockedReason: d.blocked ? str(d.reason) : null,
        blockedOwnerId: d.blocked ? str(d.ownerId) ?? actor.id : null,
        blockedAt: d.blocked ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, { actorId: actor.id, action: d.blocked ? "video.block" : "video.unblock", entityType: "Video", entityId: d.videoId, reason: str(d.reason) });
  });
  return { id: d.videoId };
}

export interface BulkVideoOutcome {
  /** Vidéos dont la priorité a changé. */
  prioritized: number;
  /** Vidéos passées à la nouvelle étape. */
  moved: number;
  /** Refus regroupés par motif, avec les références concernées. */
  refusals: BulkRefusal[];
}

/**
 * Action groupée : priorité (vidéos non clôturées) et/ou étape. Chaque changement d'étape
 * passe par le workflow et les droits, vidéo par vidéo ; les refus sont regroupés par motif.
 */
export async function bulkUpdateVideos(actor: Actor, input: BulkVideoInput): Promise<BulkVideoOutcome> {
  if (!can(actor, "videos.write")) throw new ForbiddenError();
  const d = bulkVideoSchema.parse(input);
  if (!d.priority && !d.to) throw new DomainError("Choisissez une priorité ou une étape.");
  if (d.force && actor.role !== "ADMIN") throw new ForbiddenError("Seul un administrateur peut forcer une étape.");
  if (d.force && !str(d.reason)) throw new DomainError("Un motif est obligatoire pour forcer une étape.");
  const ids = [...new Set(d.ids)];
  if (d.to && ids.length > BULK_STEP_MAX) throw new DomainError(`${BULK_STEP_MAX} vidéos maximum pour un changement d'étape groupé.`);
  const videos = await prisma.video.findMany({
    where: { id: { in: ids } },
    orderBy: { reference: "asc" },
    select: { id: true, reference: true, status: true, priority: true },
  });
  if (videos.length === 0) throw new NotFoundError();
  const refused: { ref: string; message: string }[] = [];

  let prioritized = 0;
  if (d.priority) {
    const priority = d.priority;
    const closed = (s: VideoStatus) => CLOSED_VIDEO_STATUSES.includes(s);
    for (const v of videos) if (closed(v.status)) refused.push({ ref: v.reference, message: "Vidéo clôturée : priorité inchangée." });
    const targets = videos.filter((v) => !closed(v.status) && v.priority !== priority);
    if (targets.length) {
      await prisma.$transaction(async (tx) => {
        await tx.video.updateMany({ where: { id: { in: targets.map((v) => v.id) } }, data: { priority, version: { increment: 1 } } });
        await tx.auditEvent.createMany({
          data: targets.map((v) => ({
            actorId: actor.id, action: "video.priority", entityType: "Video", entityId: v.id, before: { priority: v.priority }, after: { priority },
          })),
        });
      });
      prioritized = targets.length;
    }
  }

  let moved = 0;
  if (d.to) {
    for (const v of videos) {
      try {
        await transitionVideo(actor, { videoId: v.id, to: d.to, reason: d.reason, force: d.force });
        moved += 1;
      } catch (e) {
        refused.push({ ref: v.reference, message: refusalMessage(e) });
      }
    }
  }
  return { prioritized, moved, refusals: groupRefusals(refused) };
}

export async function addLink(actor: Actor, input: LinkInput) {
  const d = linkSchema.parse(input);
  const kind = await workflowActor(actor, d.videoId);
  if (kind === "editor" && d.kind !== "REVIEW" && d.kind !== "FINAL_EXPORT") {
    throw new ForbiddenError("Un monteur peut seulement ajouter un lien de review ou d'export final.");
  }
  const link = await prisma.videoLink.create({
    data: { videoId: d.videoId, kind: d.kind, url: d.url, label: str(d.label), editorVisible: kind === "editor" ? true : d.editorVisible, createdById: actor.id },
  });
  return { id: link.id };
}

export async function removeLink(actor: Actor, linkId: string) {
  if (!can(actor, "videos.write")) throw new ForbiddenError();
  await prisma.videoLink.delete({ where: { id: linkId } });
}

/** Dépôt d'une version (V1, V2…). Les versions précédentes sont conservées. */
export async function submitVersion(actor: Actor, input: VersionInput) {
  const d = versionSchema.parse(input);
  const kind = await workflowActor(actor, d.videoId);
  const video = await prisma.video.findUniqueOrThrow({ where: { id: d.videoId } });
  if (["DELIVERED", "ARCHIVED", "CANCELLED"].includes(video.status)) throw new DomainError("Vidéo clôturée.");
  const result = await prisma.$transaction(async (tx) => {
    const last = await tx.videoVersion.findFirst({ where: { videoId: d.videoId }, orderBy: { number: "desc" } });
    await tx.videoVersion.updateMany({ where: { videoId: d.videoId, status: "PENDING" }, data: { status: "SUPERSEDED" } });
    const version = await tx.videoVersion.create({
      data: {
        videoId: d.videoId,
        number: (last?.number ?? 0) + 1,
        url: d.url,
        description: str(d.description),
        authorId: actor.id,
        editorId: kind === "editor" ? actor.editorId : null,
      },
    });
    return version;
  });
  // Un rendu soumis passe la vidéo en validation interne si le montage était en cours.
  if (["EDITING", "INTERNAL_CHANGES", "CLIENT_CHANGES", "ASSIGNED"].includes(video.status)) {
    if (video.status === "ASSIGNED") {
      await applyTransition(actor, video.id, "ASSIGNED", "EDITING", { reason: null, isOverride: false });
      await applyTransition(actor, video.id, "EDITING", "INTERNAL_REVIEW", { reason: `V${result.number} déposée`, isOverride: false });
    } else {
      await applyTransition(actor, video.id, video.status, "INTERNAL_REVIEW", { reason: `V${result.number} déposée`, isOverride: false });
    }
  }
  return { id: result.id, number: result.number };
}

/** Décision du responsable sur une version, traduite en transition du workflow. */
export async function reviewVersion(actor: Actor, input: ReviewInput) {
  if (!can(actor, "videos.validate")) throw new ForbiddenError();
  const d = reviewSchema.parse(input);
  const version = await prisma.videoVersion.findUnique({ where: { id: d.versionId }, include: { video: true } });
  if (!version) throw new NotFoundError();
  const video = version.video;
  const map: Record<ReviewInput["outcome"], { status: "CHANGES_REQUESTED" | "APPROVED_INTERNAL" | "APPROVED_CLIENT"; to: VideoStatus; source?: "INTERNAL" | "CLIENT" }> = {
    SEND_TO_CLIENT: { status: "APPROVED_INTERNAL", to: "CLIENT_REVIEW" },
    APPROVE: { status: "APPROVED_INTERNAL", to: "APPROVED" },
    INTERNAL_CHANGES: { status: "CHANGES_REQUESTED", to: "INTERNAL_CHANGES", source: "INTERNAL" },
    CLIENT_APPROVED: { status: "APPROVED_CLIENT", to: "APPROVED" },
    CLIENT_CHANGES: { status: "CHANGES_REQUESTED", to: "CLIENT_CHANGES", source: "CLIENT" },
  };
  const rule = map[d.outcome];
  const check = checkTransition(video.status, rule.to, "manager", {
    reason: d.note,
    activeAssignments: 1,
    hasFinalDeliverable: true,
    hasRecordedApproval: true,
  });
  if (!check.ok) throw new DomainError(`Décision impossible depuis l'étape « ${VIDEO_STATUS[video.status].label} » : ${check.error}`);
  await prisma.$transaction(async (tx) => {
    await tx.videoVersion.update({
      where: { id: version.id },
      data: {
        status: rule.status,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: str(d.note),
        sharedWithClient: d.outcome === "SEND_TO_CLIENT" ? true : version.sharedWithClient,
        changesCategory: rule.status === "CHANGES_REQUESTED" ? d.category : null,
        changesSource: rule.source ?? null,
      },
    });
    if (rule.status === "CHANGES_REQUESTED" && str(d.note)) {
      await tx.feedback.create({
        data: { videoId: video.id, versionId: version.id, authorId: actor.id, source: rule.source!, body: d.note, category: d.category, visibleToEditor: true },
      });
    }
    if (rule.status === "CHANGES_REQUESTED") {
      await notify(tx, {
        userIds: await assignedEditorUserIds(tx, video.id),
        type: "NEW_FEEDBACK",
        title: `Retouches demandées : ${video.title}`,
        body: `V${version.number} — ${rule.source === "CLIENT" ? "retours client" : "retours internes"}`,
        link: `/missions/${video.id}`,
        entityType: "Video",
        entityId: video.id,
        eventKey: `changes:${version.id}`,
      });
    }
  });
  await applyTransition(actor, video.id, video.status, rule.to, { reason: str(d.note), isOverride: false });
  return { id: version.id };
}

export async function addFeedback(actor: Actor, input: FeedbackInput) {
  if (!can(actor, "videos.validate")) throw new ForbiddenError();
  const d = feedbackSchema.parse(input);
  const fb = await prisma.$transaction(async (tx) => {
    const created = await tx.feedback.create({
      data: {
        videoId: d.videoId,
        versionId: str(d.versionId),
        authorId: actor.id,
        source: d.source,
        body: d.body,
        timecode: str(d.timecode),
        category: d.category,
        visibleToEditor: d.visibleToEditor,
      },
    });
    if (d.visibleToEditor) {
      const video = await tx.video.findUniqueOrThrow({ where: { id: d.videoId }, select: { title: true } });
      await notify(tx, {
        userIds: await assignedEditorUserIds(tx, d.videoId),
        type: "NEW_FEEDBACK",
        title: `Nouveau retour : ${video.title}`,
        body: d.body.slice(0, 140),
        link: `/missions/${d.videoId}`,
        entityType: "Feedback",
        entityId: created.id,
        eventKey: `feedback:${created.id}`,
      });
    }
    return created;
  });
  return { id: fb.id };
}

export async function setFeedbackStatus(actor: Actor, feedbackId: string, status: "OPEN" | "RESOLVED" | "REJECTED") {
  const fb = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!fb) throw new NotFoundError();
  const kind = await workflowActor(actor, fb.videoId);
  if (kind === "editor" && (!fb.visibleToEditor || status === "REJECTED")) throw new ForbiddenError();
  await prisma.feedback.update({ where: { id: feedbackId }, data: { status, resolvedAt: status === "OPEN" ? null : new Date() } });
  return { id: feedbackId };
}

/** Cases de checklist : validations humaines, avec auteur et date. */
export async function toggleChecklistItem(actor: Actor, itemId: string, checked: boolean) {
  const item = await prisma.videoChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError();
  await workflowActor(actor, item.videoId);
  await prisma.videoChecklistItem.update({
    where: { id: itemId },
    data: { checked, checkedById: checked ? actor.id : null, checkedAt: checked ? new Date() : null },
  });
  return { id: itemId };
}

export async function addTimeEntry(actor: Actor, input: TimeEntryInput) {
  if (!can(actor, "time.log")) throw new ForbiddenError();
  const d = timeEntrySchema.parse(input);
  const hours = parseDecimalInput(d.hours)!;
  const minutes = hours.mul(60).round().toNumber();
  let editorId: string | null = null;
  if (d.assignmentId) {
    const a = await prisma.assignment.findUnique({ where: { id: d.assignmentId } });
    if (!a) throw new NotFoundError("Mission introuvable.");
    if (!isStaff(actor) && a.editorId !== actor.editorId) throw new ForbiddenError();
    editorId = a.editorId;
  } else if (!isStaff(actor)) {
    throw new DomainError("Sélectionnez la mission concernée.");
  }
  if (d.isOwnerTime && actor.role !== "ADMIN") throw new ForbiddenError("Seul le dirigeant saisit son propre temps valorisé.");
  const settings = await getSettings();
  const entry = await prisma.timeEntry.create({
    data: {
      userId: actor.id,
      editorId,
      assignmentId: str(d.assignmentId),
      videoId: str(d.videoId),
      workedOn: parseDateOnly(d.workedOn),
      minutes,
      isOwnerTime: d.isOwnerTime,
      valuationRate: d.isOwnerTime && settings.ownerHourlyRate ? settings.ownerHourlyRate : null,
      note: str(d.note),
    },
  });
  return { id: entry.id };
}

/** Nombre d'allers-retours client consommés (retours inclus uniquement). */
export async function revisionRoundsUsed(videoId: string): Promise<{ included: number; internalErrors: number; outOfScope: number }> {
  const versions = await prisma.videoVersion.findMany({
    where: { videoId, status: { in: ["CHANGES_REQUESTED", "SUPERSEDED"] }, changesSource: "CLIENT" },
    select: { changesCategory: true },
  });
  return {
    included: versions.filter((v) => v.changesCategory === "INCLUDED").length,
    internalErrors: versions.filter((v) => v.changesCategory === "INTERNAL_ERROR").length,
    outOfScope: versions.filter((v) => v.changesCategory === "OUT_OF_SCOPE").length,
  };
}

export function hoursFromMinutes(entries: { minutes: number }[]) {
  return sum(entries.map((e) => dec(e.minutes))).div(60);
}
