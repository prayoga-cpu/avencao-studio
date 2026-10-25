"use server";

import type { EditorInput, RateCardInput, UnavailabilityInput } from "./schemas";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { revalidateApp } from "@/server/revalidate";
import * as svc from "@/server/services/editors";

export async function createEditorAction(input: EditorInput) {
  return safeAction(async () => {
    const r = await svc.createEditor(await actorFor("editors.write"), input);
    revalidateApp();
    return r;
  }, "Prestataire créé.");
}

export async function updateEditorAction(id: string, input: EditorInput) {
  return safeAction(async () => {
    const r = await svc.updateEditor(await actorFor("editors.write"), id, input);
    revalidateApp();
    return r;
  }, "Fiche enregistrée.");
}

export async function saveRateCardAction(input: RateCardInput) {
  return safeAction(async () => {
    const r = await svc.saveRateCard(await actorFor("rates.write"), input);
    revalidateApp();
    return r;
  }, "Tarif enregistré. Les missions déjà affectées gardent leur tarif figé.");
}

export async function deactivateRateCardAction(id: string) {
  return safeAction(async () => {
    await svc.deactivateRateCard(await actorFor("rates.write"), id);
    revalidateApp();
    return null;
  }, "Tarif désactivé.");
}

export async function addUnavailabilityAction(input: UnavailabilityInput) {
  return safeAction(async () => {
    const r = await svc.addUnavailability(await actorFor(), input);
    revalidateApp();
    return r;
  }, "Indisponibilité enregistrée.");
}

export async function removeUnavailabilityAction(id: string) {
  return safeAction(async () => {
    await svc.removeUnavailability(await actorFor(), id);
    revalidateApp();
    return null;
  }, "Indisponibilité supprimée.");
}
