import "server-only";
import type { BulkVideosInput, ProjectInput, VideoInput } from "@/features/production/schemas";
import { bulkVideosSchema, projectSchema, videoSchema } from "@/features/production/schemas";
import type { VideoType } from "@/generated/prisma/enums";
import { parseDurationInput } from "@/lib/dates";
import { VIDEO_TYPE_LABELS } from "@/lib/labels";
import { recordAudit } from "../audit";
import { dateOrNull, decOrNull, intOrNull, str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { assertCan, type Actor } from "../policies";
import { nextReference } from "../references";
import { getSettings } from "../settings";
import { agencyToday, assertVersion } from "./common";
import { repriceMinuteCostsForVideo } from "./assignments";

function projectData(d: ReturnType<typeof projectSchema.parse>) {
  return {
    clientId: d.clientId,
    title: d.title,
    description: str(d.description),
    ownerId: str(d.ownerId),
    startOn: dateOrNull(d.startOn),
    clientDeadline: dateOrNull(d.clientDeadline),
    status: d.status,
    priority: d.priority,
    driveUrl: str(d.driveUrl),
    otherLinks: str(d.otherLinks),
    includedRevisionRounds: intOrNull(d.includedRevisionRounds),
    revisionRoundDefinition: str(d.revisionRoundDefinition),
    productionErrorPolicy: str(d.productionErrorPolicy),
    templateId: str(d.templateId),
  };
}

async function copyChecklist(db: Db, videoId: string) {
  const items = await db.checklistTemplateItem.findMany({ where: { active: true }, orderBy: { position: "asc" } });
  if (items.length) {
    await db.videoChecklistItem.createMany({
      data: items.map((i) => ({ videoId, label: i.label, position: i.position })),
    });
  }
}

function titleFromPattern(pattern: string, type: VideoType, n: number, total: number): string {
  return pattern
    .replaceAll("{type}", VIDEO_TYPE_LABELS[type])
    .replaceAll("{n}", String(n).padStart(String(total).length, "0"))
    .slice(0, 200);
}

export async function createProject(actor: Actor, input: ProjectInput): Promise<{ id: string; reference: string }> {
  assertCan(actor, "projects.write");
  const d = projectSchema.parse(input);
  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) throw new NotFoundError("Client introuvable.");
  if (client.status === "ARCHIVED") throw new DomainError("Ce client est archivé.");
  const settings = await getSettings();
  const year = Number((await agencyToday()).slice(0, 4));
  const template = d.templateId ? await prisma.projectTemplate.findUnique({ where: { id: d.templateId } }) : null;
  const count = intOrNull(d.videoCount) ?? (template ? template.defaultVideoCount : 0);
  if (count > 60) throw new DomainError("60 vidéos maximum par création.");

  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, "PROJECT", year);
    const data = projectData(d);
    const project = await tx.project.create({
      data: {
        ...data,
        reference,
        ownerId: data.ownerId ?? actor.id,
        includedRevisionRounds: data.includedRevisionRounds ?? template?.defaultIncludedRevisions ?? settings.defaultIncludedRevisions,
      },
    });
    if (template && count > 0) {
      for (let i = 1; i <= count; i++) {
        const ref = await nextReference(tx, "VIDEO", year, settings.videoRefPrefix);
        const video = await tx.video.create({
          data: {
            reference: ref,
            projectId: project.id,
            title: titleFromPattern(template.titlePattern, template.videoType, i, count),
            type: template.videoType,
            ratio: template.defaultRatio,
            format: template.defaultFormat,
            expectedDurationSec: template.defaultExpectedSec,
            estimatedHours: template.defaultEstimatedHours,
            includedRevisionRounds: template.defaultIncludedRevisions,
            clientDeadline: project.clientDeadline,
            priority: project.priority,
            position: i,
          },
        });
        await copyChecklist(tx, video.id);
      }
    }
    await recordAudit(tx, { actorId: actor.id, action: "project.create", entityType: "Project", entityId: project.id, after: { reference, title: d.title, videos: count } });
    return { id: project.id, reference };
  });
}

