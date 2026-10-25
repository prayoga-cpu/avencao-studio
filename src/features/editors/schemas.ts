import { z } from "zod";
import { zCurrency, zDate, zDateRequired, zDecimal, zEmail, zInt, zLongText, zMoneyRequired, zRequired, zText, zUrl } from "@/lib/validation";

export const SKILLS = [
  "PREMIERE_PRO", "AFTER_EFFECTS", "DAVINCI_RESOLVE", "CAPCUT", "RUSH_PREP",
  "SUBTITLING", "MOTION_DESIGN", "COLOR_GRADING", "SOUND_DESIGN", "THUMBNAIL",
] as const;
export const VIDEO_TYPES = ["REEL", "SHORT", "YOUTUBE", "VLOG", "PODCAST", "VSL", "AD", "INTRO", "MOTION_DESIGN", "OTHER"] as const;
export const RATE_MODES = ["PER_VIDEO", "HOURLY", "PER_FINAL_MINUTE", "DAILY", "MONTHLY_ENVELOPE"] as const;
export const ASSIGNMENT_ROLES = ["EDIT", "RUSH_PREP", "MOTION", "SUBTITLES", "COLOR", "SOUND", "THUMBNAIL", "OTHER"] as const;
export const MINUTE_ROUNDINGS = ["EXACT_SECOND", "CEIL_HALF_MINUTE", "CEIL_MINUTE"] as const;

export const editorSchema = z.object({
  displayName: zRequired("Nom ou pseudonyme", 120),
  email: zEmail,
  whatsapp: zText(40),
  country: zText(80),
  timezone: zText(60),
  languages: zText(200),
  avatarUrl: zUrl,
  portfolioUrl: zUrl,
  skills: z.array(z.enum(SKILLS)),
  formats: z.array(z.enum(VIDEO_TYPES)),
  level: z.enum(["", "JUNIOR", "INTERMEDIATE", "SENIOR", "EXPERT"]),
  availabilityNote: zText(300),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  payCurrency: zCurrency,
  paymentTerms: zText(300),
  internalNotes: zLongText(4000),
  privateAppraisal: zLongText(4000),
  weeklyCapacityHours: zDecimal,
  version: z.number().int().optional(),
});
export type EditorInput = z.input<typeof editorSchema>;

export const rateCardSchema = z.object({
  editorId: zRequired("Prestataire", 64),
  id: zText(64),
  label: zRequired("Libellé", 120),
  videoType: z.enum(["", ...VIDEO_TYPES]),
  productionRole: z.enum(["", ...ASSIGNMENT_ROLES]),
  mode: z.enum(RATE_MODES),
  unitPrice: zMoneyRequired,
  currency: zCurrency,
  unitLabel: zText(40),
  defaultQuantity: zDecimal,
  minuteRounding: z.enum(["", ...MINUTE_ROUNDINGS]),
  includedRevisions: zInt,
  validFrom: zDateRequired,
  validTo: zDate,
  notes: zText(500),
});
export type RateCardInput = z.input<typeof rateCardSchema>;

export const unavailabilitySchema = z.object({
  editorId: zRequired("Prestataire", 64),
  startsOn: zDateRequired,
  endsOn: zDateRequired,
  reason: zText(200),
});
export type UnavailabilityInput = z.input<typeof unavailabilitySchema>;

export const emptyEditor: EditorInput = {
  displayName: "", email: "", whatsapp: "", country: "", timezone: "", languages: "", avatarUrl: "", portfolioUrl: "",
  skills: [], formats: [], level: "", availabilityNote: "", status: "ACTIVE", payCurrency: "EUR", paymentTerms: "",
  internalNotes: "", privateAppraisal: "", weeklyCapacityHours: "",
};

