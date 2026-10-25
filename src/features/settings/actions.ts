"use server";

import type { Role } from "@/generated/prisma/enums";
import type { AgencySettingsInput, InviteInput, TemplateInput } from "./schemas";
import { inviteSchema } from "./schemas";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { revalidateApp } from "@/server/revalidate";
import * as admin from "@/server/services/admin";
import { createResetLink, inviteUser, updateUserAccess } from "@/server/users";

function done<T>(r: T): T {
  revalidateApp();
  return r;
}

export async function updateAgencySettingsAction(input: AgencySettingsInput) {
  return safeAction(async () => done(await admin.updateAgencySettings(await actorFor("settings.manage"), input)), "Réglages enregistrés.");
}

/** Invitation : le rôle est choisi par l'administrateur ; aucun email n'est simulé. */
export async function inviteUserAction(input: InviteInput) {
  return safeAction(async () => {
    const actor = await actorFor("users.manage");
    const d = inviteSchema.parse(input);
    return done(await inviteUser(actor, { email: d.email, name: d.name, role: d.role, financeAccess: d.financeAccess, editorId: d.editorId || null }));
  });
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