export async function updateProject(actor: Actor, id: string, input: ProjectInput & { deadlineReason?: string }) {
  assertCan(actor, "projects.write");
  const d = projectSchema.parse(input);
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) throw new NotFoundError();
  assertVersion(current.version, d.version);
  if (current.clientId !== d.clientId) {
    const linked = await prisma.salesOrder.count({ where: { projectId: id } });
    if (linked > 0) throw new DomainError("Le client ne peut plus être changé : des ventes sont rattachées au projet.");
  }
  const data = projectData(d);
  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { ...data, archivedAt: d.status === "ARCHIVED" ? (current.archivedAt ?? new Date()) : null, version: { increment: 1 } },
    });
    if ((current.clientDeadline?.getTime() ?? null) !== (data.clientDeadline?.getTime() ?? null)) {
      await tx.deadlineChange.create({
        data: { field: "PROJECT_CLIENT", projectId: id, oldDate: current.clientDeadline, newDate: data.clientDeadline, reason: str(input.deadlineReason), actorId: actor.id },
      });
    }
    await recordAudit(tx, { actorId: actor.id, action: "project.update", entityType: "Project", entityId: id, before: current, after: data });
  });
  return { id };
}

function videoData(d: ReturnType<typeof videoSchema.parse>) {
  return {
    title: d.title,
    type: d.type,
    format: str(d.format),
    ratio: str(d.ratio),
    language: str(d.language),
    rushDurationSec: parseDurationInput(d.rushDuration),
    expectedDurationSec: parseDurationInput(d.expectedDuration),
    finalDurationSec: parseDurationInput(d.finalDuration),
    brief: str(d.brief),
    objectives: str(d.objectives),
    audience: str(d.audience),
    references: str(d.references),
    subtitleStyle: str(d.subtitleStyle),
    brandConstraints: str(d.brandConstraints),
    exportInstructions: str(d.exportInstructions),
    priority: d.priority,
    plannedStartOn: dateOrNull(d.plannedStartOn),
    internalDeadline: dateOrNull(d.internalDeadline),
    clientDeadline: dateOrNull(d.clientDeadline),
    includedRevisionRounds: intOrNull(d.includedRevisionRounds),
    estimatedHours: decOrNull(d.estimatedHours)?.toFixed(2) ?? null,
  };
}

export async function createVideo(actor: Actor, input: VideoInput): Promise<{ id: string; reference: string }> {
  assertCan(actor, "videos.write");
  const d = videoSchema.parse(input);
  const project = await prisma.project.findUnique({ where: { id: d.projectId } });
  if (!project) throw new NotFoundError("Projet introuvable.");
  const settings = await getSettings();
  const year = Number((await agencyToday()).slice(0, 4));
  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, "VIDEO", year, settings.videoRefPrefix);
    const count = await tx.video.count({ where: { projectId: d.projectId } });
    const data = videoData(d);
    const video = await tx.video.create({
      data: {
        ...data,
        reference,
        projectId: d.projectId,
        includedRevisionRounds: data.includedRevisionRounds ?? project.includedRevisionRounds,
        position: count + 1,
      },
    });
    await copyChecklist(tx, video.id);
    await recordAudit(tx, { actorId: actor.id, action: "video.create", entityType: "Video", entityId: video.id, after: { reference } });
    return { id: video.id, reference };
  });
}

/** Ajout groupé (ex. « ajouter six Reels ») avec lien de rushs commun facultatif. */
export async function createVideosBulk(actor: Actor, input: BulkVideosInput): Promise<{ ids: string[] }> {
  assertCan(actor, "videos.write");
  const d = bulkVideosSchema.parse(input);
  const project = await prisma.project.findUnique({ where: { id: d.projectId } });
  if (!project) throw new NotFoundError("Projet introuvable.");
  const settings = await getSettings();
  const year = Number((await agencyToday()).slice(0, 4));
  const count = Number(d.count);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.video.count({ where: { projectId: d.projectId } });
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const reference = await nextReference(tx, "VIDEO", year, settings.videoRefPrefix);
      const video = await tx.video.create({
        data: {
          reference,
          projectId: d.projectId,
          title: titleFromPattern(d.titlePattern, d.type, existing + i, existing + count),
          type: d.type,
          format: str(d.format),
          ratio: str(d.ratio),
          expectedDurationSec: parseDurationInput(d.expectedDuration),
          internalDeadline: dateOrNull(d.internalDeadline),
          clientDeadline: dateOrNull(d.clientDeadline) ?? project.clientDeadline,
          estimatedHours: decOrNull(d.estimatedHours)?.toFixed(2) ?? null,
          priority: d.priority,
          brief: str(d.brief),
          includedRevisionRounds: project.includedRevisionRounds,
          status: str(d.rushesUrl) ? "TO_ASSIGN" : "TO_PREPARE",
          position: existing + i,
        },
      });
      if (str(d.rushesUrl)) {
        await tx.videoLink.create({ data: { videoId: video.id, kind: "RUSHES", url: d.rushesUrl, label: "Rushs", createdById: actor.id } });
      }
      await copyChecklist(tx, video.id);
      ids.push(video.id);
    }
    await recordAudit(tx, { actorId: actor.id, action: "video.bulk_create", entityType: "Project", entityId: d.projectId, after: { count } });
    return { ids };
  });
}

