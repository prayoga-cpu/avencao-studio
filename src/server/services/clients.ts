import "server-only";
import type { ActivityInput, ClientInput, ContactInput, NoteInput } from "@/features/clients/schemas";
import { activitySchema, clientSchema, contactSchema, noteSchema } from "@/features/clients/schemas";
import { recordAudit } from "../audit";
import { dateOrNull, intOrNull, str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { assertCan, can, type Actor } from "../policies";
import { assertVersion } from "./common";

export interface DuplicateHit {
  id: string;
  displayName: string;
  reason: string;
}

function normPhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d]/g, "");
  return digits.length >= 6 ? digits.slice(-9) : null;
}

/**
 * Détection de doublons sur identifiants fiables (email, téléphone, n° TVA / SIRET).
 * La seule similarité du nom ne déclenche jamais de fusion ni de blocage.
 */
export async function findClientDuplicates(
  db: Db,
  input: { email?: string | null; phone?: string | null; vatNumber?: string | null; companyRegistration?: string | null; contactEmail?: string | null },
  excludeId?: string,
): Promise<DuplicateHit[]> {
  const emails = [input.email, input.contactEmail].map((e) => e?.trim().toLowerCase()).filter(Boolean) as string[];
  const hits = new Map<string, DuplicateHit>();
  if (emails.length) {
    const byEmail = await db.client.findMany({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          { email: { in: emails, mode: "insensitive" } },
          { contacts: { some: { email: { in: emails, mode: "insensitive" } } } },
        ],
      },
      select: { id: true, displayName: true },
    });
    byEmail.forEach((c) => hits.set(c.id, { ...c, reason: "même email" }));
  }
  const ids = [input.vatNumber, input.companyRegistration].map((v) => v?.replace(/\s/g, "")).filter(Boolean) as string[];
  if (ids.length) {
    const byId = await db.client.findMany({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        OR: [{ vatNumber: { in: ids, mode: "insensitive" } }, { companyRegistration: { in: ids, mode: "insensitive" } }],
      },
      select: { id: true, displayName: true },
    });
    byId.forEach((c) => hits.set(c.id, { ...c, reason: "même identifiant administratif" }));
  }
  const phone = normPhone(input.phone ?? null);
  if (phone) {
    const byPhone = await db.client.findMany({
      where: { id: excludeId ? { not: excludeId } : undefined, OR: [{ phone: { contains: phone.slice(-6) } }, { whatsapp: { contains: phone.slice(-6) } }] },
      select: { id: true, displayName: true, phone: true, whatsapp: true },
    });
    byPhone
      .filter((c) => normPhone(c.phone) === phone || normPhone(c.whatsapp) === phone)
      .forEach((c) => hits.set(c.id, { id: c.id, displayName: c.displayName, reason: "même téléphone" }));
  }
  return [...hits.values()];
}

function clientData(d: ReturnType<typeof clientSchema.parse>) {
  return {
    displayName: d.displayName,
    kind: d.kind,
    status: d.status,
    legalName: str(d.legalName),
    email: str(d.email)?.toLowerCase() ?? null,
    phone: str(d.phone),
    whatsapp: str(d.whatsapp),
    country: str(d.country),
    billingAddress: str(d.billingAddress),
    vatNumber: str(d.vatNumber),
    companyRegistration: str(d.companyRegistration),
    website: str(d.website),
    instagram: str(d.instagram),
    tiktok: str(d.tiktok),
    youtube: str(d.youtube),
    linkedin: str(d.linkedin),
    otherSocial: str(d.otherSocial),
    acquisitionSource: str(d.acquisitionSource),
    ownerId: str(d.ownerId),
    currency: d.currency,
    paymentTermsDays: intOrNull(d.paymentTermsDays),
    driveUrl: str(d.driveUrl),
    creativePreferences: str(d.creativePreferences),
    references: str(d.references),
    internalNotes: str(d.internalNotes),
    nextFollowUpOn: dateOrNull(d.nextFollowUpOn),
    archivedAt: d.status === "ARCHIVED" ? new Date() : null,
  };
}

async function syncTags(db: Db, clientId: string, tagsCsv: string) {
  const names = [...new Set(tagsCsv.split(",").map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 40)))].slice(0, 15);
  await db.clientTag.deleteMany({ where: { clientId } });
  for (const name of names) {
    const tag = await db.tag.upsert({ where: { name }, update: {}, create: { name } });
    await db.clientTag.create({ data: { clientId, tagId: tag.id } });
  }
}

export type SaveClientResult = { id: string } | { duplicates: DuplicateHit[] };

