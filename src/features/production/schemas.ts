import { z } from "zod";
import { ASSIGNMENT_ROLES, MINUTE_ROUNDINGS, RATE_MODES, VIDEO_TYPES } from "@/features/editors/schemas";
import { zCurrency, zDate, zDateRequired, zDecimal, zInt, zLongText, zMoney, zRate, zRequired, zText, zUrl, zUrlRequired } from "@/lib/validation";

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const PROJECT_STATUSES = ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const VIDEO_STATUS_VALUES = [
  "TO_PREPARE", "WAITING_RUSHES", "TO_ASSIGN", "ASSIGNED", "EDITING", "INTERNAL_REVIEW", "INTERNAL_CHANGES",
  "CLIENT_REVIEW", "CLIENT_CHANGES", "APPROVED", "DELIVERED", "ARCHIVED", "CANCELLED",
] as const;
export const LINK_KINDS = ["RUSHES", "DOCUMENT", "REVIEW", "FINAL_EXPORT", "OTHER"] as const;
export const RATIOS = ["9:16", "16:9", "1:1", "4:5", "4:3", "21:9"] as const;

const zDuration = z.string().trim().refine((v) => v === "" || /^\d+$/.test(v) || /^\d+:[0-5]\d$/.test(v), "Durée « mm:ss » ou secondes");

export const projectSchema = z.object({
  clientId: zRequired("Client", 64),
  title: zRequired("Titre", 160),
  description: zLongText(4000),
  ownerId: zText(64),
  startOn: zDate,
  clientDeadline: zDate,
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PRIORITIES),
  driveUrl: zUrl,
  otherLinks: zLongText(2000),
  includedRevisionRounds: zInt,
  revisionRoundDefinition: zText(500),
  productionErrorPolicy: zText(500),
  templateId: zText(64),
  videoCount: zInt,
  version: z.number().int().optional(),
});
export type ProjectInput = z.input<typeof projectSchema>;

export const videoSchema = z.object({
  projectId: zRequired("Projet", 64),
  title: zRequired("Titre", 200),
  type: z.enum(VIDEO_TYPES),
  format: zText(40),
  ratio: zText(10),
  language: zText(40),
  rushDuration: zDuration,
  expectedDuration: zDuration,
  finalDuration: zDuration,
  brief: zLongText(10_000),
  objectives: zLongText(2000),
  audience: zText(500),
  references: zLongText(2000),
  subtitleStyle: zText(300),
  brandConstraints: zLongText(2000),
  exportInstructions: zLongText(2000),
  priority: z.enum(PRIORITIES),
  plannedStartOn: zDate,
  internalDeadline: zDate,
  clientDeadline: zDate,
  includedRevisionRounds: zInt,
  estimatedHours: zDecimal,
  deadlineReason: zText(300),
  version: z.number().int().optional(),
});
export type VideoInput = z.input<typeof videoSchema>;

export const bulkVideosSchema = z.object({
  projectId: zRequired("Projet", 64),
  count: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 60, "Entre 1 et 60 vidéos"),
  type: z.enum(VIDEO_TYPES),
  titlePattern: zRequired("Modèle de titre", 120),
  format: zText(40),
  ratio: zText(10),
  expectedDuration: zDuration,
  internalDeadline: zDate,
  clientDeadline: zDate,
  estimatedHours: zDecimal,
  priority: z.enum(PRIORITIES),
  rushesUrl: zUrl,
  brief: zLongText(10_000),
});
export type BulkVideosInput = z.input<typeof bulkVideosSchema>;

export const linkSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  kind: z.enum(LINK_KINDS),
  url: zUrlRequired,
  label: zText(120),
  editorVisible: z.boolean(),
});
export type LinkInput = z.input<typeof linkSchema>;

export const transitionSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  to: z.enum(VIDEO_STATUS_VALUES),
  reason: zText(500),
  revenueTreatment: z.enum(["KEEP", "CANCEL"]).optional(),
});
export type TransitionInput = z.input<typeof transitionSchema>;

