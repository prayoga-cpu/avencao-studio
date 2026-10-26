import "server-only";
import { publicAppUrl } from "./app-url";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role, TokenPurpose } from "@/generated/prisma/enums";
import { recordAudit } from "./audit";
import { prisma } from "./db";
import { DomainError, ForbiddenError } from "./errors";
import { sendMail } from "./mail";
import { ASSIGNABLE_ROLES, assertCan, type Actor } from "./policies";

const INVITE_TTL_HOURS = 72;
const RESET_TTL_HOURS = 24;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return publicAppUrl();
}

async function issueToken(userId: string, purpose: TokenPurpose, createdById: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ttl = purpose === "INVITE" ? INVITE_TTL_HOURS : RESET_TTL_HOURS;
  await prisma.$transaction([
    prisma.accessToken.updateMany({
      where: { userId, purpose, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.accessToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttl * 3600 * 1000),
        createdById,
      },
    }),
  ]);
  return token;
}

export interface InviteResult {
  url: string;
  emailSent: boolean;
  expiresInHours: number;
}

/** Invitation par un administrateur. Le rôle est fixé par l'admin, jamais par l'invité. */
export async function inviteUser(
  actor: Actor,
  input: { email: string; name: string; role: Role; financeAccess: boolean; editorId?: string | null },
): Promise<InviteResult> {
  assertCan(actor, "users.manage");
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new DomainError("Rôle non attribuable.");
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, include: { accounts: true } });
  if (existing?.accounts.some((a) => a.providerId === "credential" && a.password)) {
    throw new DomainError("Un compte actif existe déjà pour cet email : utilisez « Lien de réinitialisation ».");
  }
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: input.name, role: input.role, financeAccess: input.financeAccess, status: "ACTIVE" },
      })
    : await prisma.user.create({
        data: { email, name: input.name, role: input.role, financeAccess: input.financeAccess, status: "ACTIVE" },
      });
  if (input.editorId) {
    const editor = await prisma.editorProfile.findUnique({ where: { id: input.editorId } });
    if (!editor) throw new DomainError("Fiche prestataire introuvable.");
    if (editor.userId && editor.userId !== user.id) throw new DomainError("Cette fiche est déjà liée à un autre compte.");
    await prisma.editorProfile.update({ where: { id: input.editorId }, data: { userId: user.id } });
  }
  const token = await issueToken(user.id, "INVITE", actor.id);
  const url = `${appUrl()}/mot-de-passe/${token}`;
  const mail = await sendMail({
    to: email,
    subject: "Invitation à rejoindre le CRM Avencao",
    text: `Bonjour ${input.name},\n\nVous êtes invité(e) sur le CRM Avencao. Choisissez votre mot de passe via ce lien (valable ${INVITE_TTL_HOURS} h) :\n${url}`,
  });
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "user.invite",
    entityType: "User",
    entityId: user.id,
    after: { email, role: input.role, financeAccess: input.financeAccess, editorId: input.editorId ?? null },
  });
  return { url, emailSent: mail.sent, expiresInHours: INVITE_TTL_HOURS };
}

export async function createResetLink(actor: Actor, userId: string): Promise<InviteResult> {
  assertCan(actor, "users.manage");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await issueToken(user.id, "RESET", actor.id);
  const url = `${appUrl()}/mot-de-passe/${token}`;
  const mail = await sendMail({
    to: user.email,
    subject: "Avencao — définir un nouveau mot de passe",
    text: `Bonjour ${user.name},\n\nUn administrateur a généré un lien pour définir votre mot de passe (valable ${RESET_TTL_HOURS} h) :\n${url}`,
  });
  await recordAudit(prisma, { actorId: actor.id, action: "user.reset_link", entityType: "User", entityId: user.id });
  return { url, emailSent: mail.sent, expiresInHours: RESET_TTL_HOURS };
}

export async function findValidToken(token: string) {
  const row = await prisma.accessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, status: true } } },
  });
  if (!row || row.usedAt || row.revokedAt || row.expiresAt < new Date()) return null;
  if (row.user.status !== "ACTIVE") return null;
  return row;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Mot de passe du compte « credential » Better Auth (création ou remplacement). */
async function storeCredentialPassword(tx: TxClient, userId: string, hash: string) {
  const account = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
  if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
  else await tx.account.create({ data: { userId, providerId: "credential", accountId: userId, password: hash } });
}

function assertPasswordPolicy(password: string) {
  if (password.length < 10 || password.length > 128) throw new DomainError("Le mot de passe doit contenir entre 10 et 128 caractères.");
}