export async function createClient(actor: Actor, input: ClientInput): Promise<SaveClientResult> {
  assertCan(actor, "clients.write");
  const d = clientSchema.parse(input);
  if (d.status === "ARCHIVED" && !can(actor, "clients.archive")) throw new ForbiddenError();
  if (!d.confirmDuplicate) {
    const duplicates = await findClientDuplicates(prisma, d);
    if (duplicates.length) return { duplicates };
  }
  const id = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: clientData(d) });
    if (d.contactFirstName || d.contactLastName || d.contactEmail || d.contactPhone) {
      await tx.clientContact.create({
        data: {
          clientId: client.id,
          firstName: str(d.contactFirstName),
          lastName: str(d.contactLastName),
          jobTitle: str(d.contactJobTitle),
          email: str(d.contactEmail)?.toLowerCase() ?? null,
          phone: str(d.contactPhone),
          isPrimary: true,
        },
      });
    }
    await syncTags(tx, client.id, d.tags);
    await recordAudit(tx, { actorId: actor.id, action: "client.create", entityType: "Client", entityId: client.id, after: client });
    return client.id;
  });
  return { id };
}

export async function updateClient(actor: Actor, id: string, input: ClientInput): Promise<SaveClientResult> {
  assertCan(actor, "clients.write");
  const d = clientSchema.parse(input);
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) throw new NotFoundError();
  assertVersion(current.version, d.version);
  if ((d.status === "ARCHIVED") !== (current.status === "ARCHIVED") && !can(actor, "clients.archive")) {
    throw new ForbiddenError("Seul un administrateur peut archiver ou désarchiver un client.");
  }
  if (!d.confirmDuplicate) {
    const duplicates = await findClientDuplicates(prisma, d, id);
    if (duplicates.length) return { duplicates };
  }
  await prisma.$transaction(async (tx) => {
    const data = clientData(d);
    const updated = await tx.client.updateMany({
      where: { id, version: current.version },
      data: { ...data, archivedAt: d.status === "ARCHIVED" ? (current.archivedAt ?? new Date()) : null, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError("Modification concurrente détectée, rechargez la page.");
    await syncTags(tx, id, d.tags);
    await recordAudit(tx, { actorId: actor.id, action: "client.update", entityType: "Client", entityId: id, before: current, after: data });
  });
  return { id };
}

export async function saveContact(actor: Actor, input: ContactInput): Promise<{ id: string }> {
  assertCan(actor, "clients.write");
  const d = contactSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (d.isPrimary) await tx.clientContact.updateMany({ where: { clientId: d.clientId }, data: { isPrimary: false } });
    const data = {
      firstName: str(d.firstName),
      lastName: str(d.lastName),
      jobTitle: str(d.jobTitle),
      email: str(d.email)?.toLowerCase() ?? null,
      phone: str(d.phone),
      whatsapp: str(d.whatsapp),
      isPrimary: d.isPrimary,
    };
    if (!data.firstName && !data.lastName && !data.email && !data.phone) throw new DomainError("Renseignez au moins un nom, un email ou un téléphone.");
    const contact = d.id
      ? await tx.clientContact.update({ where: { id: d.id, clientId: d.clientId }, data })
      : await tx.clientContact.create({ data: { ...data, clientId: d.clientId } });
    return { id: contact.id };
  });
}

export async function deleteContact(actor: Actor, contactId: string) {
  assertCan(actor, "clients.write");
  await prisma.clientContact.delete({ where: { id: contactId } });
}

/** Les notes ne sont jamais visibles des monteurs. « Réservée admin » : visible des seuls administrateurs. */
export async function addNote(actor: Actor, input: NoteInput): Promise<{ id: string }> {
  assertCan(actor, "notes.internal");
  const d = noteSchema.parse(input);
  if (d.adminOnly && !can(actor, "notes.adminOnly")) throw new ForbiddenError();
  if (!d.clientId && !d.projectId && !d.videoId && !d.editorId) throw new DomainError("Note sans rattachement.");
  const note = await prisma.note.create({
    data: {
      body: d.body,
      authorId: actor.id,
      clientId: str(d.clientId),
      projectId: str(d.projectId),
      videoId: str(d.videoId),
      editorId: str(d.editorId),
      visibility: d.adminOnly ? "ADMIN_ONLY" : "INTERNAL",
    },
  });
  return { id: note.id };
}

export async function deleteNote(actor: Actor, noteId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) throw new NotFoundError();
  if (note.legacySource) throw new DomainError("Les notes importées de l'historique sont conservées.");
  if (note.authorId !== actor.id && actor.role !== "ADMIN") throw new ForbiddenError("Seul l'auteur ou un administrateur peut supprimer cette note.");
  await prisma.note.delete({ where: { id: noteId } });
  await recordAudit(prisma, { actorId: actor.id, action: "note.delete", entityType: "Note", entityId: noteId, before: note });
}

export async function addActivity(actor: Actor, input: ActivityInput): Promise<{ id: string }> {
  assertCan(actor, "prospection.write");
  const d = activitySchema.parse(input);
  if (!d.clientId && !d.opportunityId) throw new DomainError("Activité sans rattachement.");
  let clientId = str(d.clientId);
  if (!clientId && d.opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: d.opportunityId }, select: { clientId: true } });
    clientId = opp?.clientId ?? null;
  }
  const a = await prisma.activity.create({
    data: {
      clientId,
      opportunityId: str(d.opportunityId),
      type: d.type,
      subject: str(d.subject),
      body: str(d.body),
      occurredAt: d.occurredOn ? new Date(`${d.occurredOn}T12:00:00Z`) : new Date(),
      authorId: actor.id,
    },
  });
  return { id: a.id };
}