export const blockSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  blocked: z.boolean(),
  reason: zText(300),
  ownerId: zText(64),
});

export const versionSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  url: zUrlRequired,
  description: zText(1000),
});
export type VersionInput = z.input<typeof versionSchema>;

export const reviewSchema = z.object({
  versionId: zRequired("Version", 64),
  outcome: z.enum(["SEND_TO_CLIENT", "APPROVE", "INTERNAL_CHANGES", "CLIENT_APPROVED", "CLIENT_CHANGES"]),
  category: z.enum(["INCLUDED", "INTERNAL_ERROR", "OUT_OF_SCOPE"]),
  note: zLongText(4000),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const feedbackSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  versionId: zText(64),
  source: z.enum(["INTERNAL", "CLIENT"]),
  body: zRequired("Retour", 4000),
  timecode: z.string().trim().max(20).refine((v) => v === "" || /^\d{1,2}:\d{2}(:\d{2})?$/.test(v), "Timecode « mm:ss »"),
  category: z.enum(["INCLUDED", "INTERNAL_ERROR", "OUT_OF_SCOPE"]),
  visibleToEditor: z.boolean(),
});
export type FeedbackInput = z.input<typeof feedbackSchema>;

export const timeEntrySchema = z.object({
  videoId: zText(64),
  assignmentId: zText(64),
  workedOn: zDateRequired,
  hours: z.string().trim().refine((v) => /^\d+([.,]\d{1,2})?$/.test(v) && Number(v.replace(",", ".")) > 0 && Number(v.replace(",", ".")) <= 24, "Heures entre 0 et 24"),
  isOwnerTime: z.boolean(),
  note: zText(300),
});
export type TimeEntryInput = z.input<typeof timeEntrySchema>;

export const assignmentSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  editorId: zRequired("Prestataire", 64),
  role: z.enum(ASSIGNMENT_ROLES),
  isPrimary: z.boolean(),
  scope: zText(500),
  rateCardId: zText(64),
  rateMode: z.enum(["", ...RATE_MODES]),
  unitPrice: zMoney,
  currency: z.enum(["", "EUR", "IDR", "USD"]),
  quantity: zDecimal,
  minuteRounding: z.enum(["", ...MINUTE_ROUNDINGS]),
  includedRevisions: zInt,
  estimatedHours: zDecimal,
  startOn: zDate,
  dueOn: zDate,
  manualFxRate: zRate,
});
export type AssignmentInput = z.input<typeof assignmentSchema>;

export const assignmentUpdateSchema = z.object({
  id: zRequired("Mission", 64),
  scope: zText(500),
  estimatedHours: zDecimal,
  startOn: zDate,
  dueOn: zDate,
  status: z.enum(["PLANNED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "CANCELLED"]),
  deadlineReason: zText(300),
});
export type AssignmentUpdateInput = z.input<typeof assignmentUpdateSchema>;

export const changeRequestSchema = z.object({
  videoId: zRequired("Vidéo", 64),
  title: zRequired("Intitulé", 200),
  description: zLongText(2000),
  clientPrice: zMoney,
  clientCurrency: zCurrency,
  editorCost: zMoney,
  editorCurrency: zCurrency,
  editorId: zText(64),
});
export type ChangeRequestInput = z.input<typeof changeRequestSchema>;

export const costAmountSchema = z.object({
  costId: zRequired("Coût", 64),
  amount: zMoney,
  manualFxRate: zRate,
  reason: zText(300),
});

export { zCurrency };

export const emptyVideo = (projectId = ""): VideoInput => ({
  projectId, title: "", type: "REEL", format: "", ratio: "", language: "", rushDuration: "", expectedDuration: "", finalDuration: "",
  brief: "", objectives: "", audience: "", references: "", subtitleStyle: "", brandConstraints: "", exportInstructions: "",
  priority: "NORMAL", plannedStartOn: "", internalDeadline: "", clientDeadline: "", includedRevisionRounds: "", estimatedHours: "", deadlineReason: "",
});

