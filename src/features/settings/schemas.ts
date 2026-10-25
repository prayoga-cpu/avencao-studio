import { z } from "zod";
import { zDecimal, zInt, zPercent, zRequired, zText } from "@/lib/validation";

export const agencySettingsSchema = z.object({
  name: zRequired("Nom de l'agence", 80),
  timezone: zRequired("Fuseau horaire", 60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuseau IANA invalide (ex. Asia/Makassar)"),
  marginThresholdPct: zPercent.refine((v) => v !== "", "Seuil obligatoire"),
  ownerHourlyRate: zDecimal,
  ownerTimeIncludedInCosts: z.boolean(),
  defaultIncludedRevisions: zInt,
  revisionRoundDefinition: zRequired("Définition", 500),
  productionErrorPolicy: zRequired("Règle", 500),
  defaultMinuteRounding: z.enum(["EXACT_SECOND", "CEIL_HALF_MINUTE", "CEIL_MINUTE"]),
  nonRecoverableVatInCost: z.boolean(),
  overheadMethod: z.enum(["NONE", "HOURS", "REVENUE"]),
  defaultPaymentTermsDays: zInt,
  videoRefPrefix: z.string().trim().regex(/^[A-Z]{2,6}$/, "2 à 6 lettres majuscules"),
  deadlineSoonDays: zInt,
  maxUploadMb: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 50, "Entre 1 et 50 Mo"),
  version: z.number().int().optional(),
});
export type AgencySettingsInput = z.input<typeof agencySettingsSchema>;

export const inviteSchema = z.object({
  email: z.email("Email invalide"),
  name: zRequired("Nom", 120),
  role: z.enum(["ADMIN", "PRODUCTION_MANAGER", "EDITOR", "VISITOR"]),
  financeAccess: z.boolean(),
  editorId: zText(64),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const templateSchema = z.object({
  id: zText(64),
  name: zRequired("Nom", 120),
  description: zText(500),
  videoType: z.enum(["REEL", "SHORT", "YOUTUBE", "VLOG", "PODCAST", "VSL", "AD", "INTRO", "MOTION_DESIGN", "OTHER"]),
  defaultVideoCount: zInt,
  defaultRatio: zText(10),
  defaultFormat: zText(40),
  defaultExpectedSec: zInt,
  defaultIncludedRevisions: zInt,
  defaultEstimatedHours: zDecimal,
  titlePattern: zRequired("Modèle de titre", 120),
  active: z.boolean(),
});
export type TemplateInput = z.input<typeof templateSchema>;
