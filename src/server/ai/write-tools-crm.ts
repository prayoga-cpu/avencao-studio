import "server-only";
/**
 * Outils d'écriture « CRM et production » de Claude : clients, contacts, notes, prospection,
 * projets, vidéos, monteurs, et `create_mission` qui enregistre en une seule validation une
 * nouvelle mission tapée dans la conversation (projet + vidéos + prix + monteurs).
 * Chaque outil passe par le service du CRM (mêmes contrôles que l'écran) ; aucun n'annule,
 * n'archive ni ne supprime, et un changement d'étape n'est jamais forcé.
 */
import { z } from "zod";
import { clientSchema, emptyClient, type ClientInput } from "@/features/clients/schemas";
import { ASSIGNMENT_ROLES, RATE_MODES, SKILLS, VIDEO_TYPES, emptyEditor, type EditorInput } from "@/features/editors/schemas";
import { projectPriceSchema } from "@/features/finance/schemas";
import {
  LINK_KINDS, PRIORITIES, RATIOS, assignmentSchema, emptyVideo, projectSchema, videoSchema,
  type AssignmentInput, type ProjectInput, type VideoInput,
} from "@/features/production/schemas";
import { STAGES, type OpportunityInput } from "@/features/prospection/schemas";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import { toActionError } from "../actions";
import { ATTACHMENT_WRITE } from "../attachments";
import { prisma } from "../db";
import { resolveFx } from "../fx";
import { createUploadTicket } from "../mcp/uploads";
import { can, type Actor, type Permission } from "../policies";
import { clientFormDefaults, editorFormDefaults, opportunityFormDefaults, projectFormDefaults, videoFormDefaults } from "../queries/form-defaults";
import { assignEditor } from "../services/assignments";
import { createChangeRequest } from "../services/change-requests";
import { addActivity, addNote, createClient, findClientDuplicates, saveContact, updateClient } from "../services/clients";
import { agencyToday } from "../services/common";
import { addUnavailability, createEditor, updateEditor } from "../services/editors";
import { convertOpportunityToProject, createOpportunity, updateOpportunity } from "../services/opportunities";
import { createProject, createVideo, updateProject, updateVideo } from "../services/projects";
import { setProjectPrice } from "../services/sales";
import { addFeedback, addLink, setBlocked, transitionVideo } from "../services/videos";
import type { RecordType } from "./record-links";
import {
  ToolError, amount, confirmDuplicate, currency, duplicatesFound, id, isoDate, manualFxRate, optionalAmount, optionalId, possible, ref,
  requiredDate, text, v, writeTool, type CrmTool, type PossibleDuplicate, type RecordRef, type WriteResult,
} from "./tool-kit";

const PARTIAL_NEXT = [
  "Some records were saved before a step failed (see failed): do NOT repeat the whole call.",
  "Tell the user what was saved, then complete the failed step with the dedicated tool (create_videos, set_project_price, assign_editor…) using the ids above.",
].join(" ");
const MISSION_NEXT = "Mission saved. Give the user the CRM links. Offer attach.url to store the brief or the signed quote on the project.";

// ───────────────────────────── Aides ─────────────────────────────

/** Lien complet attendu par le CRM : « exemple.com » devient « https://exemple.com ». */
const normalizeUrl = (value: string) => (!value || /^https?:\/\//i.test(value) ? value : `https://${value}`);

/** Champs facultatifs (entrée Claude en snake_case → champ de formulaire) copiés seulement s'ils sont fournis. */
function apply<T extends object>(base: T, input: Record<string, unknown>, fields: Record<string, string>, urls: string[] = []): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key];
    if (value === undefined) continue;
    out[field] = urls.includes(key) ? normalizeUrl(v(value as string)) : v(value as string | number);
  }
  return out as T;
}

/** Vérifie une entrée de service avant toute écriture (création en plusieurs étapes). */
function check(schema: z.ZodType, value: unknown, what: string) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ToolError(`${what} is invalid: ${JSON.stringify(z.flattenError(parsed.error).fieldErrors)}`);
}

function requirePermissions(actor: Actor, needs: [Permission, string][]) {
  const missing = needs.filter(([p]) => !can(actor, p)).map(([, what]) => what);
  if (missing.length) throw new ToolError(`Your role cannot ${missing.join(", ")}. Remove that part of the request or ask an administrator.`);
}

const problemOf = (error: unknown) => (error instanceof ToolError ? error.message : toActionError(error).error);

async function attachTo(actor: Actor, type: AttachmentOwner, recordId: string, label: string) {
  try {
    return await createUploadTicket(actor, { type, id: recordId, label });
  } catch {
    return undefined;
  }
}

async function clientDuplicates(input: { display_name?: string; email?: string; phone?: string; vat_number?: string; company_registration?: string; contact?: { email?: string } }, excludeId?: string) {
  const hits = await findClientDuplicates(prisma, { email: input.email, phone: input.phone, vatNumber: input.vat_number, companyRegistration: input.company_registration, contactEmail: input.contact?.email }, excludeId);
  const found: PossibleDuplicate[] = hits.map((h) => possible("CLIENT", h.id, h.displayName, h.reason));
  if (input.display_name) {
    const sameName = await prisma.client.findMany({
      where: { id: excludeId ? { not: excludeId } : undefined, OR: [{ displayName: { equals: input.display_name, mode: "insensitive" } }, { legalName: { equals: input.display_name, mode: "insensitive" } }] },
      select: { id: true, displayName: true },
    });
    for (const c of sameName) if (!found.some((f) => f.id === c.id)) found.push(possible("CLIENT", c.id, c.displayName, "same name"));
  }
  return found;
}

// ───────────────────────────── Clients et contacts ─────────────────────────────

const contactInput = z
  .object({
    first_name: text(80, "First name"),
    last_name: text(80, "Last name"),
    job_title: text(120, "Job title"),
    email: text(254, "Email"),
    phone: text(40, "Phone"),
  })
  .optional()
  .describe("Main contact person at the client");

const clientFields = {
  kind: z.enum(["COMPANY", "INDIVIDUAL"]).optional().describe("Default COMPANY"),
  status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "LOST"]).optional().describe("PROSPECT for a lead, ACTIVE for a paying client"),
  legal_name: text(200, "Legal company name"),
  email: text(254, "Main email"),
  phone: text(40, "Phone"),
  whatsapp: text(40, "WhatsApp"),
  country: text(80, "Country"),
  billing_address: text(500, "Billing address"),
  vat_number: text(60, "VAT number"),
  company_registration: text(60, "Company registration number (SIRET…)"),
  website: text(2000, "Website"),
  instagram: text(200, "Instagram handle or link"),
  tiktok: text(200, "TikTok handle or link"),
  youtube: text(200, "YouTube channel"),
  linkedin: text(200, "LinkedIn"),
  acquisition_source: text(120, "How the client found the agency"),
  owner_id: optionalId("Account owner (staff user id from get_reference_data)"),
  currency,
  payment_terms_days: z.number().int().min(0).max(365).optional().describe("Payment terms in days"),
  drive_url: text(2000, "Shared folder link"),
  creative_preferences: text(4000, "Creative preferences"),
  references: text(4000, "References"),
  internal_notes: text(4000, "Internal notes"),
  next_follow_up_on: isoDate("Next follow-up date (YYYY-MM-DD)"),
  tags: text(400, "Comma-separated tags"),
};
const CLIENT_FIELDS = {
  legal_name: "legalName", email: "email", phone: "phone", whatsapp: "whatsapp", country: "country", billing_address: "billingAddress",
  vat_number: "vatNumber", company_registration: "companyRegistration", website: "website", instagram: "instagram", tiktok: "tiktok",
  youtube: "youtube", linkedin: "linkedin", acquisition_source: "acquisitionSource", owner_id: "ownerId", payment_terms_days: "paymentTermsDays",
  drive_url: "driveUrl", creative_preferences: "creativePreferences", references: "references", internal_notes: "internalNotes",
  next_follow_up_on: "nextFollowUpOn", tags: "tags", kind: "kind", status: "status", currency: "currency",
};
const CLIENT_URLS = ["website", "drive_url"];

