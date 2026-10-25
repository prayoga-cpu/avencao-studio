/**
 * Workflow des vidéos : transitions autorisées et acteurs.
 * « Bloquée » est un indicateur séparé (motif + responsable) qui ne fait pas perdre l'étape.
 * Aucune transition de production ne simule un règlement financier.
 * Documentation : docs/workflow-video.md
 */
import type { VideoStatus } from "@/generated/prisma/enums";

export type WorkflowActor = "manager" | "editor";

interface TransitionRule {
  to: VideoStatus;
  actors: WorkflowActor[];
  /** Motif obligatoire (annulation, réouverture…). */
  requiresReason?: boolean;
  /** Réouverture après validation/livraison : tracée explicitement. */
  isReopen?: boolean;
}

const M: WorkflowActor[] = ["manager"];
const ME: WorkflowActor[] = ["manager", "editor"];

export const VIDEO_TRANSITIONS: Record<VideoStatus, TransitionRule[]> = {
  TO_PREPARE: [
    { to: "WAITING_RUSHES", actors: M },
    { to: "TO_ASSIGN", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  WAITING_RUSHES: [
    { to: "TO_PREPARE", actors: M },
    { to: "TO_ASSIGN", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  TO_ASSIGN: [
    { to: "ASSIGNED", actors: M },
    { to: "WAITING_RUSHES", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  ASSIGNED: [
    { to: "EDITING", actors: ME },
    { to: "TO_ASSIGN", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  EDITING: [
    { to: "INTERNAL_REVIEW", actors: ME },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  INTERNAL_REVIEW: [
    { to: "INTERNAL_CHANGES", actors: M },
    { to: "CLIENT_REVIEW", actors: M },
    { to: "APPROVED", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  INTERNAL_CHANGES: [
    { to: "EDITING", actors: ME },
    { to: "INTERNAL_REVIEW", actors: ME },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  CLIENT_REVIEW: [
    { to: "CLIENT_CHANGES", actors: M },
    { to: "APPROVED", actors: M },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  CLIENT_CHANGES: [
    { to: "EDITING", actors: ME },
    { to: "INTERNAL_REVIEW", actors: ME },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  APPROVED: [
    { to: "DELIVERED", actors: M },
    { to: "CLIENT_CHANGES", actors: M, requiresReason: true, isReopen: true },
    { to: "CANCELLED", actors: M, requiresReason: true },
  ],
  DELIVERED: [
    { to: "ARCHIVED", actors: M },
    { to: "CLIENT_CHANGES", actors: M, requiresReason: true, isReopen: true },
  ],
  ARCHIVED: [{ to: "DELIVERED", actors: M }],
  CANCELLED: [{ to: "TO_PREPARE", actors: M, requiresReason: true, isReopen: true }],
};

export interface TransitionContext {
  reason?: string | null;
  /** Nombre de missions actives sur la vidéo. */
  activeAssignments: number;
  /** Lien d'export final ou document final présent. */
  hasFinalDeliverable: boolean;
  /** Validation client/interne enregistrée (version validée ou date de validation). */
  hasRecordedApproval: boolean;
  /** Le monteur est affecté à cette vidéo. */
  editorIsAssigned?: boolean;
  /** Le monteur a déposé au moins une version. */
  hasSubmittedVersion?: boolean;
}

export interface TransitionCheck {
  ok: boolean;
  error?: string;
  isOverride?: boolean;
  isReopen?: boolean;
}

export function allowedTransitions(from: VideoStatus, actor: WorkflowActor): VideoStatus[] {
  return VIDEO_TRANSITIONS[from].filter((t) => t.actors.includes(actor)).map((t) => t.to);
}

export function checkTransition(
  from: VideoStatus,
  to: VideoStatus,
  actor: WorkflowActor,
  ctx: TransitionContext,
): TransitionCheck {
  if (from === to) return { ok: false, error: "La vidéo est déjà à cette étape." };
  const rule = VIDEO_TRANSITIONS[from].find((t) => t.to === to);
  if (!rule) return { ok: false, error: "Transition non autorisée par le workflow." };
  if (!rule.actors.includes(actor)) return { ok: false, error: "Votre rôle ne permet pas cette transition." };
  const reason = ctx.reason?.trim();
  if (rule.requiresReason && !reason) return { ok: false, error: "Un motif est obligatoire pour cette transition." };

  if (actor === "editor") {
    if (!ctx.editorIsAssigned) return { ok: false, error: "Vous n'êtes pas affecté à cette vidéo." };
    if (to === "INTERNAL_REVIEW" && !ctx.hasSubmittedVersion) {
      return { ok: false, error: "Déposez d'abord un lien de version (V1, V2…)." };
    }
  }
  if (to === "ASSIGNED" && ctx.activeAssignments === 0) {
    return { ok: false, error: "Affectez au moins un prestataire avant de passer à « Attribuée »." };
  }
  if (to === "DELIVERED" && from === "APPROVED") {
    const missing: string[] = [];
    if (!ctx.hasFinalDeliverable) missing.push("un lien ou document final");
    if (!ctx.hasRecordedApproval) missing.push("une validation enregistrée");
    if (missing.length > 0) {
      if (!reason) {
        return {
          ok: false,
          error: `La livraison exige ${missing.join(" et ")}. Une exception du responsable nécessite un motif.`,
        };
      }
      return { ok: true, isOverride: true, isReopen: false };
    }
  }
  return { ok: true, isReopen: rule.isReopen ?? false };
}

/** Étapes considérées comme « actives » (production en cours). */
export const ACTIVE_VIDEO_STATUSES: VideoStatus[] = [
  "TO_PREPARE",
  "WAITING_RUSHES",
  "TO_ASSIGN",
  "ASSIGNED",
  "EDITING",
  "INTERNAL_REVIEW",
  "INTERNAL_CHANGES",
  "CLIENT_REVIEW",
  "CLIENT_CHANGES",
  "APPROVED",
];

export const CLOSED_VIDEO_STATUSES: VideoStatus[] = ["DELIVERED", "ARCHIVED", "CANCELLED"];

export const TO_VALIDATE_STATUSES: VideoStatus[] = ["INTERNAL_REVIEW", "CLIENT_REVIEW"];

export function isOverdue(
  status: VideoStatus,
  deadline: string | null,
  today: string,
): boolean {
  if (!deadline) return false;
  if (CLOSED_VIDEO_STATUSES.includes(status) || status === "APPROVED") return false;
  return deadline < today;
}
