"use server";

import type { Role } from "@/generated/prisma/enums";
import type { AgencySettingsInput, InviteInput, TemplateInput } from "./schemas";
import { inviteSchema, setPasswordSchema } from "./schemas";
import { safeAction, type ActionResult } from "@/server/actions";
import type { InviteResult } from "@/server/users";
import { actorFor } from "@/server/auth/session";
import { revalidateApp } from "@/server/revalidate";
import * as admin from "@/server/services/admin";
import { createResetLink, createUserWithPassword, inviteUser, setUserPassword, updateUserAccess } from "@/server/users";

function done<T>(r: T): T {
  revalidateApp();
  return r;
}

export async function updateAgencySettingsAction(input: AgencySettingsInput) {
  return safeAction(async () => done(await admin.updateAgencySettings(await actorFor("settings.manage"), input)), "Réglages enregistrés.");
}

/** Invitation : le rôle est choisi par l'administrateur ; aucun email n'est simulé. */
export type CreateAccountResult = { kind: "password"; email: string } | ({ kind: "link" } & InviteResult);

export async function inviteUserAction(input: InviteInput): Promise<ActionResult<CreateAccountResult>> {
  if (input.password) {
    return safeAction(async () => {
      const actor = await actorFor("users.manage");
      const d = inviteSchema.parse(input);
      const created = await createUserWithPassword(actor, { email: d.email, name: d.name, role: d.role, financeAccess: d.financeAccess, editorId: d.editorId || null, password: d.password });
      revalidateApp();
      return { kind: "password" as const, email: created.email };
    }, "Compte créé : la personne peut se connecter avec ce mot de passe.");
  }
  return safeAction(async () => {
    const actor = await actorFor("users.manage");
    const d = inviteSchema.parse(input);
    const invite = await inviteUser(actor, { email: d.email, name: d.name, role: d.role, financeAccess: d.financeAccess, editorId: d.editorId || null });
    revalidateApp();
    return { kind: "link" as const, ...invite };
  });
}

export async function setUserPasswordAction(userId: string, password: string) {
  return safeAction(async () => {
    const actor = await actorFor("users.manage");
    const d = setPasswordSchema.parse({ password });
    return done(await setUserPassword(actor, userId, d.password));
  }, "Mot de passe modifié : les sessions de cet utilisateur ont été fermées.");
}

export async function resetLinkAction(userId: string) {
  return safeAction(async () => done(await createResetLink(await actorFor("users.manage"), userId)));
}

export async function updateUserAccessAction(userId: string, input: { role: Role; financeAccess: boolean; status: "ACTIVE" | "DISABLED" }) {
  return safeAction(async () => done(await updateUserAccess(await actorFor("users.manage"), userId, input)), "Accès mis à jour (sessions révoquées si nécessaire).");
}

export async function saveTemplateAction(input: TemplateInput) {
  return safeAction(async () => done(await admin.saveTemplate(await actorFor("settings.manage"), input)), "Modèle enregistré.");
}

export async function addChecklistItemAction(label: string) {
  return safeAction(async () => done(await admin.addChecklistItem(await actorFor("settings.manage"), label)), "Point de contrôle ajouté (pour les nouvelles vidéos).");
}

export async function toggleChecklistItemAction(id: string, active: boolean) {
  return safeAction(async () => done(await admin.toggleChecklistItem(await actorFor("settings.manage"), id, active)));
}

export async function addExpenseCategoryAction(name: string) {
  return safeAction(async () => done(await admin.addExpenseCategory(await actorFor("settings.manage"), name)), "Catégorie ajoutée.");
}

export async function toggleExpenseCategoryAction(id: string, active: boolean) {
  return safeAction(async () => done(await admin.toggleExpenseCategory(await actorFor("settings.manage"), id, active)));
}