function newClientInput(input: Record<string, unknown> & { display_name: string; contact?: z.infer<typeof contactInput> }, defaults: Partial<ClientInput> = {}): ClientInput {
  const base = apply({ ...emptyClient, ...defaults, displayName: input.display_name }, input, CLIENT_FIELDS, CLIENT_URLS);
  const c = input.contact;
  return { ...base, contactFirstName: v(c?.first_name), contactLastName: v(c?.last_name), contactJobTitle: v(c?.job_title), contactEmail: v(c?.email), contactPhone: v(c?.phone), confirmDuplicate: true };
}

const createClientTool = writeTool({
  name: "create_client",
  label: "Nouveau client",
  about:
    "Create a client (company or individual) with its main contact. Always search_clients first: if the client exists, use it. Likely duplicates (same email, phone, VAT/registration number or name) are returned without saving.",
  anyOf: ["clients.write"],
  input: z.object({ display_name: z.string().trim().min(1).max(160).describe("Commercial name"), ...clientFields, contact: contactInput, confirm_duplicate: confirmDuplicate }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.confirm_duplicate) {
      const found = await clientDuplicates(input);
      if (found.length) return duplicatesFound(found);
    }
    const res = await createClient(actor, newClientInput(input));
    if ("duplicates" in res) return duplicatesFound(res.duplicates.map((h) => possible("CLIENT", h.id, h.displayName, h.reason)));
    return { done: "created", records: [ref("CLIENT", res.id, input.display_name)] };
  },
});

const updateClientTool = writeTool({
  name: "update_client",
  label: "Fiche client",
  about: "Update a client's details. Only the fields given are changed. Archiving is done by a person in the CRM.",
  anyOf: ["clients.write"],
  destructive: true,
  input: z.object({ client_id: id("Client"), display_name: z.string().trim().min(1).max(160).optional(), ...clientFields, confirm_duplicate: confirmDuplicate }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.client.findUnique({ where: { id: input.client_id }, include: { tags: { include: { tag: true } } } });
    if (!current) throw new ToolError("Client not found: use search_clients to get its id.");
    if (current.status === "ARCHIVED") throw new ToolError("This client is archived: a person must restore it in the CRM first.");
    const data = apply({ ...clientFormDefaults(current), ...(input.display_name ? { displayName: input.display_name } : {}) }, input, CLIENT_FIELDS, CLIENT_URLS);
    const res = await updateClient(actor, current.id, { ...data, confirmDuplicate: !!input.confirm_duplicate });
    if ("duplicates" in res) return duplicatesFound(res.duplicates.map((h) => possible("CLIENT", h.id, h.displayName, h.reason)));
    return { done: "updated", records: [ref("CLIENT", current.id, input.display_name ?? current.displayName)] };
  },
});

