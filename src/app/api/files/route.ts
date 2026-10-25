import { NextResponse, type NextRequest } from "next/server";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import { saveAttachment } from "@/server/attachments";
import { recordAudit } from "@/server/audit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { can, type Actor, type Permission } from "@/server/policies";
import { revalidateApp } from "@/server/revalidate";

const WRITE: Record<AttachmentOwner, Permission | null> = {
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

async function ownerExists(type: AttachmentOwner, id: string): Promise<boolean> {
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

async function canWrite(actor: Actor, type: AttachmentOwner, id: string): Promise<boolean> {
  const perm = WRITE[type];
  if (perm && can(actor, perm)) return true;
  // Un monteur affecté peut joindre un document final à SA vidéo.
  if (type === "VIDEO" && actor.editorId) {
    return (await prisma.assignment.count({ where: { videoId: id, editorId: actor.editorId, status: { not: "CANCELLED" } } })) > 0;
  }
  return false;
}

/** Envoi d'une pièce jointe (multipart). Contrôles : session, droit sur le propriétaire, type réel, taille. */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  const ownerType = String(form.get("ownerType") ?? "") as AttachmentOwner;
  const ownerId = String(form.get("ownerId") ?? "");
  if (!(file instanceof File) || !(ownerType in WRITE) || !ownerId) return NextResponse.json({ error: "Fichier ou rattachement manquant." }, { status: 400 });
  if (!(await canWrite(actor, ownerType, ownerId))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!(await ownerExists(ownerType, ownerId))) return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });
  try {
    const id = await saveAttachment(prisma, actor, file, { type: ownerType, id: ownerId });
    if (ownerType === "INVOICE") await prisma.invoice.update({ where: { id: ownerId }, data: { pdfAttachmentId: id } });
    if (ownerType === "CREDIT_NOTE") await prisma.creditNote.update({ where: { id: ownerId }, data: { pdfAttachmentId: id } });
    if (ownerType === "SUPPLIER_PAYMENT") await prisma.supplierPayment.update({ where: { id: ownerId }, data: { proofAttachmentId: id } });
    if (ownerType === "CLIENT_PAYMENT") await prisma.clientPayment.update({ where: { id: ownerId }, data: { proofAttachmentId: id } });
    if (ownerType === "EXPENSE") await prisma.expense.update({ where: { id: ownerId }, data: { attachmentId: id } });
    if (ownerType === "DIRECT_COST") await prisma.directCost.update({ where: { id: ownerId }, data: { attachmentId: id } });
    if (ownerType === "SETTINGS") await prisma.agencySettings.update({ where: { id: 1 }, data: { logoAttachmentId: id } });
    await recordAudit(prisma, { actorId: actor.id, action: "attachment.upload", entityType: ownerType, entityId: ownerId, after: { attachmentId: id, filename: file.name } });
    revalidateApp();
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[files] envoi échoué", (e as Error).message);
    return NextResponse.json({ error: "Envoi impossible pour le moment." }, { status: 500 });
  }
}
