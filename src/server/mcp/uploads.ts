import "server-only";
/**
 * Liens de dépôt de pièces pour Claude : dans claude.ai, Claude lit le PDF mais ne peut pas en
 * transmettre le fichier au CRM. Après une création, il remet donc un lien à usage unique (24 h)
 * où la personne dépose la pièce d'origine, rattachée à l'élément créé. Claude Code peut aussi
 * l'envoyer lui-même (`curl -T fichier.pdf <upload_url>`).
 *
 * Le lien est l'unique justificatif : jeton aléatoire de 256 bits, empreinte SHA-256 seule stockée,
 * droits de l'utilisateur revérifiés au dépôt, type réel et taille contrôlés par `saveAttachment`.
 */
import { randomBytes } from "node:crypto";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import { publicAppUrl } from "../app-url";
import { attachmentOwnerExists, canWriteAttachment, linkAttachment, saveAttachment } from "../attachments";
import { currentAuditSource, recordAudit, withAuditSource } from "../audit";
import { loadActor } from "../auth/actor";
import { prisma } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { can, type Actor } from "../policies";
import { getSettings } from "../settings";
import { recordUrl } from "../ai/record-links";
import { sha256 } from "./oauth";

export const UPLOAD_TICKET_TTL_HOURS = 24;
const TOKEN_PATTERN = /^avc_up_[A-Za-z0-9_-]{43}$/;

export interface UploadLink {
  /** Page à ouvrir dans un navigateur (glisser-déposer, téléphone compris). */
  url: string;
  /** Envoi direct du fichier (PUT du contenu brut ou POST multipart « file »). */
  upload_url: string;
  expires_at: string;
}

/** Lien de dépôt pour un élément que l'utilisateur peut modifier. */
export async function createUploadTicket(actor: Actor, owner: { type: AttachmentOwner; id: string; label: string }): Promise<UploadLink> {
  if (!can(actor, "assistant.use") || !(await canWriteAttachment(actor, owner.type, owner.id))) throw new ForbiddenError();
  if (!(await attachmentOwnerExists(owner.type, owner.id))) throw new NotFoundError();
  const token = `avc_up_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + UPLOAD_TICKET_TTL_HOURS * 3_600_000);
  await prisma.mcpUploadTicket.create({
    data: {
      tokenHash: sha256(token),
      userId: actor.id,
      mcpTokenId: currentAuditSource()?.mcpTokenId ?? null,
      ownerType: owner.type,
      ownerId: owner.id,
      label: owner.label.slice(0, 200),
      expiresAt,
    },
  });
  const base = publicAppUrl();
  return { url: `${base}/depot/${token}`, upload_url: `${base}/api/mcp/upload/${token}`, expires_at: expiresAt.toISOString() };
}

async function findTicket(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  return prisma.mcpUploadTicket.findUnique({ where: { tokenHash: sha256(token) } });
}

export type UploadTicketState =
  | { status: "ready"; label: string; expiresAt: Date; maxUploadMb: number }
  | { status: "used"; label: string }
  | { status: "expired" }
  | { status: "unknown" };

/** État d'un lien pour la page de dépôt (aucune donnée de l'élément au-delà de son libellé). */
export async function describeUploadTicket(token: string): Promise<UploadTicketState> {
  const ticket = await findTicket(token);
  if (!ticket) return { status: "unknown" };
  if (ticket.usedAt) return { status: "used", label: ticket.label };
  if (ticket.expiresAt.getTime() < Date.now()) return { status: "expired" };
  const settings = await getSettings();
  return { status: "ready", label: ticket.label, expiresAt: ticket.expiresAt, maxUploadMb: settings.maxUploadMb };
}

/**
 * Dépôt du fichier : lien valide et inutilisé, droits de l'utilisateur toujours actifs, puis
 * enregistrement de la pièce et rattachement à l'élément (journalisé « via Claude »).
 */
export async function consumeUploadTicket(token: string, file: File): Promise<{ attachmentId: string; label: string; url: string }> {
  const ticket = await findTicket(token);
  if (!ticket) throw new NotFoundError("Lien de dépôt inconnu : demandez un nouveau lien à Claude.");
  if (ticket.usedAt) throw new DomainError("Ce lien a déjà servi : demandez un nouveau lien à Claude.");
  if (ticket.expiresAt.getTime() < Date.now()) throw new DomainError("Lien de dépôt expiré : demandez un nouveau lien à Claude.");
  const actor = await loadActor(ticket.userId);
  if (!actor || !can(actor, "assistant.use") || !(await canWriteAttachment(actor, ticket.ownerType, ticket.ownerId))) throw new ForbiddenError();
  if (!(await attachmentOwnerExists(ticket.ownerType, ticket.ownerId))) throw new NotFoundError();
  // Usage unique, y compris en cas d'envois simultanés ; le lien est libéré si le fichier est refusé.
  const claimed = await prisma.mcpUploadTicket.updateMany({ where: { id: ticket.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new DomainError("Ce lien a déjà servi : demandez un nouveau lien à Claude.");
  try {
    return await withAuditSource({ via: "MCP", mcpTokenId: ticket.mcpTokenId }, async () => {
      const attachmentId = await saveAttachment(prisma, actor, file, { type: ticket.ownerType, id: ticket.ownerId });
      await linkAttachment(prisma, ticket.ownerType, ticket.ownerId, attachmentId);
      await prisma.mcpUploadTicket.update({ where: { id: ticket.id }, data: { attachmentId } });
      await recordAudit(prisma, {
        actorId: actor.id,
        action: "attachment.upload",
        entityType: ticket.ownerType,
        entityId: ticket.ownerId,
        after: { attachmentId, filename: file.name, uploadTicketId: ticket.id },
      });
      return { attachmentId, label: ticket.label, url: recordUrl(ticket.ownerType, ticket.ownerId) };
    });
  } catch (error) {
    await prisma.mcpUploadTicket.update({ where: { id: ticket.id }, data: { usedAt: null } }).catch(() => undefined);
    throw error;
  }
}
