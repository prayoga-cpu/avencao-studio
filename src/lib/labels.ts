/**
 * Libellés français et tonalités visuelles des statuts. Chaque statut a toujours
 * un libellé texte : la couleur n'est jamais le seul porteur d'information.
 */
import type {
  ActivityType,
  AssignmentRole,
  AssignmentStatus,
  ClientKind,
  ClientStatus,
  CostKind,
  CostStage,
  Currency,
  EditorLevel,
  EditorStatus,
  FeedbackCategory,
  FeedbackSource,
  FeedbackStatus,
  InvoiceKind,
  LinkKind,
  MinuteRounding,
  NotificationType,
  OpportunityStage,
  PaymentMethod,
  Priority,
  ProjectStatus,
  RateMode,
  Recurrence,
  ReconciliationStatus,
  Role,
  Skill,
  UserStatus,
  VersionStatus,
  VideoStatus,
  VideoType,
  CarryOverPolicy,
  RetainerStatus,
  ChangeRequestStatus,
} from "@/generated/prisma/enums";

export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger" | "muted";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  PRODUCTION_MANAGER: "Responsable de production",
  EDITOR: "Monteur",
  CLIENT: "Client",
  VISITOR: "Visiteur",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Actif",
  DISABLED: "Désactivé",
  PENDING_REVIEW: "À revoir",
};

export const CURRENCY_LABELS: Record<Currency, string> = { EUR: "Euro (EUR)", IDR: "Roupie (IDR)", USD: "Dollar US (USD)" };

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = { COMPANY: "Entreprise", INDIVIDUAL: "Indépendant" };

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  PROSPECT: { label: "Prospect", tone: "info" },
  ACTIVE: { label: "Actif", tone: "success" },
  INACTIVE: { label: "Inactif", tone: "muted" },
  LOST: { label: "Perdu", tone: "danger" },
  ARCHIVED: { label: "Archivé", tone: "muted" },
};

export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  "NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST",
];

export const OPPORTUNITY_STAGE: Record<OpportunityStage, { label: string; tone: Tone }> = {
  NEW: { label: "Nouveau prospect", tone: "neutral" },
  CONTACTED: { label: "Contact établi", tone: "info" },
  QUALIFIED: { label: "Besoin qualifié", tone: "info" },
  PROPOSAL_SENT: { label: "Proposition envoyée", tone: "warning" },
  NEGOTIATION: { label: "Négociation", tone: "warning" },
  WON: { label: "Gagné", tone: "success" },
  LOST: { label: "Perdu", tone: "danger" },
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  NOTE: "Note",
  CALL: "Appel",
  EMAIL: "Email",
  MEETING: "Rendez-vous",
  MESSAGE: "Message",
  STAGE_CHANGE: "Changement d'étape",
  TASK: "Tâche",
};

export const EDITOR_STATUS: Record<EditorStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Actif", tone: "success" },
  INACTIVE: { label: "Inactif", tone: "muted" },
  ARCHIVED: { label: "Archivé", tone: "muted" },
};

export const EDITOR_LEVEL_LABELS: Record<EditorLevel, string> = {
  JUNIOR: "Junior",
  INTERMEDIATE: "Confirmé",
  SENIOR: "Senior",
  EXPERT: "Expert",
};

export const SKILL_LABELS: Record<Skill, string> = {
  PREMIERE_PRO: "Premiere Pro",
  AFTER_EFFECTS: "After Effects",
  DAVINCI_RESOLVE: "DaVinci Resolve",
  CAPCUT: "CapCut",
  RUSH_PREP: "Dérushage",
  SUBTITLING: "Sous-titrage",
  MOTION_DESIGN: "Motion design",
  COLOR_GRADING: "Étalonnage",
  SOUND_DESIGN: "Sound design",
  THUMBNAIL: "Miniature",
};

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  REEL: "Reel",
  SHORT: "Short",
  YOUTUBE: "Vidéo YouTube",
  VLOG: "Vlog",
  PODCAST: "Podcast",
  VSL: "VSL",
  AD: "Publicité",
  INTRO: "Intro",
  MOTION_DESIGN: "Motion design",
  OTHER: "Autre",
};

