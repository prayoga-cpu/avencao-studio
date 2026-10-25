import { z } from "zod";
import { zCurrency, zDate, zEmail, zInt, zLongText, zRequired, zText, zUrl } from "@/lib/validation";

export const clientSchema = z.object({
  displayName: zRequired("Nom commercial", 160),
  kind: z.enum(["COMPANY", "INDIVIDUAL"]),
  status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "LOST", "ARCHIVED"]),
  legalName: zText(200),
  email: zEmail,
  phone: zText(40),
  whatsapp: zText(40),
  country: zText(80),
  billingAddress: zText(500),
  vatNumber: zText(60),
  companyRegistration: zText(60),
  website: zUrl,
  instagram: zText(200),
  tiktok: zText(200),
  youtube: zText(200),
  linkedin: zText(200),
  otherSocial: zText(300),
  acquisitionSource: zText(120),
  ownerId: zText(64),
  currency: zCurrency,
  paymentTermsDays: zInt,
  driveUrl: zUrl,
  creativePreferences: zLongText(4000),
  references: zLongText(4000),
  internalNotes: zLongText(4000),
  nextFollowUpOn: zDate,
  tags: zText(400),
  contactFirstName: zText(80),
  contactLastName: zText(80),
  contactJobTitle: zText(120),
  contactEmail: zEmail,
  contactPhone: zText(40),
  confirmDuplicate: z.boolean(),
  version: z.number().int().optional(),
});

export type ClientInput = z.input<typeof clientSchema>;

export const contactSchema = z.object({
  clientId: zRequired("Client", 64),
  id: zText(64),
  firstName: zText(80),
  lastName: zText(80),
  jobTitle: zText(120),
  email: zEmail,
  phone: zText(40),
  whatsapp: zText(40),
  isPrimary: z.boolean(),
});
export type ContactInput = z.input<typeof contactSchema>;

export const noteSchema = z.object({
  body: zRequired("Note", 10_000),
  clientId: zText(64),
  projectId: zText(64),
  videoId: zText(64),
  editorId: zText(64),
  adminOnly: z.boolean(),
});
export type NoteInput = z.input<typeof noteSchema>;

export const activitySchema = z.object({
  clientId: zText(64),
  opportunityId: zText(64),
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "MESSAGE", "TASK"]),
  subject: zText(200),
  body: zLongText(4000),
  occurredOn: zDate,
});
export type ActivityInput = z.input<typeof activitySchema>;

export const emptyClient: ClientInput = {
  displayName: "",
  kind: "COMPANY",
  status: "PROSPECT",
  legalName: "",
  email: "",
  phone: "",
  whatsapp: "",
  country: "",
  billingAddress: "",
  vatNumber: "",
  companyRegistration: "",
  website: "",
  instagram: "",
  tiktok: "",
  youtube: "",
  linkedin: "",
  otherSocial: "",
  acquisitionSource: "",
  ownerId: "",
  currency: "EUR",
  paymentTermsDays: "",
  driveUrl: "",
  creativePreferences: "",
  references: "",
  internalNotes: "",
  nextFollowUpOn: "",
  tags: "",
  contactFirstName: "",
  contactLastName: "",
  contactJobTitle: "",
  contactEmail: "",
  contactPhone: "",
  confirmDuplicate: false,
};
