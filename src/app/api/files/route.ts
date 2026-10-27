import { NextResponse, type NextRequest } from "next/server";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import { ATTACHMENT_WRITE, attachmentOwnerExists, canWriteAttachment, linkAttachment, saveAttachment } from "@/server/attachments";
import { recordAudit } from "@/server/audit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { revalidateApp } from "@/server/revalidate";

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
  if (!(file instanceof File) || !(ownerType in ATTACHMENT_WRITE) || !ownerId) return NextResponse.json({ error: "Fichier ou rattachement manquant." }, { status: 400 });
  if (!(await canWriteAttachment(actor, ownerType, ownerId))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!(await attachmentOwnerExists(ownerType, ownerId))) return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });
  try {
    const id = await saveAttachment(prisma, actor, file, { type: ownerType, id: ownerId });
    await linkAttachment(prisma, ownerType, ownerId, id);
    await recordAudit(prisma, { actorId: actor.id, action: "attachment.upload", entityType: ownerType, entityId: ownerId, after: { attachmentId: id, filename: file.name } });
    revalidateApp();
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[files] envoi échoué", (e as Error).message);
    return NextResponse.json({ error: "Envoi impossible pour le moment." }, { status: 500 });
  }
}