export const RATE_MODE_LABELS: Record<RateMode, string> = {
  PER_VIDEO: "Forfait par vidéo",
  HOURLY: "À l'heure",
  PER_FINAL_MINUTE: "À la minute finale",
  DAILY: "À la journée",
  MONTHLY_ENVELOPE: "Enveloppe mensuelle",
};

export const RATE_MODE_UNIT: Record<RateMode, string> = {
  PER_VIDEO: "vidéo",
  HOURLY: "heure",
  PER_FINAL_MINUTE: "minute finale",
  DAILY: "jour",
  MONTHLY_ENVELOPE: "mois",
};

export const MINUTE_ROUNDING_LABELS: Record<MinuteRounding, string> = {
  EXACT_SECOND: "À la seconde (sans arrondi)",
  CEIL_HALF_MINUTE: "Demi-minute supérieure",
  CEIL_MINUTE: "Minute supérieure",
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "muted" },
  ACTIVE: { label: "En cours", tone: "info" },
  ON_HOLD: { label: "En pause", tone: "warning" },
  COMPLETED: { label: "Terminé", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
  ARCHIVED: { label: "Archivé", tone: "muted" },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  LOW: { label: "Basse", tone: "muted" },
  NORMAL: { label: "Normale", tone: "neutral" },
  HIGH: { label: "Haute", tone: "warning" },
  URGENT: { label: "Urgente", tone: "danger" },
};

export const VIDEO_STATUSES: VideoStatus[] = [
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
  "DELIVERED",
  "ARCHIVED",
  "CANCELLED",
];

export const VIDEO_STATUS: Record<VideoStatus, { label: string; tone: Tone }> = {
  TO_PREPARE: { label: "À préparer", tone: "muted" },
  WAITING_RUSHES: { label: "En attente de rushs", tone: "warning" },
  TO_ASSIGN: { label: "À attribuer", tone: "warning" },
  ASSIGNED: { label: "Attribuée", tone: "info" },
  EDITING: { label: "En montage", tone: "brand" },
  INTERNAL_REVIEW: { label: "En validation interne", tone: "info" },
  INTERNAL_CHANGES: { label: "Retours internes", tone: "warning" },
  CLIENT_REVIEW: { label: "En validation client", tone: "info" },
  CLIENT_CHANGES: { label: "Retours client", tone: "warning" },
  APPROVED: { label: "Validée", tone: "success" },
  DELIVERED: { label: "Livrée", tone: "success" },
  ARCHIVED: { label: "Archivée", tone: "muted" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  RUSHES: "Rushs",
  DOCUMENT: "Document",
  REVIEW: "Review (Frame.io…)",
  FINAL_EXPORT: "Export final",
  OTHER: "Autre",
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  EDIT: "Montage",
  RUSH_PREP: "Dérushage",
  MOTION: "Motion design",
  SUBTITLES: "Sous-titrage",
  COLOR: "Étalonnage",
  SOUND: "Sound design",
  THUMBNAIL: "Miniature",
  OTHER: "Autre",
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  PLANNED: { label: "Planifiée", tone: "neutral" },
  IN_PROGRESS: { label: "En cours", tone: "brand" },
  SUBMITTED: { label: "Rendue", tone: "info" },
  APPROVED: { label: "Validée", tone: "success" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const VERSION_STATUS: Record<VersionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "En attente", tone: "info" },
  CHANGES_REQUESTED: { label: "Retouches demandées", tone: "warning" },
  APPROVED_INTERNAL: { label: "Validée en interne", tone: "success" },
  APPROVED_CLIENT: { label: "Validée par le client", tone: "success" },
  SUPERSEDED: { label: "Remplacée", tone: "muted" },
};

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = { INTERNAL: "Interne", CLIENT: "Client" };

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "À traiter", tone: "warning" },
  RESOLVED: { label: "Traité", tone: "success" },
  REJECTED: { label: "Écarté", tone: "muted" },
};