const saveContactTool = writeTool({
  name: "save_contact",
  label: "Contact client",
  about: "Add a contact person to a client. To update an existing contact, give its email: the client's contact with that email is updated. At least a name, email or phone.",
  anyOf: ["clients.write"],
  input: z.object({
    client_id: id("Client"),
    first_name: text(80, "First name"),
    last_name: text(80, "Last name"),
    job_title: text(120, "Job title"),
    email: text(254, "Email (an existing contact with this email is updated)"),
    phone: text(40, "Phone"),
    whatsapp: text(40, "WhatsApp"),
    is_primary: z.boolean().optional().describe("Make this the main contact"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const client = await prisma.client.findUnique({ where: { id: input.client_id }, select: { id: true, displayName: true } });
    if (!client) throw new ToolError("Client not found: use search_clients to get its id.");
    const existing = input.email ? await prisma.clientContact.findFirst({ where: { clientId: client.id, email: { equals: input.email, mode: "insensitive" } } }) : null;
    const s = (value: string | null) => value ?? "";
    const res = await saveContact(actor, {
      clientId: client.id,
      id: existing?.id ?? "",
      firstName: input.first_name ?? s(existing?.firstName ?? null),
      lastName: input.last_name ?? s(existing?.lastName ?? null),
      jobTitle: input.job_title ?? s(existing?.jobTitle ?? null),
      email: input.email ?? "",
      phone: input.phone ?? s(existing?.phone ?? null),
      whatsapp: input.whatsapp ?? s(existing?.whatsapp ?? null),
      isPrimary: input.is_primary ?? existing?.isPrimary ?? false,
    });
    const name = [input.first_name ?? existing?.firstName, input.last_name ?? existing?.lastName].filter(Boolean).join(" ") || input.email || input.phone || "—";
    return { done: existing ? "updated" : "created", records: [ref("CONTACT", res.id, `${name} · ${client.displayName}`, null, { type: "CLIENT", id: client.id })] };
  },
});

const addNoteTool = writeTool({
  name: "add_note",
  label: "Note interne",
  about: "Add an internal note (never visible to editors or clients) to a client, project, video or editor: meeting notes, call summary, email content, context from a document.",
  anyOf: ["notes.internal"],
  input: z.object({
    body: z.string().trim().min(1).max(10_000),
    client_id: optionalId("Client"),
    project_id: optionalId("Project"),
    video_id: optionalId("Video"),
    editor_id: optionalId("Editor"),
    admin_only: z.boolean().optional().describe("Visible to administrators only (admins only)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.client_id && !input.project_id && !input.video_id && !input.editor_id) throw new ToolError("Give at least one of client_id, project_id, video_id or editor_id.");
    const res = await addNote(actor, { body: input.body, clientId: v(input.client_id), projectId: v(input.project_id), videoId: v(input.video_id), editorId: v(input.editor_id), adminOnly: !!input.admin_only });
    const page: { type: RecordType; id: string } = input.video_id ? { type: "VIDEO", id: input.video_id } : input.project_id ? { type: "PROJECT", id: input.project_id } : input.client_id ? { type: "CLIENT", id: input.client_id } : { type: "EDITOR", id: input.editor_id! };
    return { done: "created", records: [ref("NOTE", res.id, input.body.slice(0, 80), null, page)] };
  },
});

const logActivityTool = writeTool({
  name: "log_activity",
  label: "Activité commerciale",
  about: "Log a sales activity (call, email, meeting, message, task) on a client and/or an opportunity, e.g. from an email the user pasted.",
  anyOf: ["prospection.write"],
  input: z.object({
    type: z.enum(["CALL", "EMAIL", "MEETING", "MESSAGE", "NOTE", "TASK"]),
    subject: text(200, "Subject"),
    body: text(4000, "Content or summary"),
    occurred_on: isoDate("Date (YYYY-MM-DD, default today)"),
    client_id: optionalId("Client"),
    opportunity_id: optionalId("Opportunity"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.client_id && !input.opportunity_id) throw new ToolError("Give client_id or opportunity_id.");
    const res = await addActivity(actor, { type: input.type, subject: v(input.subject), body: v(input.body), occurredOn: v(input.occurred_on), clientId: v(input.client_id), opportunityId: v(input.opportunity_id) });
    const page: { type: RecordType; id: string } = input.opportunity_id ? { type: "OPPORTUNITY", id: input.opportunity_id } : { type: "CLIENT", id: input.client_id! };
    return { done: "created", records: [ref("ACTIVITY", res.id, `${input.type} · ${input.subject ?? ""}`.trim(), null, page)] };
  },
});

// ───────────────────────────── Prospection ─────────────────────────────

const opportunityFields = {
  stage: z.enum(STAGES).optional().describe("Default NEW; LOST requires lost_reason"),
  services: z.array(z.enum(VIDEO_TYPES)).optional().describe("Video types concerned"),
  services_note: text(500, "Details of the services"),
  estimated_amount: optionalAmount("Estimated amount excl. VAT"),
  currency,
  probability: z.number().min(0).max(100).optional().describe("Win probability in %"),
  expected_close_on: isoDate("Expected close date (YYYY-MM-DD)"),
  next_action: text(300, "Next action"),
  follow_up_on: isoDate("Follow-up date (YYYY-MM-DD)"),
  lost_reason: text(300, "Why it was lost"),
  owner_id: optionalId("Owner (staff user id from get_reference_data)"),
};
const OPPORTUNITY_FIELDS = {
  stage: "stage", services_note: "servicesNote", estimated_amount: "estimatedAmount", currency: "currency", probability: "probability",
  expected_close_on: "expectedCloseOn", next_action: "nextAction", follow_up_on: "followUpOn", lost_reason: "lostReason", owner_id: "ownerId",
};

const createOpportunityTool = writeTool({
  name: "create_opportunity",
  label: "Nouvelle opportunité",
  about: "Add a lead or deal to the sales pipeline for a client (create_client first with status PROSPECT if the client is new).",
  anyOf: ["prospection.write"],
  input: z.object({ client_id: id("Client"), title: z.string().trim().min(1).max(160), ...opportunityFields, confirm_duplicate: confirmDuplicate }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.confirm_duplicate) {
      const same = await prisma.opportunity.findMany({ where: { clientId: input.client_id, title: { equals: input.title, mode: "insensitive" }, stage: { notIn: ["WON", "LOST"] } }, select: { id: true, title: true } });
      if (same.length) return duplicatesFound(same.map((o) => possible("OPPORTUNITY", o.id, o.title, "same client and title, still open")));
    }
    const base: OpportunityInput = { clientId: input.client_id, title: input.title, stage: "NEW", services: [], servicesNote: "", estimatedAmount: "", currency: "EUR", probability: "", expectedCloseOn: "", nextAction: "", followUpOn: "", lostReason: "", ownerId: "" };
    const res = await createOpportunity(actor, { ...apply(base, input, OPPORTUNITY_FIELDS), services: input.services ?? [] });
    return { done: "created", records: [ref("OPPORTUNITY", res.id, input.title)] };
  },
});

const updateOpportunityTool = writeTool({
  name: "update_opportunity",
  label: "Opportunité",
  about: "Update a pipeline opportunity (stage, amount, next action, follow-up…). Only the fields given are changed.",
  anyOf: ["prospection.write"],
  destructive: true,
  input: z.object({ opportunity_id: id("Opportunity"), title: z.string().trim().min(1).max(160).optional(), ...opportunityFields }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.opportunity.findUnique({ where: { id: input.opportunity_id } });
    if (!current) throw new ToolError("Opportunity not found: use list_opportunities to get its id.");
    const data = apply({ ...opportunityFormDefaults(current), ...(input.title ? { title: input.title } : {}) }, input, OPPORTUNITY_FIELDS);
    await updateOpportunity(actor, current.id, { ...data, services: input.services ?? data.services });
    return { done: "updated", records: [ref("OPPORTUNITY", current.id, input.title ?? current.title)] };
  },
});

const convertOpportunityTool = writeTool({
  name: "convert_opportunity_to_project",
  label: "Opportunité → projet",
  about: "Turn a WON opportunity into a project (the client becomes active). Then add videos with create_videos and the price with set_project_price.",
  anyOf: ["projects.write"],
  input: z.object({ opportunity_id: id("Opportunity") }),
  run: async (actor, input): Promise<WriteResult> => {
    const project = await convertOpportunityToProject(actor, input.opportunity_id);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { title: true } });
    return { done: "created", records: [ref("PROJECT", project.id, `${project.reference} · ${p.title}`, project.reference)] };
  },
});

// ───────────────────────────── Projets et vidéos ─────────────────────────────

const projectFields = {
  description: text(4000, "Description or brief of the project"),
  owner_id: optionalId("Project owner (staff user id from get_reference_data)"),
  start_on: isoDate("Start date (YYYY-MM-DD)"),
  client_deadline: isoDate("Client deadline of the project (YYYY-MM-DD)"),
  priority: z.enum(PRIORITIES).optional().describe("Default NORMAL"),
  drive_url: text(2000, "Shared folder (Drive, Dropbox…)"),
  other_links: text(2000, "Other useful links"),
  included_revision_rounds: z.number().int().min(0).max(20).optional().describe("Revision rounds included"),
};
const PROJECT_FIELDS = {
  owner_id: "ownerId", start_on: "startOn", client_deadline: "clientDeadline", priority: "priority",
  drive_url: "driveUrl", other_links: "otherLinks", included_revision_rounds: "includedRevisionRounds",
};

/** Champs de projet fournis par Claude appliqués au formulaire (description comprise). */
const applyProject = (base: ProjectInput, input: Record<string, unknown> & { description?: string }) =>
  apply(input.description === undefined ? base : { ...base, description: input.description }, input, PROJECT_FIELDS, ["drive_url"]);

const emptyProject = (clientId: string, title: string): ProjectInput => ({
  clientId, title, description: "", ownerId: "", startOn: "", clientDeadline: "", status: "ACTIVE", priority: "NORMAL", driveUrl: "", otherLinks: "",
  includedRevisionRounds: "", revisionRoundDefinition: "", productionErrorPolicy: "", templateId: "", videoCount: "",
});

const duration = (description: string) => z.union([z.string().trim().max(10), z.number().int().nonnegative()]).optional().describe(description);
const videoFields = {
  format: text(40, "Format, e.g. vertical, horizontal"),
  ratio: z.enum(RATIOS).optional(),
  language: text(40, "Language"),
  expected_duration: duration("Expected final duration (mm:ss or seconds)"),
  brief: text(10_000, "Brief: what the client wants"),
  objectives: text(2000, "Objectives"),
  audience: text(500, "Target audience"),
  references: text(2000, "References and examples"),
  subtitle_style: text(300, "Subtitle style"),
  brand_constraints: text(2000, "Brand constraints"),
  export_instructions: text(2000, "Export instructions"),
  priority: z.enum(PRIORITIES).optional().describe("Default NORMAL"),
  planned_start_on: isoDate("Planned start (YYYY-MM-DD)"),
  internal_deadline: isoDate("Internal deadline (YYYY-MM-DD)"),
  client_deadline: isoDate("Client deadline (YYYY-MM-DD)"),
  included_revision_rounds: z.number().int().min(0).max(20).optional(),
  estimated_hours: optionalAmount("Estimated editing hours"),
};
const VIDEO_FIELDS = {
  format: "format", ratio: "ratio", language: "language", expected_duration: "expectedDuration", brief: "brief", objectives: "objectives",
  audience: "audience", references: "references", subtitle_style: "subtitleStyle", brand_constraints: "brandConstraints",
  export_instructions: "exportInstructions", priority: "priority", planned_start_on: "plannedStartOn", internal_deadline: "internalDeadline",
  client_deadline: "clientDeadline", included_revision_rounds: "includedRevisionRounds", estimated_hours: "estimatedHours",
};
const newVideo = z.object({ title: z.string().trim().min(1).max(200), type: z.enum(VIDEO_TYPES), ...videoFields });
type NewVideo = z.infer<typeof newVideo>;

const videoInput = (projectId: string, video: NewVideo): VideoInput => apply({ ...emptyVideo(projectId), title: video.title, type: video.type }, video, VIDEO_FIELDS);

async function projectDuplicates(clientId: string, title: string) {
  const same = await prisma.project.findMany({
    where: { clientId, title: { equals: title, mode: "insensitive" }, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
    select: { id: true, reference: true, title: true },
  });
  return same.map((p) => possible("PROJECT", p.id, `${p.reference} · ${p.title}`, "same client and title"));
}

async function videoDuplicates(projectId: string, titles: string[]) {
  const existing = await prisma.video.findMany({ where: { projectId, status: { not: "CANCELLED" } }, select: { id: true, reference: true, title: true } });
  const wanted = new Set(titles.map((t) => t.trim().toLowerCase()));
  return existing.filter((x) => wanted.has(x.title.trim().toLowerCase())).map((x) => possible("VIDEO", x.id, `${x.reference} · ${x.title}`, "same title in this project"));
}

/** Création des vidéos une à une : en cas d'échec, les vidéos déjà créées sont renvoyées. */
async function createVideos(actor: Actor, projectId: string, videos: VideoInput[], records: RecordRef[], onStep: (step: string) => void) {
  const ids: string[] = [];
  for (const [i, video] of videos.entries()) {
    onStep(`video ${i + 1} (${video.title})`);
    const created = await createVideo(actor, { ...video, projectId });
    ids.push(created.id);
    records.push(ref("VIDEO", created.id, `${created.reference} · ${video.title}`, created.reference));
  }
  return ids;
}

const createProjectTool = writeTool({
  name: "create_project",
  label: "Nouveau projet",
  about:
    "Create a project for an existing client, optionally with its videos. For a new job described by the user (videos + price + editors), prefer create_mission which does everything in one step.",
  anyOf: ["projects.write"],
  input: z.object({
    client_id: id("Client"),
    title: z.string().trim().min(1).max(160),
    ...projectFields,
    status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD"]).optional().describe("Default ACTIVE"),
    template_id: optionalId("Project template (get_reference_data): creates its default videos"),
    video_count: z.number().int().min(1).max(60).optional().describe("With a template: number of videos to create"),
    videos: z.array(newVideo).max(60).optional().describe("Videos to create in the project"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (input.videos?.length) requirePermissions(actor, [["videos.write", "create videos"]]);
    if (!input.confirm_duplicate) {
      const found = await projectDuplicates(input.client_id, input.title);
      if (found.length) return duplicatesFound(found);
    }
    const data: ProjectInput = { ...applyProject(emptyProject(input.client_id, input.title), input), status: input.status ?? "ACTIVE", templateId: v(input.template_id), videoCount: v(input.video_count) };
    const videos = (input.videos ?? []).map((x) => videoInput("pending", x));
    videos.forEach((x, i) => check(videoSchema, x, `Video ${i + 1}`));
    const project = await createProject(actor, data);
    const records: RecordRef[] = [ref("PROJECT", project.id, `${project.reference} · ${input.title}`, project.reference)];
    let step = "videos";
    try {
      await createVideos(actor, project.id, videos, records, (s) => (step = s));
    } catch (error) {
      return { done: "partial", records, failed: { step, problem: problemOf(error) }, next: PARTIAL_NEXT };
    }
    return { done: "created", records, attach: await attachTo(actor, "PROJECT", project.id, records[0].label) };
  },
});

const updateProjectTool = writeTool({
  name: "update_project",
  label: "Projet",
  about: "Update a project (title, description, deadline, priority, owner, status…). Only the fields given are changed. A client deadline change needs deadline_reason. Cancelling or archiving is done by a person in the CRM.",
  anyOf: ["projects.write"],
  destructive: true,
  input: z.object({
    project_id: id("Project"),
    title: z.string().trim().min(1).max(160).optional(),
    ...projectFields,
    status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
    deadline_reason: text(300, "Why the client deadline changes"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.project.findUnique({ where: { id: input.project_id } });
    if (!current) throw new ToolError("Project not found: use search_projects to get its id.");
    if (current.status === "CANCELLED" || current.status === "ARCHIVED") throw new ToolError("This project is closed: a person must reopen it in the CRM.");
    const data = applyProject({ ...projectFormDefaults(current), ...(input.title ? { title: input.title } : {}), ...(input.status ? { status: input.status } : {}) }, input);
    await updateProject(actor, current.id, { ...data, deadlineReason: v(input.deadline_reason) });
    return { done: "updated", records: [ref("PROJECT", current.id, `${current.reference} · ${input.title ?? current.title}`, current.reference)] };
  },
});

const createVideosTool = writeTool({
  name: "create_videos",
  label: "Nouvelles vidéos",
  about: "Add videos to an existing project, each with its own type, brief and deadlines (1 to 60). All videos are checked before any is created.",
  anyOf: ["videos.write"],
  input: z.object({ project_id: id("Project"), videos: z.array(newVideo).min(1).max(60), confirm_duplicate: confirmDuplicate }),
  run: async (actor, input): Promise<WriteResult> => {
    const project = await prisma.project.findUnique({ where: { id: input.project_id }, select: { id: true, reference: true, title: true, status: true } });
    if (!project) throw new ToolError("Project not found: use search_projects to get its id.");
    const videos = input.videos.map((x) => videoInput(project.id, x));
    videos.forEach((x, i) => check(videoSchema, x, `Video ${i + 1}`));
    if (!input.confirm_duplicate) {
      const found = await videoDuplicates(project.id, input.videos.map((x) => x.title));
      if (found.length) return duplicatesFound(found);
    }
    const records: RecordRef[] = [];
    let step = "video 1";
    try {
      await createVideos(actor, project.id, videos, records, (s) => (step = s));
    } catch (error) {
      if (!records.length) throw error;
      return { done: "partial", records, failed: { step, problem: problemOf(error) }, next: PARTIAL_NEXT };
    }
    return { done: "created", records };
  },
});

const updateVideoTool = writeTool({
  name: "update_video",
  label: "Vidéo",
  about: "Update a video (title, type, brief, deadlines, duration, priority…). Only the fields given are changed. A deadline change is logged with deadline_reason (required for the client deadline).",
  anyOf: ["videos.write"],
  destructive: true,
  input: z.object({
    video_id: id("Video"),
    title: z.string().trim().min(1).max(200).optional(),
    type: z.enum(VIDEO_TYPES).optional(),
    ...videoFields,
    final_duration: duration("Final duration once delivered (mm:ss or seconds)"),
    deadline_reason: text(300, "Why a deadline changes"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.video.findUnique({ where: { id: input.video_id } });
    if (!current) throw new ToolError("Video not found: use search_videos to get its id.");
    const data = apply(
      { ...videoFormDefaults(current), ...(input.title ? { title: input.title } : {}), ...(input.type ? { type: input.type } : {}) },
      input,
      { ...VIDEO_FIELDS, final_duration: "finalDuration", deadline_reason: "deadlineReason" },
    );
    await updateVideo(actor, current.id, data);
    return { done: "updated", records: [ref("VIDEO", current.id, `${current.reference} · ${input.title ?? current.title}`, current.reference)] };
  },
});

const addVideoLinkTool = writeTool({
  name: "add_video_link",
  label: "Lien de vidéo",
  about: "Attach a link to a video: rushes, document, review link, final export or other (Drive, Dropbox, Frame.io…).",
  anyOf: ["videos.write"],
  input: z.object({
    video_id: id("Video"),
    kind: z.enum(LINK_KINDS),
    url: z.string().trim().min(4).max(2000),
    label: text(120, "Short label"),
    editor_visible: z.boolean().optional().describe("Visible to the assigned editors (default true)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const video = await prisma.video.findUnique({ where: { id: input.video_id }, select: { id: true, reference: true } });
    if (!video) throw new ToolError("Video not found: use search_videos to get its id.");
    const res = await addLink(actor, { videoId: video.id, kind: input.kind, url: normalizeUrl(input.url), label: v(input.label), editorVisible: input.editor_visible ?? true });
    return { done: "created", records: [ref("VIDEO_LINK", res.id, `${video.reference} · ${input.kind}`, video.reference, { type: "VIDEO", id: video.id })] };
  },
});

const addVideoFeedbackTool = writeTool({
  name: "add_video_feedback",
  label: "Retour sur une vidéo",
  about:
    "Record one feedback item on a video (from a client email, a review document or the user's notes), with an optional timecode. One call per item. visible_to_editor=true sends it to the assigned editors (notification).",
  anyOf: ["videos.validate"],
  input: z.object({
    video_id: id("Video"),
    body: z.string().trim().min(1).max(4000),
    timecode: z.string().trim().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).optional().describe("mm:ss or hh:mm:ss"),
    source: z.enum(["CLIENT", "INTERNAL"]).optional().describe("Default CLIENT"),
    category: z.enum(["INCLUDED", "INTERNAL_ERROR", "OUT_OF_SCOPE"]).optional().describe("INCLUDED (default, counts as a revision), INTERNAL_ERROR (production mistake), OUT_OF_SCOPE (extra work)"),
    visible_to_editor: z.boolean().optional().describe("Default false"),
    version_id: optionalId("Version concerned"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const video = await prisma.video.findUnique({ where: { id: input.video_id }, select: { id: true, reference: true } });
    if (!video) throw new ToolError("Video not found: use search_videos to get its id.");
    const res = await addFeedback(actor, {
      videoId: video.id, versionId: v(input.version_id), source: input.source ?? "CLIENT", body: input.body, timecode: v(input.timecode),
      category: input.category ?? "INCLUDED", visibleToEditor: input.visible_to_editor ?? false,
    });
    return { done: "created", records: [ref("FEEDBACK", res.id, `${video.reference}${input.timecode ? ` @${input.timecode}` : ""} · ${input.body.slice(0, 60)}`, video.reference, { type: "VIDEO", id: video.id })] };
  },
});

const transitionVideoTool = writeTool({
  name: "transition_video",
  label: "Étape de vidéo",
  about:
    "Move a video to another workflow step (e.g. CLIENT_REVIEW, CLIENT_CHANGES, APPROVED, DELIVERED). The CRM checks the workflow rules (assigned editor, final deliverable, recorded approval…) and refuses invalid moves. Never cancels or archives.",
  anyOf: ["videos.write"],
  destructive: true,
  input: z.object({
    video_id: id("Video"),
    to: z.enum(["TO_PREPARE", "WAITING_RUSHES", "TO_ASSIGN", "ASSIGNED", "EDITING", "INTERNAL_REVIEW", "INTERNAL_CHANGES", "CLIENT_REVIEW", "CLIENT_CHANGES", "APPROVED", "DELIVERED"]),
    reason: text(500, "Reason or comment (required by some steps)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const video = await prisma.video.findUnique({ where: { id: input.video_id }, select: { id: true, reference: true, title: true, status: true } });
    if (!video) throw new ToolError("Video not found: use search_videos to get its id.");
    await transitionVideo(actor, { videoId: video.id, to: input.to, reason: v(input.reason) });
    return { done: "updated", records: [ref("VIDEO", video.id, `${video.reference} · ${video.status} → ${input.to}`, video.reference)] };
  },
});

const setVideoBlockedTool = writeTool({
  name: "set_video_blocked",
  label: "Blocage de vidéo",
  about: "Flag a video as blocked (missing rushes, waiting for the client…) with the reason and who must unblock it, or remove the flag.",
  anyOf: ["videos.write"],
  destructive: true,
  input: z.object({
    video_id: id("Video"),
    blocked: z.boolean(),
    reason: text(300, "Why it is blocked (required when blocked=true)"),
    owner_id: optionalId("Staff user who must unblock it (default: you)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const video = await prisma.video.findUnique({ where: { id: input.video_id }, select: { id: true, reference: true, title: true } });
    if (!video) throw new ToolError("Video not found: use search_videos to get its id.");
    await setBlocked(actor, { videoId: video.id, blocked: input.blocked, reason: v(input.reason), ownerId: v(input.owner_id) });
    return { done: "updated", records: [ref("VIDEO", video.id, `${video.reference} · ${video.title}`, video.reference)] };
  },
});

const createChangeRequestTool = writeTool({
  name: "create_change_request",
  label: "Demande hors périmètre",
  about: "Record an out-of-scope request on a video (extra work asked by the client), with the price proposed to the client and the extra editor cost when known (amounts need finance access). A person accepts or rejects it in the CRM.",
  anyOf: ["videos.write"],
  input: z.object({
    video_id: id("Video"),
    title: z.string().trim().min(1).max(200),
    description: text(2000, "Details"),
    client_price: optionalAmount("Price proposed to the client, excl. VAT"),
    client_currency: z.enum(["EUR", "IDR", "USD"]).optional(),
    editor_cost: optionalAmount("Extra cost for the editor"),
    editor_currency: z.enum(["EUR", "IDR", "USD"]).optional(),
    editor_id: optionalId("Editor doing the extra work (required with editor_cost)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const video = await prisma.video.findUnique({ where: { id: input.video_id }, select: { id: true, reference: true } });
    if (!video) throw new ToolError("Video not found: use search_videos to get its id.");
    const res = await createChangeRequest(actor, {
      videoId: video.id, title: input.title, description: v(input.description), clientPrice: v(input.client_price), clientCurrency: input.client_currency ?? "EUR",
      editorCost: v(input.editor_cost), editorCurrency: input.editor_currency ?? "EUR", editorId: v(input.editor_id),
    });
    return { done: "created", records: [ref("CHANGE_REQUEST", res.id, `${video.reference} · ${input.title}`, video.reference, { type: "VIDEO", id: video.id })] };
  },
});

// ───────────────────────────── Monteurs et missions ─────────────────────────────

const rateFields = {
  rate_mode: z.enum(RATE_MODES).optional().describe("How the editor is paid for this mission (default PER_VIDEO when unit_price is given); empty = the editor's rate card"),
  unit_price: optionalAmount("Editor price per unit (per video, hour, minute, day…); needs cost access"),
  currency: z.enum(["EUR", "IDR", "USD"]).optional().describe("Currency of the editor price (default: the editor's pay currency)"),
  quantity: optionalAmount("Quantity of units (hours, days…), when not per video"),
};

function assignmentInput(videoId: string, editorId: string, input: { role?: (typeof ASSIGNMENT_ROLES)[number]; is_primary?: boolean; scope?: string; due_on?: string; start_on?: string; estimated_hours?: string | number; rate_mode?: (typeof RATE_MODES)[number]; unit_price?: string | number; currency?: "EUR" | "IDR" | "USD"; quantity?: string | number; manual_fx_rate?: string | number }): AssignmentInput {
  return {
    videoId, editorId, role: input.role ?? "EDIT", isPrimary: input.is_primary ?? true, scope: v(input.scope), rateCardId: "",
    rateMode: input.rate_mode ?? (input.unit_price !== undefined ? "PER_VIDEO" : ""), unitPrice: v(input.unit_price), currency: input.currency ?? "", quantity: v(input.quantity), minuteRounding: "",
    includedRevisions: "", estimatedHours: v(input.estimated_hours), startOn: v(input.start_on), dueOn: v(input.due_on), manualFxRate: v(input.manual_fx_rate),
  };
}

const assignEditorTool = writeTool({
  name: "assign_editor",
  label: "Mission de monteur",
  about:
    "Assign an editor to one or more videos (one mission per video). The editor's price comes from their rate card unless rate_mode/unit_price are given (cost access needed). The editor is not notified unless notify_editor=true. Returns planning warnings (overload, unavailability).",
  anyOf: ["assignments.write"],
  input: z.object({
    editor_id: id("Editor"),
    video_ids: z.array(z.string().min(1).max(64)).min(1).max(100).describe("Videos to assign"),
    role: z.enum(ASSIGNMENT_ROLES).optional().describe("Default EDIT"),
    is_primary: z.boolean().optional().describe("Main editor of the video (default true)"),
    scope: text(500, "What the editor must do"),
    ...rateFields,
    manual_fx_rate: manualFxRate,
    estimated_hours: optionalAmount("Estimated hours per video"),
    start_on: isoDate("Start date (YYYY-MM-DD)"),
    due_on: isoDate("Mission due date (YYYY-MM-DD); empty = the video's internal or client deadline"),
    notify_editor: z.boolean().optional().describe("Send the mission to the editor now (default false)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (input.unit_price !== undefined || input.rate_mode) requirePermissions(actor, [["costs.write", "set an editor price (cost access)"]]);
    const editor = await prisma.editorProfile.findUnique({ where: { id: input.editor_id }, select: { id: true, displayName: true } });
    if (!editor) throw new ToolError("Editor not found: use list_editors to get the id.");
    const videos = await prisma.video.findMany({ where: { id: { in: input.video_ids } }, select: { id: true, reference: true, title: true } });
    if (videos.length !== new Set(input.video_ids).size) throw new ToolError("Some video ids were not found: use search_videos to get them.");
    for (const x of videos) check(assignmentSchema, assignmentInput(x.id, editor.id, input), `Mission on ${x.reference}`);
    const records: RecordRef[] = [];
    const warnings = new Set<string>();
    let step = "";
    try {
      for (const x of videos) {
        step = `mission on ${x.reference}`;
        const res = await assignEditor(actor, assignmentInput(x.id, editor.id, input), { notifyEditor: input.notify_editor === true });
        res.warnings.forEach((w) => warnings.add(w));
        records.push(ref("ASSIGNMENT", res.id, `${editor.displayName} → ${x.reference} · ${x.title}`, x.reference, { type: "VIDEO", id: x.id }));
      }
    } catch (error) {
      if (!records.length) throw error;
      return { done: "partial", records, warnings: [...warnings], failed: { step, problem: problemOf(error) }, next: PARTIAL_NEXT };
    }
    return { done: "created", records, warnings: [...warnings] };
  },
});

const editorFields = {
  email: text(254, "Email"),
  whatsapp: text(40, "WhatsApp"),
  country: text(80, "Country"),
  timezone: text(60, "Time zone, e.g. Asia/Makassar"),
  languages: text(200, "Comma-separated languages"),
  portfolio_url: text(2000, "Portfolio link"),
  skills: z.array(z.enum(SKILLS)).optional(),
  formats: z.array(z.enum(VIDEO_TYPES)).optional().describe("Video types the editor handles"),
  level: z.enum(["JUNIOR", "INTERMEDIATE", "SENIOR", "EXPERT"]).optional(),
  availability_note: text(300, "Availability"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().describe("Default ACTIVE"),
  pay_currency: z.enum(["EUR", "IDR", "USD"]).optional().describe("Currency the editor is paid in"),
  payment_terms: text(300, "Payment terms"),
  internal_notes: text(4000, "Internal notes"),
  weekly_capacity_hours: optionalAmount("Weekly capacity in hours"),
};
const EDITOR_FIELDS = {
  email: "email", whatsapp: "whatsapp", country: "country", timezone: "timezone", languages: "languages", portfolio_url: "portfolioUrl",
  level: "level", availability_note: "availabilityNote", status: "status", pay_currency: "payCurrency", payment_terms: "paymentTerms",
  internal_notes: "internalNotes", weekly_capacity_hours: "weeklyCapacityHours",
};

const createEditorTool = writeTool({
  name: "create_editor",
  label: "Nouveau monteur",
  about: "Add a freelance editor (from a CV, a portfolio or the user's description). Check list_editors first. Rate cards are set by an administrator in the CRM.",
  anyOf: ["editors.write"],
  input: z.object({ display_name: z.string().trim().min(1).max(120), ...editorFields, confirm_duplicate: confirmDuplicate }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.confirm_duplicate) {
      const same = await prisma.editorProfile.findMany({
        where: { OR: [{ displayName: { equals: input.display_name, mode: "insensitive" } }, ...(input.email ? [{ email: { equals: input.email, mode: "insensitive" as const } }] : [])] },
        select: { id: true, displayName: true },
      });
      if (same.length) return duplicatesFound(same.map((e) => possible("EDITOR", e.id, e.displayName, "same name or email")));
    }
    const data: EditorInput = { ...apply({ ...emptyEditor, displayName: input.display_name }, input, EDITOR_FIELDS, ["portfolio_url"]), skills: input.skills ?? [], formats: input.formats ?? [] };
    const res = await createEditor(actor, data);
    return { done: "created", records: [ref("EDITOR", res.id, input.display_name)] };
  },
});

const updateEditorTool = writeTool({
  name: "update_editor",
  label: "Fiche monteur",
  about: "Update an editor's profile (contact, skills, formats, capacity, availability, status). Only the fields given are changed.",
  anyOf: ["editors.write"],
  destructive: true,
  input: z.object({ editor_id: id("Editor"), display_name: z.string().trim().min(1).max(120).optional(), ...editorFields }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.editorProfile.findUnique({ where: { id: input.editor_id } });
    if (!current) throw new ToolError("Editor not found: use list_editors to get the id.");
    const data = apply({ ...editorFormDefaults(current, can(actor, "editors.appraisal")), ...(input.display_name ? { displayName: input.display_name } : {}) }, input, EDITOR_FIELDS, ["portfolio_url"]);
    await updateEditor(actor, current.id, { ...data, skills: input.skills ?? data.skills, formats: input.formats ?? data.formats });
    return { done: "updated", records: [ref("EDITOR", current.id, input.display_name ?? current.displayName)] };
  },
});

const addUnavailabilityTool = writeTool({
  name: "add_editor_unavailability",
  label: "Indisponibilité monteur",
  about: "Record a period when an editor is unavailable (holidays, sick leave…); it shows in the planning and in assignment warnings.",
  anyOf: ["editors.write"],
  input: z.object({ editor_id: id("Editor"), starts_on: requiredDate("First day (YYYY-MM-DD)"), ends_on: requiredDate("Last day (YYYY-MM-DD)"), reason: text(200, "Reason") }),
  run: async (actor, input): Promise<WriteResult> => {
    const editor = await prisma.editorProfile.findUnique({ where: { id: input.editor_id }, select: { id: true, displayName: true } });
    if (!editor) throw new ToolError("Editor not found: use list_editors to get the id.");
    const res = await addUnavailability(actor, { editorId: editor.id, startsOn: input.starts_on, endsOn: input.ends_on, reason: v(input.reason) });
    return { done: "created", records: [ref("UNAVAILABILITY", res.id, `${editor.displayName} · ${input.starts_on} → ${input.ends_on}`, null, { type: "EDITOR", id: editor.id })] };
  },
});

// ───────────────────────────── Mission complète en une fois ─────────────────────────────

const createMissionTool = writeTool({
  name: "create_mission",
  label: "Nouvelle mission",
  about: [
    "Record a whole new job in ONE step, typically typed by the user (« nouvelle mission pour X : 3 reels à 450 € chacun, livraison le 15/11, monteur Kai à 120 € ») or read from a quote or brief:",
    "the client (existing client_id, or new_client), the project (or an existing project_id), its videos, the client price (pricing) and the editors (editors).",
    "Everything is checked before the first write; likely duplicates are returned without saving.",
    "Before calling, show the user a summary table (client, project, videos with deadlines, price, editors and their price) and wait for their OK.",
  ].join(" "),
  anyOf: ["projects.write"],
  input: z.object({
    client_id: optionalId("Existing client (search_clients). Omit when new_client or project_id is given"),
    new_client: z
      .object({ display_name: z.string().trim().min(1).max(160), ...clientFields, contact: contactInput })
      .optional()
      .describe("Create the client (only after search_clients found nothing)"),
    project_id: optionalId("Add the videos to this existing project instead of creating one"),
    project: z
      .object({ title: z.string().trim().min(1).max(160), ...projectFields })
      .optional()
      .describe("The project to create (required unless project_id)"),
    videos: z.array(newVideo).min(1).max(60),
    pricing: z
      .object({
        mode: z.enum(["FLAT", "PER_VIDEO"]).describe("FLAT: one total for the job; PER_VIDEO: price per video"),
        amount: amount("Price excl. VAT (total for FLAT, per video for PER_VIDEO)"),
        currency,
        manual_fx_rate: manualFxRate,
        accepted_on: isoDate("Date the price was agreed (YYYY-MM-DD, default today)"),
        title: text(200, "Title of the sale (default: the project title)"),
      })
      .optional()
      .describe("Client price (needs sales access)"),
    editors: z
      .array(
        z.object({
          editor_id: id("Editor"),
          videos: z.array(z.number().int().min(1).max(60)).optional().describe("Positions (1-based) in `videos`; default: all videos"),
          role: z.enum(ASSIGNMENT_ROLES).optional().describe("Default EDIT"),
          ...rateFields,
          due_on: isoDate("Mission due date (YYYY-MM-DD); empty = each video's internal or client deadline"),
          estimated_hours: optionalAmount("Estimated hours per video"),
          notify_editor: z.boolean().optional().describe("Send the missions to the editor now (default false)"),
        }),
      )
      .max(10)
      .optional()
      .describe("Editors to assign, with their price when given"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    // 1. Droits nécessaires, avant toute écriture.
    const needs: [Permission, string][] = [["videos.write", "create videos"]];
    if (input.new_client) needs.push(["clients.write", "create clients"]);
    if (input.pricing) needs.push(["sales.write", "set the client price (finance access)"]);
    if (input.editors?.length) needs.push(["assignments.write", "assign editors"]);
    if (input.editors?.some((e) => e.unit_price !== undefined || e.rate_mode)) needs.push(["costs.write", "set an editor price (cost access)"]);
    requirePermissions(actor, needs);

    // 2. Client et projet.
    if (!input.project_id && !input.project) throw new ToolError("Give `project` (to create) or `project_id` (existing project).");
    let clientId = input.client_id ?? null;
    let projectId = input.project_id ?? null;
    let projectLabel = "";
    if (projectId) {
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, clientId: true, reference: true, title: true, status: true } });
      if (!p) throw new ToolError("Project not found: use search_projects to get its id.");
      if (p.status === "CANCELLED" || p.status === "ARCHIVED") throw new ToolError("This project is closed: a person must reopen it in the CRM.");
      if (clientId && clientId !== p.clientId) throw new ToolError("project_id belongs to another client than client_id.");
      clientId = p.clientId;
      projectLabel = `${p.reference} · ${p.title}`;
    } else if (!clientId && !input.new_client) {
      throw new ToolError("Give client_id (existing client) or new_client.");
    } else if (clientId && input.new_client) {
      throw new ToolError("Give either client_id or new_client, not both.");
    }
    if (clientId) {
      const c = await prisma.client.findUnique({ where: { id: clientId }, select: { status: true } });
      if (!c) throw new ToolError("Client not found: use search_clients to get its id.");
      if (c.status === "ARCHIVED") throw new ToolError("This client is archived: a person must restore it in the CRM first.");
    }
    const clientInput = input.new_client ? newClientInput(input.new_client, { status: "ACTIVE" }) : null;
    if (clientInput) check(clientSchema, clientInput, "new_client");
    const projectInput = input.project ? applyProject(emptyProject(clientId ?? "pending", input.project.title), input.project) : null;
    if (projectInput) check(projectSchema, projectInput, "project");

    // 3. Vidéos, prix et missions vérifiés avant d'écrire.
    const videos = input.videos.map((x) => videoInput(projectId ?? "pending", x));
    videos.forEach((x, i) => check(videoSchema, x, `Video ${i + 1}`));
    const today = await agencyToday();
    const pricing = input.pricing
      ? {
          projectId: projectId ?? "pending", mode: input.pricing.mode, amount: v(input.pricing.amount), acceptedOn: input.pricing.accepted_on ?? today,
          currency: input.pricing.currency ?? "EUR", manualFxRate: v(input.pricing.manual_fx_rate), title: input.pricing.title || input.project?.title || projectLabel || "Mission",
          includedRevisions: "", notes: "",
        }
      : null;
    if (pricing) {
      check(projectPriceSchema, pricing, "pricing");
      await resolveFx(prisma, pricing.currency, pricing.acceptedOn, pricing.manualFxRate || null);
    }
    const editors = await Promise.all(
      (input.editors ?? []).map(async (e) => {
        const editor = await prisma.editorProfile.findUnique({ where: { id: e.editor_id }, select: { id: true, displayName: true, status: true } });
        if (!editor) throw new ToolError(`Editor ${e.editor_id} not found: use list_editors to get the id.`);
        if (editor.status !== "ACTIVE") throw new ToolError(`${editor.displayName} is not an active editor.`);
        const positions = e.videos?.length ? [...new Set(e.videos)] : videos.map((_, i) => i + 1);
        if (positions.some((p) => p > videos.length)) throw new ToolError(`editors.videos for ${editor.displayName} refers to a video position that does not exist.`);
        check(assignmentSchema, assignmentInput("pending", editor.id, e), `Mission of ${editor.displayName}`);
        return { editor, positions, input: e };
      }),
    );

    // 4. Doublons probables : rien n'est écrit sans confirmation.
    if (!input.confirm_duplicate) {
      const found: PossibleDuplicate[] = [];
      if (input.new_client) found.push(...(await clientDuplicates(input.new_client)));
      if (clientId && input.project) found.push(...(await projectDuplicates(clientId, input.project.title)));
      if (projectId) found.push(...(await videoDuplicates(projectId, input.videos.map((x) => x.title))));
      if (projectId && pricing) {
        const sales = await prisma.salesOrder.findMany({ where: { projectId, status: "ACCEPTED" }, select: { id: true, reference: true, title: true } });
        found.push(...sales.map((o) => possible("SALES_ORDER", o.id, `${o.reference} · ${o.title}`, "the project already has an accepted sale")));
      }
      if (found.length) return duplicatesFound(found);
    }

    // 5. Écritures, dans l'ordre ; en cas d'échec, ce qui est déjà enregistré est renvoyé.
    const records: RecordRef[] = [];
    const warnings = new Set<string>();
    /** Monteur principal d'une vidéo : le premier qui lui est affecté. */
    const primaryTaken = new Set<number>();
    let step = "client";
    try {
      if (clientInput) {
        const res = await createClient(actor, clientInput);
        if ("duplicates" in res) throw new ToolError("The client looks like an existing one.");
        clientId = res.id;
        records.push(ref("CLIENT", res.id, clientInput.displayName));
      }
      step = "project";
      if (!projectId && projectInput) {
        const project = await createProject(actor, { ...projectInput, clientId: clientId! });
        projectId = project.id;
        projectLabel = `${project.reference} · ${projectInput.title}`;
        records.push(ref("PROJECT", project.id, projectLabel, project.reference));
      }
      const videoIds = await createVideos(actor, projectId!, videos, records, (s) => (step = s));
      if (pricing) {
        step = "pricing";
        const sale = await setProjectPrice(actor, { ...pricing, projectId: projectId! });
        records.push(ref("SALES_ORDER", sale.id, `${sale.reference} · ${pricing.title}`, sale.reference));
      }
      for (const e of editors) {
        for (const position of e.positions) {
          step = `mission of ${e.editor.displayName} on video ${position}`;
          const videoId = videoIds[position - 1];
          const isPrimary = !primaryTaken.has(position);
          primaryTaken.add(position);
          const res = await assignEditor(actor, assignmentInput(videoId, e.editor.id, { ...e.input, is_primary: isPrimary }), { notifyEditor: e.input.notify_editor === true });
          res.warnings.forEach((w) => warnings.add(w));
          records.push(ref("ASSIGNMENT", res.id, `${e.editor.displayName} → ${videos[position - 1].title}`, null, { type: "VIDEO", id: videoId }));
        }
      }
    } catch (error) {
      if (!records.length) throw error;
      return { done: "partial", records, warnings: [...warnings], failed: { step, problem: problemOf(error) }, next: PARTIAL_NEXT };
    }
    return {
      done: "created",
      records,
      warnings: [...warnings],
      attach: projectId ? await attachTo(actor, "PROJECT", projectId, projectLabel) : undefined,
      next: MISSION_NEXT,
    };
  },
});

// ───────────────────────────── Pièce d'origine ─────────────────────────────

const ATTACHABLE = ["CLIENT", "PROJECT", "VIDEO", "INVOICE", "CREDIT_NOTE", "CLIENT_PAYMENT", "SUPPLIER_PAYMENT", "EXPENSE", "DIRECT_COST", "EDITOR"] as const;

async function ownerLabel(type: (typeof ATTACHABLE)[number], ownerId: string): Promise<string | null> {
  switch (type) {
    case "CLIENT":
      return (await prisma.client.findUnique({ where: { id: ownerId }, select: { displayName: true } }))?.displayName ?? null;
    case "PROJECT": {
      const p = await prisma.project.findUnique({ where: { id: ownerId }, select: { reference: true, title: true } });
      return p ? `${p.reference} · ${p.title}` : null;
    }
    case "VIDEO": {
      const x = await prisma.video.findUnique({ where: { id: ownerId }, select: { reference: true, title: true } });
      return x ? `${x.reference} · ${x.title}` : null;
    }
    case "INVOICE": {
      const i = await prisma.invoice.findUnique({ where: { id: ownerId }, select: { number: true, client: { select: { displayName: true } } } });
      return i ? `${i.number ?? "—"} · ${i.client.displayName}` : null;
    }
    case "CREDIT_NOTE": {
      const c = await prisma.creditNote.findUnique({ where: { id: ownerId }, select: { number: true } });
      return c ? c.number ?? "—" : null;
    }
    case "CLIENT_PAYMENT": {
      const p = await prisma.clientPayment.findUnique({ where: { id: ownerId }, select: { amount: true, currency: true, client: { select: { displayName: true } } } });
      return p ? `${p.amount.toFixed(2)} ${p.currency} · ${p.client.displayName}` : null;
    }
    case "SUPPLIER_PAYMENT": {
      const p = await prisma.supplierPayment.findUnique({ where: { id: ownerId }, select: { amount: true, currency: true, editor: { select: { displayName: true } }, supplierName: true } });
      return p ? `${p.amount.toFixed(2)} ${p.currency} · ${p.editor?.displayName ?? p.supplierName ?? "—"}` : null;
    }
    case "EXPENSE":
      return (await prisma.expense.findUnique({ where: { id: ownerId }, select: { label: true } }))?.label ?? null;
    case "DIRECT_COST":
      return (await prisma.directCost.findUnique({ where: { id: ownerId }, select: { label: true } }))?.label ?? null;
    case "EDITOR":
      return (await prisma.editorProfile.findUnique({ where: { id: ownerId }, select: { displayName: true } }))?.displayName ?? null;
  }
}

const createUploadLinkTool = writeTool({
  name: "create_upload_link",
  label: "Lien de dépôt",
  about:
    "Get a one-time link (24 h) to attach the original document (PDF, PNG, JPEG, WebP) to a record: the user opens attach.url and drops the file; Claude Code can upload it directly with: curl -T <file> <attach.upload_url>. Create tools already return this link for invoices, payments, costs and expenses.",
  anyOf: [...new Set(ATTACHABLE.map((t) => ATTACHMENT_WRITE[t]).filter((p): p is Permission => !!p))],
  input: z.object({ owner_type: z.enum(ATTACHABLE), owner_id: id("Record") }),
  run: async (actor, input): Promise<WriteResult> => {
    const label = await ownerLabel(input.owner_type, input.owner_id);
    if (!label) throw new ToolError("Record not found: check the id with a search tool.");
    const attach = await createUploadTicket(actor, { type: input.owner_type, id: input.owner_id, label });
    return { done: "created", records: [ref(input.owner_type, input.owner_id, label)], attach, next: "Give attach.url to the user (or upload with curl -T in Claude Code). The link works once, for 24 hours." };
  },
});

export const CRM_WRITE_TOOLS: CrmTool[] = [
  createMissionTool,
  createClientTool,
  updateClientTool,
  saveContactTool,
  addNoteTool,
  logActivityTool,
  createOpportunityTool,
  updateOpportunityTool,
  convertOpportunityTool,
  createProjectTool,
  updateProjectTool,
  createVideosTool,
  updateVideoTool,
  addVideoLinkTool,
  addVideoFeedbackTool,
  transitionVideoTool,
  setVideoBlockedTool,
  createChangeRequestTool,
  assignEditorTool,
  createEditorTool,
  updateEditorTool,
  addUnavailabilityTool,
  createUploadLinkTool,
];