// ─────────────────────────── Import CSV ───────────────────────────

export const IMPORT_COLUMNS = [
  "nom", "type", "statut", "email", "telephone", "whatsapp", "pays", "adresse", "tva", "identifiant", "site", "instagram",
  "source", "devise", "delai_paiement", "drive", "contact_prenom", "contact_nom", "contact_email", "contact_telephone", "etiquettes", "notes",
] as const;

export type ImportRow = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;

export interface ImportPreviewRow {
  index: number;
  displayName: string;
  errors: string[];
  duplicates: DuplicateHit[];
  inFileDuplicateOf: number | null;
}

const STATUS_MAP: Record<string, ClientInput["status"]> = { prospect: "PROSPECT", actif: "ACTIVE", active: "ACTIVE", client: "ACTIVE", inactif: "INACTIVE", perdu: "LOST", archive: "ARCHIVED", "archivé": "ARCHIVED" };

function rowToInput(r: ImportRow): ClientInput {
  const v = (k: (typeof IMPORT_COLUMNS)[number]) => (r[k] ?? "").trim();
  const cur = v("devise").toUpperCase();
  return {
    displayName: v("nom"),
    kind: /ind|freelance|solo/i.test(v("type")) ? "INDIVIDUAL" : "COMPANY",
    status: STATUS_MAP[v("statut").toLowerCase()] ?? "PROSPECT",
    legalName: "", email: v("email"), phone: v("telephone"), whatsapp: v("whatsapp"), country: v("pays"), billingAddress: v("adresse"),
    vatNumber: v("tva"), companyRegistration: v("identifiant"), website: v("site") && !/^https?:\/\//.test(v("site")) ? `https://${v("site")}` : v("site"),
    instagram: v("instagram"), tiktok: "", youtube: "", linkedin: "", otherSocial: "", acquisitionSource: v("source"), ownerId: "",
    currency: cur === "IDR" || cur === "USD" ? cur : "EUR", paymentTermsDays: v("delai_paiement"), driveUrl: v("drive"),
    creativePreferences: "", references: "", internalNotes: v("notes"), nextFollowUpOn: "", tags: v("etiquettes"),
    contactFirstName: v("contact_prenom"), contactLastName: v("contact_nom"), contactJobTitle: "", contactEmail: v("contact_email"), contactPhone: v("contact_telephone"),
    confirmDuplicate: false,
  };
}

/** Aperçu : validation, doublons en base (email/téléphone/identifiants) et doublons internes au fichier. */
export async function previewClientImport(actor: Actor, rows: ImportRow[]): Promise<ImportPreviewRow[]> {
  assertCan(actor, "clients.import");
  if (rows.length > 500) throw new DomainError("500 lignes maximum par import.");
  const seen = new Map<string, number>();
  const out: ImportPreviewRow[] = [];
  for (const [index, row] of rows.entries()) {
    const input = rowToInput(row);
    const parsed = clientSchema.safeParse(input);
    const errors = parsed.success ? [] : parsed.error.issues.map((i) => `${String(i.path[0] ?? "")} : ${i.message}`);
    const duplicates = parsed.success ? await findClientDuplicates(prisma, input) : [];
    const key = (input.email || input.contactEmail || "").toLowerCase();
    const inFileDuplicateOf = key && seen.has(key) ? seen.get(key)! : null;
    if (key && !seen.has(key)) seen.set(key, index);
    out.push({ index, displayName: input.displayName || "(sans nom)", errors, duplicates, inFileDuplicateOf });
  }
  return out;
}

/** Création des lignes retenues ; un doublon n'est créé que si l'utilisateur l'a explicitement confirmé. */
export async function commitClientImport(actor: Actor, rows: ImportRow[], forceIndexes: number[]) {
  assertCan(actor, "clients.import");
  const preview = await previewClientImport(actor, rows);
  const force = new Set(forceIndexes);
  let created = 0;
  const skipped: { index: number; reason: string }[] = [];
  for (const p of preview) {
    if (p.errors.length) {
      skipped.push({ index: p.index, reason: "invalide" });
      continue;
    }
    if ((p.duplicates.length || p.inFileDuplicateOf !== null) && !force.has(p.index)) {
      skipped.push({ index: p.index, reason: "doublon possible" });
      continue;
    }
    const res = await createClient(actor, { ...rowToInput(rows[p.index]), confirmDuplicate: true });
    if ("id" in res) created += 1;
  }
  await recordAudit(prisma, { actorId: actor.id, action: "client.import_csv", entityType: "Client", entityId: "import", after: { created, skipped: skipped.length } });
  return { created, skipped };
}
