import "server-only";
import type { EditorInput, RateCardInput, UnavailabilityInput } from "@/features/editors/schemas";
import { editorSchema, rateCardSchema, unavailabilitySchema } from "@/features/editors/schemas";
import { recordAudit } from "../audit";
import { dateOrNull, decOrNull, intOrNull, str } from "../convert";
import { prisma } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { assertCan, can, type Actor } from "../policies";
import { parseDateOnly } from "@/lib/dates";
import { assertVersion } from "./common";

function editorData(d: ReturnType<typeof editorSchema.parse>, actor: Actor) {
  const data = {
    displayName: d.displayName,
    email: str(d.email)?.toLowerCase() ?? null,
    whatsapp: str(d.whatsapp),
    country: str(d.country),
    timezone: str(d.timezone),
    languages: d.languages.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 10),
    avatarUrl: str(d.avatarUrl),
    portfolioUrl: str(d.portfolioUrl),
    skills: d.skills,
    formats: d.formats,
    level: d.level === "" ? null : d.level,
    availabilityNote: str(d.availabilityNote),
    status: d.status,
    payCurrency: d.payCurrency,
    paymentTerms: str(d.paymentTerms),
    internalNotes: str(d.internalNotes),
    weeklyCapacityHours: decOrNull(d.weeklyCapacityHours)?.toFixed(2) ?? null,
    archivedAt: d.status === "ARCHIVED" ? new Date() : null,
  };
  // L'appréciation privée n'est modifiable que par un administrateur.
  return can(actor, "editors.appraisal") ? { ...data, privateAppraisal: str(d.privateAppraisal) } : data;
}

export async function createEditor(actor: Actor, input: EditorInput): Promise<{ id: string }> {
  assertCan(actor, "editors.write");
  const d = editorSchema.parse(input);
  const editor = await prisma.editorProfile.create({ data: editorData(d, actor) });
  await recordAudit(prisma, { actorId: actor.id, action: "editor.create", entityType: "EditorProfile", entityId: editor.id });
  return { id: editor.id };
}

export async function updateEditor(actor: Actor, id: string, input: EditorInput): Promise<{ id: string }> {
  assertCan(actor, "editors.write");
  const d = editorSchema.parse(input);
  const current = await prisma.editorProfile.findUnique({ where: { id } });
  if (!current) throw new NotFoundError();
  assertVersion(current.version, d.version);
  const data = editorData(d, actor);
  await prisma.editorProfile.update({
    where: { id },
    data: { ...data, archivedAt: d.status === "ARCHIVED" ? (current.archivedAt ?? new Date()) : null, version: { increment: 1 } },
  });
  await recordAudit(prisma, { actorId: actor.id, action: "editor.update", entityType: "EditorProfile", entityId: id });
  return { id };
}

/** Tarifs négociés : réservés à l'administration. Une modification ne touche jamais les missions existantes. */
export async function saveRateCard(actor: Actor, input: RateCardInput): Promise<{ id: string }> {
  assertCan(actor, "rates.write");
  const d = rateCardSchema.parse(input);
  if (d.validTo && d.validTo < d.validFrom) throw new DomainError("La fin de validité précède le début.");
  if (d.mode === "PER_FINAL_MINUTE" && !d.minuteRounding) {
    throw new DomainError("Précisez la règle d'arrondi pour un tarif à la minute.");
  }
  const data = {
    label: d.label,
    videoType: d.videoType === "" ? null : d.videoType,
    productionRole: d.productionRole === "" ? null : d.productionRole,
    mode: d.mode,
    unitPrice: decOrNull(d.unitPrice)!.toFixed(2),
    currency: d.currency,
    unitLabel: str(d.unitLabel),
    defaultQuantity: decOrNull(d.defaultQuantity)?.toFixed(3) ?? null,
    minuteRounding: d.minuteRounding === "" ? null : d.minuteRounding,
    includedRevisions: intOrNull(d.includedRevisions),
    validFrom: parseDateOnly(d.validFrom),
    validTo: dateOrNull(d.validTo),
    notes: str(d.notes),
  };
  const card = d.id
    ? await prisma.rateCard.update({ where: { id: d.id, editorId: d.editorId }, data })
    : await prisma.rateCard.create({ data: { ...data, editorId: d.editorId } });
  await recordAudit(prisma, { actorId: actor.id, action: d.id ? "rate.update" : "rate.create", entityType: "RateCard", entityId: card.id, after: data });
  return { id: card.id };
}

export async function deactivateRateCard(actor: Actor, id: string) {
  assertCan(actor, "rates.write");
  await prisma.rateCard.update({ where: { id }, data: { active: false } });
  await recordAudit(prisma, { actorId: actor.id, action: "rate.deactivate", entityType: "RateCard", entityId: id });
}

export async function addUnavailability(actor: Actor, input: UnavailabilityInput) {
  const d = unavailabilitySchema.parse(input);
  const own = actor.editorId === d.editorId;
  if (!own && !can(actor, "editors.write")) throw new ForbiddenError();
  if (d.endsOn < d.startsOn) throw new DomainError("La date de fin précède la date de début.");
  const row = await prisma.editorUnavailability.create({
    data: { editorId: d.editorId, startsOn: parseDateOnly(d.startsOn), endsOn: parseDateOnly(d.endsOn), reason: str(d.reason) },
  });
  return { id: row.id };
}

export async function removeUnavailability(actor: Actor, id: string) {
  const row = await prisma.editorUnavailability.findUnique({ where: { id } });
  if (!row) throw new NotFoundError();
  if (row.editorId !== actor.editorId && !can(actor, "editors.write")) throw new ForbiddenError();
  await prisma.editorUnavailability.delete({ where: { id } });
}
