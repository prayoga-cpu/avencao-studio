"use server";

import type {
  AssignmentInput,
  AssignmentUpdateInput,
  BulkVideosInput,
  ChangeRequestInput,
  FeedbackInput,
  LinkInput,
  ProjectInput,
  ReviewInput,
  TimeEntryInput,
  TransitionInput,
  VersionInput,
  VideoInput,
} from "./schemas";
import type { Priority, VideoStatus } from "@/generated/prisma/enums";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { assertCan } from "@/server/policies";
import { revalidateApp } from "@/server/revalidate";
import * as assignments from "@/server/services/assignments";
import * as changeRequests from "@/server/services/change-requests";
import * as projects from "@/server/services/projects";
import * as videos from "@/server/services/videos";

function done<T>(r: T): T {
  revalidateApp();
  return r;
}

export async function createProjectAction(input: ProjectInput) {
  return safeAction(async () => done(await projects.createProject(await actorFor("projects.write"), input)), "Projet créé.");
}

export async function updateProjectAction(id: string, input: ProjectInput & { deadlineReason?: string }) {
  return safeAction(async () => done(await projects.updateProject(await actorFor("projects.write"), id, input)), "Projet enregistré.");
}

export async function createVideoAction(input: VideoInput) {
  return safeAction(async () => done(await projects.createVideo(await actorFor("videos.write"), input)), "Vidéo créée.");
}

export async function createVideosBulkAction(input: BulkVideosInput) {
  return safeAction(async () => {
    const r = await projects.createVideosBulk(await actorFor("videos.write"), input);
    return done(r);
  }, "Vidéos ajoutées.");
}

export async function updateVideoAction(id: string, input: VideoInput) {
  return safeAction(async () => done(await projects.updateVideo(await actorFor("videos.write"), id, input)), "Vidéo enregistrée.");
}

export async function transitionVideoAction(input: TransitionInput) {
  return safeAction(async () => done(await videos.transitionVideo(await actorFor(), input)), "Étape mise à jour.");
}

/** Action groupée : chaque vidéo est contrôlée individuellement (droits + workflow). */
export async function bulkVideoAction(input: { ids: string[]; to?: VideoStatus; priority?: Priority; reason?: string }) {
  return safeAction(async () => {
    const actor = await actorFor("videos.write");
    if (input.ids.length === 0 || input.ids.length > 200) throw new DomainError("Sélection invalide.");
    let ok = 0;
    const errors: string[] = [];
    if (input.priority) {
      const r = await prisma.video.updateMany({ where: { id: { in: input.ids } }, data: { priority: input.priority } });
      ok = r.count;
    }
    if (input.to) {
      for (const id of input.ids) {
        try {
          await videos.transitionVideo(actor, { videoId: id, to: input.to, reason: input.reason ?? "" });
          ok += 1;
        } catch (e) {
          const v = await prisma.video.findUnique({ where: { id }, select: { reference: true } });
          errors.push(`${v?.reference ?? id} : ${(e as Error).message}`);
        }
      }
    }
    revalidateApp();
    return { ok, errors };
  });
}

export async function setBlockedAction(input: { videoId: string; blocked: boolean; reason: string; ownerId: string }) {
  return safeAction(async () => done(await videos.setBlocked(await actorFor("videos.write"), input)), input.blocked ? "Vidéo marquée bloquée." : "Blocage levé.");
}

export async function addLinkAction(input: LinkInput) {
  return safeAction(async () => done(await videos.addLink(await actorFor(), input)), "Lien ajouté.");
}

export async function removeLinkAction(linkId: string) {
  return safeAction(async () => {
    await videos.removeLink(await actorFor("videos.write"), linkId);
    return done(null);
  }, "Lien supprimé.");
}

export async function submitVersionAction(input: VersionInput) {
  return safeAction(async () => done(await videos.submitVersion(await actorFor(), input)), "Version déposée.");
}

export async function reviewVersionAction(input: ReviewInput) {
  return safeAction(async () => done(await videos.reviewVersion(await actorFor("videos.validate"), input)), "Décision enregistrée.");
}

export async function addFeedbackAction(input: FeedbackInput) {
  return safeAction(async () => done(await videos.addFeedback(await actorFor("videos.validate"), input)), "Retour ajouté.");
}

export async function setFeedbackStatusAction(id: string, status: "OPEN" | "RESOLVED" | "REJECTED") {
  return safeAction(async () => done(await videos.setFeedbackStatus(await actorFor(), id, status)), "Retour mis à jour.");
}

export async function toggleChecklistAction(itemId: string, checked: boolean) {
  return safeAction(async () => done(await videos.toggleChecklistItem(await actorFor(), itemId, checked)));
}

export async function addTimeEntryAction(input: TimeEntryInput) {
  return safeAction(async () => done(await videos.addTimeEntry(await actorFor("time.log"), input)), "Temps enregistré.");
}

export async function previewAssignmentAction(input: AssignmentInput) {
  return safeAction(async () => assignments.previewAssignment(await actorFor("assignments.write"), input));
}

export async function assignEditorAction(input: AssignmentInput) {
  return safeAction(async () => done(await assignments.assignEditor(await actorFor("assignments.write"), input)), "Prestataire affecté.");
}

export async function updateAssignmentAction(input: AssignmentUpdateInput) {
  return safeAction(async () => done(await assignments.updateAssignment(await actorFor("assignments.write"), input)), "Mission mise à jour.");
}

export async function validateAssignmentAction(id: string) {
  return safeAction(async () => done(await assignments.validateAssignment(await actorFor("videos.validate"), id)), "Mission validée : coût passé à « validé ».");
}

export async function cancelAssignmentAction(id: string, reason: string) {
  return safeAction(async () => done(await assignments.cancelAssignment(await actorFor("assignments.write"), id, reason)), "Mission annulée.");
}

export async function setCostAmountAction(input: { costId: string; amount: string; manualFxRate: string; reason: string }) {
  return safeAction(async () => done(await assignments.setCostAmount(await actorFor("costs.write"), input)), "Coût enregistré.");
}

export async function createChangeRequestAction(input: ChangeRequestInput) {
  return safeAction(async () => done(await changeRequests.createChangeRequest(await actorFor("videos.write"), input)), "Demande enregistrée.");
}

export async function acceptChangeRequestAction(id: string, note: string, manualFxRate = "") {
  return safeAction(async () => {
    const actor = await actorFor("sales.write");
    assertCan(actor, "costs.write");
    return done(await changeRequests.acceptChangeRequest(actor, id, note, manualFxRate));
  });
}

export async function rejectChangeRequestAction(id: string, note: string) {
  return safeAction(async () => done(await changeRequests.rejectChangeRequest(await actorFor("videos.write"), id, note)), "Demande refusée.");
}

export async function moveDeadlineAction(input: { videoId: string; field: "VIDEO_INTERNAL" | "VIDEO_CLIENT"; newDate: string; reason: string }) {
  return safeAction(async () => done(await projects.moveVideoDeadline(await actorFor("videos.write"), input)), "Échéance déplacée (historique conservé).");
}
