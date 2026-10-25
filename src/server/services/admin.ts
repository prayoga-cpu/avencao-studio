import "server-only";
import type { AgencySettingsInput, TemplateInput } from "@/features/settings/schemas";
import { agencySettingsSchema, templateSchema } from "@/features/settings/schemas";
import { recordAudit } from "../audit";
import { decOrNull, intOrNull, str } from "../convert";
import { prisma } from "../db";
import { DomainError } from "../errors";
import { assertCan, type Actor } from "../policies";
import { assertVersion } from "./common";

export async function updateAgencySettings(actor: Actor, input: AgencySettingsInput) {
  assertCan(actor, "settings.manage");
  const d = agencySettingsSchema.parse(input);
  const current = await prisma.agencySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  assertVersion(current.version, d.version);
  const data = {
    name: d.name,
    timezone: d.timezone,
    marginThresholdPct: decOrNull(d.marginThresholdPct)!.toFixed(2),
    ownerHourlyRate: decOrNull(d.ownerHourlyRate)?.toFixed(2) ?? null,
    ownerTimeIncludedInCosts: d.ownerTimeIncludedInCosts,
    defaultIncludedRevisions: intOrNull(d.defaultIncludedRevisions) ?? 2,
    revisionRoundDefinition: d.revisionRoundDefinition,
    productionErrorPolicy: d.productionErrorPolicy,
    defaultMinuteRounding: d.defaultMinuteRounding,
    nonRecoverableVatInCost: d.nonRecoverableVatInCost,
    overheadMethod: d.overheadMethod,
    defaultPaymentTermsDays: intOrNull(d.defaultPaymentTermsDays) ?? 30,
    videoRefPrefix: d.videoRefPrefix,
    deadlineSoonDays: intOrNull(d.deadlineSoonDays) ?? 3,
    maxUploadMb: Number(d.maxUploadMb),
  };
  await prisma.agencySettings.update({ where: { id: 1 }, data: { ...data, version: { increment: 1 } } });
  await recordAudit(prisma, { actorId: actor.id, action: "settings.update", entityType: "AgencySettings", entityId: "1", before: current, after: data });
}

export async function saveTemplate(actor: Actor, input: TemplateInput) {
  assertCan(actor, "settings.manage");
  const d = templateSchema.parse(input);
  const data = {
    name: d.name,
    description: str(d.description),
    videoType: d.videoType,
    defaultVideoCount: intOrNull(d.defaultVideoCount) ?? 1,
    defaultRatio: str(d.defaultRatio),
    defaultFormat: str(d.defaultFormat),
    defaultExpectedSec: intOrNull(d.defaultExpectedSec),
    defaultIncludedRevisions: intOrNull(d.defaultIncludedRevisions),
    defaultEstimatedHours: decOrNull(d.defaultEstimatedHours)?.toFixed(2) ?? null,
    titlePattern: d.titlePattern,
    active: d.active,
  };
  if (data.defaultVideoCount < 1 || data.defaultVideoCount > 60) throw new DomainError("Entre 1 et 60 vidéos.");
  const t = d.id ? await prisma.projectTemplate.update({ where: { id: d.id }, data }) : await prisma.projectTemplate.create({ data });
  await recordAudit(prisma, { actorId: actor.id, action: "template.save", entityType: "ProjectTemplate", entityId: t.id, after: data });
  return { id: t.id };
}

export async function addChecklistItem(actor: Actor, label: string) {
  assertCan(actor, "settings.manage");
  const clean = label.trim().slice(0, 120);
  if (!clean) throw new DomainError("Libellé obligatoire.");
  const max = await prisma.checklistTemplateItem.aggregate({ _max: { position: true } });
  await prisma.checklistTemplateItem.create({ data: { label: clean, position: (max._max.position ?? 0) + 1 } });
}

export async function toggleChecklistItem(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "settings.manage");
  await prisma.checklistTemplateItem.update({ where: { id }, data: { active } });
}

export async function addExpenseCategory(actor: Actor, name: string) {
  assertCan(actor, "settings.manage");
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new DomainError("Nom obligatoire.");
  await prisma.expenseCategory.upsert({ where: { name: clean }, update: { active: true }, create: { name: clean } });
}

export async function toggleExpenseCategory(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "settings.manage");
  await prisma.expenseCategory.update({ where: { id }, data: { active } });
}