/**
 * Création directe d'un compte par un administrateur, avec mot de passe défini par lui :
 * le compte est actif immédiatement (aucun email requis). Le rôle est fixé par l'admin.
 */
export async function createUserWithPassword(
  actor: Actor,
  input: { email: string; name: string; role: Role; financeAccess: boolean; editorId?: string | null; password: string },
): Promise<{ id: string; email: string }> {
  assertCan(actor, "users.manage");
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new DomainError("Rôle non attribuable.");
  assertPasswordPolicy(input.password);
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, include: { accounts: true } });
  if (existing?.accounts.some((a) => a.providerId === "credential" && a.password)) {
    throw new DomainError("Un compte avec mot de passe existe déjà pour cet email : utilisez « Mot de passe » sur sa ligne.");
  }
  if (input.editorId) {
    const editor = await prisma.editorProfile.findUnique({ where: { id: input.editorId } });
    if (!editor) throw new DomainError("Fiche prestataire introuvable.");
    if (editor.userId && editor.userId !== existing?.id) throw new DomainError("Cette fiche est déjà liée à un autre compte.");
  }
  const hash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: input.name, role: input.role, financeAccess: input.financeAccess, status: "ACTIVE", emailVerified: true },
        })
      : await tx.user.create({
          data: { email, name: input.name, role: input.role, financeAccess: input.financeAccess, status: "ACTIVE", emailVerified: true },
        });
    await storeCredentialPassword(tx, u.id, hash);
    if (input.editorId) await tx.editorProfile.update({ where: { id: input.editorId }, data: { userId: u.id } });
    return u;
  });
  await recordAudit(prisma, {
    actorId: actor.id,
    action: "user.create_with_password",
    entityType: "User",
    entityId: user.id,
    after: { email, role: input.role, financeAccess: input.financeAccess, editorId: input.editorId ?? null },
  });
  return { id: user.id, email };
}

/** Changement de mot de passe par un administrateur : toutes les sessions de l'utilisateur sont fermées. */
export async function setUserPassword(actor: Actor, userId: string, password: string): Promise<{ id: string }> {
  assertCan(actor, "users.manage");
  assertPasswordPolicy(password);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new DomainError("Utilisateur introuvable.");
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await storeCredentialPassword(tx, userId, hash);
    await tx.accessToken.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { emailVerified: true } });
  });
  await recordAudit(prisma, { actorId: actor.id, action: "user.password_set_by_admin", entityType: "User", entityId: userId });
  return { id: userId };
}

/** Définit le mot de passe (hachage Better Auth) et révoque toutes les sessions existantes. */
export async function consumeToken(token: string, password: string): Promise<{ email: string }> {
  assertPasswordPolicy(password);
  const row = await findValidToken(token);
  if (!row) throw new DomainError("Lien invalide ou expiré. Demandez un nouveau lien à un administrateur.");
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.accessToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new DomainError("Lien déjà utilisé.");
    await storeCredentialPassword(tx, row.userId, hash);
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.user.update({ where: { id: row.userId }, data: { emailVerified: true } });
  });
  await recordAudit(prisma, {
    actorId: row.userId,
    action: row.purpose === "INVITE" ? "user.invite_accepted" : "user.password_reset",
    entityType: "User",
    entityId: row.userId,
  });
  return { email: row.user.email };
}

export async function updateUserAccess(
  actor: Actor,
  userId: string,
  input: { role: Role; financeAccess: boolean; status: "ACTIVE" | "DISABLED" },
) {
  assertCan(actor, "users.manage");
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new DomainError("Rôle non attribuable.");
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.id === actor.id && (input.role !== "ADMIN" || input.status !== "ACTIVE")) {
    throw new ForbiddenError("Vous ne pouvez pas retirer vos propres droits administrateur.");
  }
  if (target.role === "ADMIN" && (input.role !== "ADMIN" || input.status !== "ACTIVE")) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: target.id } } });
    if (admins === 0) throw new DomainError("Impossible : il doit rester au moins un administrateur actif.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: input.role,
        financeAccess: input.role === "PRODUCTION_MANAGER" ? input.financeAccess : input.role === "ADMIN",
        status: input.status,
        suggestedRole: null,
      },
    });
    // Révocation immédiate : un compte désactivé ou rétrogradé perd ses sessions.
    if (input.status !== "ACTIVE" || input.role !== target.role) {
      await tx.session.deleteMany({ where: { userId } });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "user.access_update",
      entityType: "User",
      entityId: userId,
      before: { role: target.role, financeAccess: target.financeAccess, status: target.status },
      after: input,
    });
  });
}