export async function updateVideo(actor: Actor, id: string, input: VideoInput) {
  assertCan(actor, "videos.write");
  const d = videoSchema.parse(input);
  const current = await prisma.video.findUnique({ where: { id } });
  if (!current) throw new NotFoundError();
  assertVersion(current.version, d.version);
  if (current.projectId !== d.projectId) {
    const allocations = await prisma.revenueAllocation.count({ where: { videoId: id } });
    if (allocations > 0) throw new DomainError("Vidéo rattachée à une vente : changement de projet impossible.");
  }
  const data = videoData(d);
  await prisma.$transaction(async (tx) => {
    await tx.video.update({ where: { id }, data: { ...data, projectId: d.projectId, version: { increment: 1 } } });
    const changes: { field: "VIDEO_INTERNAL" | "VIDEO_CLIENT"; old: Date | null; next: Date | null }[] = [];
    if ((current.internalDeadline?.getTime() ?? null) !== (data.internalDeadline?.getTime() ?? null)) {
      changes.push({ field: "VIDEO_INTERNAL", old: current.internalDeadline, next: data.internalDeadline });
    }
    if ((current.clientDeadline?.getTime() ?? null) !== (data.clientDeadline?.getTime() ?? null)) {
      changes.push({ field: "VIDEO_CLIENT", old: current.clientDeadline, next: data.clientDeadline });
    }
    for (const c of changes) {
      await tx.deadlineChange.create({
        data: { field: c.field, videoId: id, oldDate: c.old, newDate: c.next, reason: str(d.deadlineReason), actorId: actor.id },
      });
    }
    if (current.finalDurationSec !== data.finalDurationSec || current.expectedDurationSec !== data.expectedDurationSec) {
      await repriceMinuteCostsForVideo(tx, actor, id);
    }
    await recordAudit(tx, { actorId: actor.id, action: "video.update", entityType: "Video", entityId: id, before: current, after: data });
  });
  return { id };
}

/** Déplacement d'une échéance (planning) : droit requis, ancienne/nouvelle date et motif consignés. */
export async function moveVideoDeadline(actor: Actor, input: { videoId: string; field: "VIDEO_INTERNAL" | "VIDEO_CLIENT"; newDate: string; reason: string }) {
  assertCan(actor, "videos.write");
  const video = await prisma.video.findUnique({ where: { id: input.videoId } });
  if (!video) throw new NotFoundError();
  const next = dateOrNull(input.newDate);
  const old = input.field === "VIDEO_INTERNAL" ? video.internalDeadline : video.clientDeadline;
  if ((old?.getTime() ?? null) === (next?.getTime() ?? null)) return { id: video.id };
  if (input.field === "VIDEO_CLIENT" && !input.reason.trim()) throw new DomainError("Un motif est requis pour déplacer une deadline client.");
  await prisma.$transaction(async (tx) => {
    await tx.video.update({
      where: { id: video.id },
      data: { ...(input.field === "VIDEO_INTERNAL" ? { internalDeadline: next } : { clientDeadline: next }), version: { increment: 1 } },
    });
    await tx.deadlineChange.create({ data: { field: input.field, videoId: video.id, oldDate: old, newDate: next, reason: str(input.reason), actorId: actor.id } });
  });
  return { id: video.id };
}
