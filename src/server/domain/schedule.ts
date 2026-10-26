/**
 * Échéances des missions. Une mission sans date propre suit l'échéance de sa vidéo : deadline
 * interne, sinon deadline client. Le planning et la charge du monteur en dépendent : une
 * vidéo planifiée par l'agence n'apparaît jamais « sans date » chez le monteur.
 */
import type { AssignmentStatus } from "@/generated/prisma/enums";

/** Missions en cours (comptées dans le planning et la charge). */
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["PLANNED", "IN_PROGRESS", "SUBMITTED"];

export function missionDueDate<T>(own: T | null | undefined, video: { internalDeadline: T | null; clientDeadline: T | null }): T | null {
  return own ?? video.internalDeadline ?? video.clientDeadline ?? null;
}
