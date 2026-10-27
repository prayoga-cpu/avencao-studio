import "server-only";
import { randomUUID } from "node:crypto";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import type { Db } from "./db";
import { prisma } from "./db";
import { DomainError, ForbiddenError, NotFoundError } from "./errors";
import { can, type Actor, type Permission } from "./policies";
import { getSettings } from "./settings";
import { ALLOWED_TYPES, sha256, sniffType, storage } from "./storage";

function sanitizeFilename(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().slice(0, 120);
  return base || "document";
}

export async function saveAttachment(
  db: Db,
  actor: Actor,
  file: File,
  owner: { type: AttachmentOwner; id: string },
): Promise<string> {
  const settings = await getSettings();
  const maxBytes = settings.maxUploadMb * 1024 * 1024;
  if (file.size === 0) throw new DomainError("Fichier vide.");
  if (file.size > maxBytes) throw new DomainError(`Fichier trop volumineux (max ${settings.maxUploadMb} Mo).`);
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniffType(data);
  if (!type) throw new DomainError("Type de fichier refusé : PDF, PNG, JPEG ou WebP uniquement.");
  const filename = sanitizeFilename(file.name);
  const year = new Date().getUTCFullYear();
  const key = `${owner.type.toLowerCase()}/${year}/${randomUUID()}.${ALLOWED_TYPES[type]}`;
  await storage().put(key, data, type);
  const row = await db.attachment.create({
    data: {
      storageKey: key,
      filename,
      contentType: type,
      byteSize: data.length,
      sha256: sha256(data),
      ownerType: owner.type,
      ownerId: owner.id,
      uploadedById: actor.id,
    },
  });
  return row.id;
}

/** Droit requis pour joindre une pièce à un élément, par type de propriétaire. */
export const ATTACHMENT_WRITE: Record<AttachmentOwner, Permission | null> = {
  CLIENT: "clients.write",
  PROJECT: "projects.write",
  VIDEO: "videos.write",
  INVOICE: "invoices.write",
  CREDIT_NOTE: "invoices.write",
  CLIENT_PAYMENT: "payments.write",
  SUPPLIER_PAYMENT: "supplierPayments.write",
  EXPENSE: "expenses.write",
  DIRECT_COST: "costs.write",
  EDITOR: "editors.write",
  SETTINGS: "settings.manage",
  LEGACY_PAYMENT: "legacy.reconcile",
  USER: null,
};

export async function attachmentOwnerExists(type: AttachmentOwner, id: string): Promise<boolean> {
  const models: Partial<Record<AttachmentOwner, () => Promise<unknown>>> = {
    CLIENT: () => prisma.client.findUnique({ where: { id }, select: { id: true } }),
    PROJECT: () => prisma.project.findUnique({ where: { id }, select: { id: true } }),
    VIDEO: () => prisma.video.findUnique({ where: { id }, select: { id: true } }),
    INVOICE: () => prisma.invoice.findUnique({ where: { id }, select: { id: true } }),
    CREDIT_NOTE: () => prisma.creditNote.findUnique({ where: { id }, select: { id: true } }),
    CLIENT_PAYMENT: () => prisma.clientPayment.findUnique({ where: { id }, select: { id: true } }),
    SUPPLIER_PAYMENT: () => prisma.supplierPayment.findUnique({ where: { id }, select: { id: true } }),
    EXPENSE: () => prisma.expense.findUnique({ where: { id }, select: { id: true } }),
    DIRECT_COST: () => prisma.directCost.findUnique({ where: { id }, select: { id: true } }),
    EDITOR: () => prisma.editorProfile.findUnique({ where: { id }, select: { id: true } }),
    LEGACY_PAYMENT: () => prisma.legacyPayment.findUnique({ where: { id }, select: { id: true } }),
    SETTINGS: async () => (id === "1" ? { id } : null),
  };
  const fn = models[type];
  return fn ? Boolean(await fn()) : false;
}

export async function canWriteAttachment(actor: Actor, type: AttachmentOwner, id: string): Promise<boolean> {
  const perm = ATTACHMENT_WRITE[type];
  if (perm && can(actor, perm)) return true;
  // Un monteur affecté peut joindre un document final à SA vidéo.
  if (type === "VIDEO" && actor.editorId) {
    return (await prisma.assignment.count({ where: { videoId: id, editorId: actor.editorId, status: { not: "CANCELLED" } } })) > 0;
  }
  return false;
}

/** Renseigne la pièce principale de l'élément (PDF de facture, justificatif, pièce de dépense…). */
export async function linkAttachment(db: Db, type: AttachmentOwner, ownerId: string, attachmentId: string): Promise<void> {
  if (type === "INVOICE") await db.invoice.update({ where: { id: ownerId }, data: { pdfAttachmentId: attachmentId } });
  if (type === "CREDIT_NOTE") await db.creditNote.update({ where: { id: ownerId }, data: { pdfAttachmentId: attachmentId } });
  if (type === "SUPPLIER_PAYMENT") await db.supplierPayment.update({ where: { id: ownerId }, data: { proofAttachmentId: attachmentId } });
  if (type === "CLIENT_PAYMENT") await db.clientPayment.update({ where: { id: ownerId }, data: { proofAttachmentId: attachmentId } });
  if (type === "EXPENSE") await db.expense.update({ where: { id: ownerId }, data: { attachmentId } });
  if (type === "DIRECT_COST") await db.directCost.update({ where: { id: ownerId }, data: { attachmentId } });
  if (type === "SETTINGS") await db.agencySettings.update({ where: { id: 1 }, data: { logoAttachmentId: attachmentId } });
}

/** Contrôle d'accès à une pièce jointe selon son propriétaire et le rôle. */
export async function assertCanReadAttachment(actor: Actor, attachmentId: string) {
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw new NotFoundError();
  const allowed = await (async () => {
    switch (att.ownerType) {
      case "INVOICE":
      case "CREDIT_NOTE":
        return can(actor, "invoices.read");
      case "CLIENT_PAYMENT":
        return can(actor, "payments.read");
      case "SUPPLIER_PAYMENT": {
        if (can(actor, "supplierPayments.read")) return true;
        if (!actor.editorId || !can(actor, "earnings.own")) return false;
        const p = await prisma.supplierPayment.findUnique({ where: { id: att.ownerId }, select: { editorId: true } });
        return p?.editorId === actor.editorId;
      }
      case "EXPENSE":
        return can(actor, "expenses.read");
      case "DIRECT_COST":
        return can(actor, "costs.read");
      case "CLIENT":
        return can(actor, "clients.read");
      case "PROJECT":
        return can(actor, "projects.read");
      case "VIDEO": {
        if (can(actor, "videos.readAll")) return true;
        if (!actor.editorId) return false;
        const n = await prisma.assignment.count({
          where: { videoId: att.ownerId, editorId: actor.editorId, status: { not: "CANCELLED" } },
        });
        return n > 0;
      }
      case "EDITOR":
        return can(actor, "editors.read") || actor.editorId === att.ownerId;
      case "LEGACY_PAYMENT":
        return can(actor, "legacy.reconcile");
      case "SETTINGS":
      case "USER":
        return true;
      default:
        return false;
    }
  })();
  if (!allowed) throw new ForbiddenError();
  return att;
}