export const FEEDBACK_CATEGORY: Record<FeedbackCategory, { label: string; tone: Tone }> = {
  INCLUDED: { label: "Retour inclus", tone: "neutral" },
  INTERNAL_ERROR: { label: "Erreur interne", tone: "warning" },
  OUT_OF_SCOPE: { label: "Hors périmètre", tone: "danger" },
};

export const CHANGE_REQUEST_STATUS: Record<ChangeRequestStatus, { label: string; tone: Tone }> = {
  PROPOSED: { label: "Proposée", tone: "warning" },
  ACCEPTED: { label: "Acceptée", tone: "success" },
  REJECTED: { label: "Refusée", tone: "muted" },
};

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  STANDARD: "Facture",
  DEPOSIT: "Facture d'acompte",
  FINAL: "Facture finale",
};

export type InvoicePaymentState = "DRAFT" | "ISSUED_UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export const INVOICE_PAYMENT_STATE: Record<InvoicePaymentState, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "muted" },
  ISSUED_UNPAID: { label: "Émise non réglée", tone: "warning" },
  PARTIALLY_PAID: { label: "Partiellement réglée", tone: "info" },
  PAID: { label: "Réglée", tone: "success" },
  CANCELLED: { label: "Annulée", tone: "danger" },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Virement",
  CARD: "Carte",
  PAYPAL: "PayPal",
  WISE: "Wise",
  CASH: "Espèces",
  OTHER: "Autre",
};

export const COST_KIND_LABELS: Record<CostKind, string> = {
  ASSIGNMENT: "Mission",
  PURCHASE: "Achat direct",
  ENVELOPE: "Enveloppe mensuelle",
  ADDITIONAL: "Coût additionnel",
};

export const COST_STAGE: Record<CostStage, { label: string; tone: Tone }> = {
  ESTIMATED: { label: "Estimé", tone: "muted" },
  COMMITTED: { label: "Engagé", tone: "info" },
  VALIDATED: { label: "Validé", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  NONE: "Ponctuelle",
  MONTHLY: "Mensuelle",
  QUARTERLY: "Trimestrielle",
  YEARLY: "Annuelle",
};

export const RECONCILIATION_STATUS: Record<ReconciliationStatus, { label: string; tone: Tone }> = {
  TO_RECONCILE: { label: "À rapprocher", tone: "warning" },
  LINKED_INVOICE: { label: "Rattaché à une facture", tone: "success" },
  LINKED_PAYMENT: { label: "Rattaché à un encaissement", tone: "success" },
  ARCHIVED: { label: "Archivé (informatif)", tone: "muted" },
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ASSIGNMENT_CREATED: "Mission attribuée",
  DEADLINE_SOON: "Échéance proche",
  OVERDUE: "Retard",
  NEW_FEEDBACK: "Nouveau retour",
  VALIDATION_PENDING: "Validation attendue",
  MARGIN_BELOW_THRESHOLD: "Marge sous le seuil",
  MISSING_COST: "Coût manquant",
};

export const CARRY_OVER_LABELS: Record<CarryOverPolicy, string> = {
  NONE: "Pas de report",
  NEXT_PERIOD: "Report sur la période suivante uniquement",
  UNLIMITED: "Report illimité",
};

export const RETAINER_STATUS: Record<RetainerStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Actif", tone: "success" },
  PAUSED: { label: "En pause", tone: "warning" },
  ENDED: { label: "Terminé", tone: "muted" },
};

export function enumOptions<T extends string>(labels: Record<T, string | { label: string }>) {
  return (Object.keys(labels) as T[]).map((value) => {
    const entry = labels[value];
    return { value, label: typeof entry === "string" ? entry : entry.label };
  });
}
