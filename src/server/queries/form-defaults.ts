import "server-only";
/**
 * Valeurs de formulaire d'un élément existant (chaînes, "" = vide), partagées par les pages
 * « Modifier » et par les outils de modification de Claude : une mise à jour partielle part de
 * l'état actuel, avec sa version (verrou optimiste conservé).
 */
import type { ClientInput } from "@/features/clients/schemas";
import type { EditorInput } from "@/features/editors/schemas";
import type { ProjectInput, VideoInput } from "@/features/production/schemas";
import type { OpportunityInput } from "@/features/prospection/schemas";
import type { Client, EditorProfile, Opportunity, Project, Video } from "@/generated/prisma/client";
import { formatDurationSeconds, toDateOnlyString } from "@/lib/dates";

const s = (v: string | null) => v ?? "";
const d = (v: Date | null) => (v ? toDateOnlyString(v) : "");

export function clientFormDefaults(c: Client & { tags: { tag: { name: string } }[] }): ClientInput {
  return {
    displayName: c.displayName, kind: c.kind, status: c.status, legalName: s(c.legalName), email: s(c.email), phone: s(c.phone),
    whatsapp: s(c.whatsapp), country: s(c.country), billingAddress: s(c.billingAddress), vatNumber: s(c.vatNumber),
    companyRegistration: s(c.companyRegistration), website: s(c.website), instagram: s(c.instagram), tiktok: s(c.tiktok),
    youtube: s(c.youtube), linkedin: s(c.linkedin), otherSocial: s(c.otherSocial), acquisitionSource: s(c.acquisitionSource),
    ownerId: s(c.ownerId), currency: c.currency, paymentTermsDays: c.paymentTermsDays?.toString() ?? "", driveUrl: s(c.driveUrl),
    creativePreferences: s(c.creativePreferences), references: s(c.references), internalNotes: s(c.internalNotes),
    nextFollowUpOn: d(c.nextFollowUpOn), tags: c.tags.map((t) => t.tag.name).join(", "),
    contactFirstName: "", contactLastName: "", contactJobTitle: "", contactEmail: "", contactPhone: "",
    confirmDuplicate: false, version: c.version,
  };
}

export function projectFormDefaults(p: Project): ProjectInput {
  return {
    clientId: p.clientId, title: p.title, description: s(p.description), ownerId: s(p.ownerId), startOn: d(p.startOn), clientDeadline: d(p.clientDeadline),
    status: p.status, priority: p.priority, driveUrl: s(p.driveUrl), otherLinks: s(p.otherLinks),
    includedRevisionRounds: p.includedRevisionRounds?.toString() ?? "", revisionRoundDefinition: s(p.revisionRoundDefinition),
    productionErrorPolicy: s(p.productionErrorPolicy), templateId: "", videoCount: "", version: p.version,
  };
}

export function videoFormDefaults(v: Video): VideoInput {
  const dur = (sec: number | null) => (sec === null ? "" : formatDurationSeconds(sec));
  return {
    projectId: v.projectId, title: v.title, type: v.type, format: s(v.format), ratio: s(v.ratio), language: s(v.language),
    rushDuration: dur(v.rushDurationSec), expectedDuration: dur(v.expectedDurationSec), finalDuration: dur(v.finalDurationSec),
    brief: s(v.brief), objectives: s(v.objectives), audience: s(v.audience), references: s(v.references), subtitleStyle: s(v.subtitleStyle),
    brandConstraints: s(v.brandConstraints), exportInstructions: s(v.exportInstructions), priority: v.priority,
    plannedStartOn: d(v.plannedStartOn), internalDeadline: d(v.internalDeadline), clientDeadline: d(v.clientDeadline),
    includedRevisionRounds: v.includedRevisionRounds?.toString() ?? "", estimatedHours: v.estimatedHours?.toFixed() ?? "", deadlineReason: "", version: v.version,
  };
}

/** L'appréciation privée n'est lue (et réécrite) qu'avec le droit correspondant. */
export function editorFormDefaults(e: EditorProfile, canAppraise: boolean): EditorInput {
  return {
    displayName: e.displayName, email: s(e.email), whatsapp: s(e.whatsapp), country: s(e.country), timezone: s(e.timezone),
    languages: e.languages.join(", "), avatarUrl: s(e.avatarUrl), portfolioUrl: s(e.portfolioUrl), skills: e.skills, formats: e.formats,
    level: e.level ?? "", availabilityNote: s(e.availabilityNote), status: e.status, payCurrency: e.payCurrency, paymentTerms: s(e.paymentTerms),
    internalNotes: s(e.internalNotes), privateAppraisal: canAppraise ? s(e.privateAppraisal) : "",
    weeklyCapacityHours: e.weeklyCapacityHours?.toFixed() ?? "", version: e.version,
  };
}

export function opportunityFormDefaults(o: Opportunity): OpportunityInput {
  return {
    clientId: o.clientId, title: o.title, stage: o.stage, services: o.services, servicesNote: s(o.servicesNote),
    estimatedAmount: o.estimatedAmount?.toFixed(2) ?? "", currency: o.currency, probability: o.probability?.toFixed() ?? "",
    expectedCloseOn: d(o.expectedCloseOn), nextAction: s(o.nextAction), followUpOn: d(o.followUpOn), lostReason: s(o.lostReason),
    ownerId: s(o.ownerId), version: o.version,
  };
}
