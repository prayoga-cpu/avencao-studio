"use server";

import type { ActivityInput, ClientInput, ContactInput, NoteInput } from "./schemas";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { revalidateApp } from "@/server/revalidate";
import * as svc from "@/server/services/clients";

export async function createClientAction(input: ClientInput) {
  return safeAction(async () => {
    const actor = await actorFor("clients.write");
    const result = await svc.createClient(actor, input);
    if ("id" in result) revalidateApp();
    return result;
  });
}

export async function updateClientAction(id: string, input: ClientInput) {
  return safeAction(async () => {
    const actor = await actorFor("clients.write");
    const result = await svc.updateClient(actor, id, input);
    if ("id" in result) revalidateApp();
    return result;
  });
}

export async function saveContactAction(input: ContactInput) {
  return safeAction(async () => {
    const actor = await actorFor("clients.write");
    const r = await svc.saveContact(actor, input);
    revalidateApp();
    return r;
  }, "Contact enregistré.");
}

export async function deleteContactAction(contactId: string) {
  return safeAction(async () => {
    const actor = await actorFor("clients.write");
    await svc.deleteContact(actor, contactId);
    revalidateApp();
    return null;
  }, "Contact supprimé.");
}

export async function addNoteAction(input: NoteInput) {
  return safeAction(async () => {
    const actor = await actorFor("notes.internal");
    const r = await svc.addNote(actor, input);
    revalidateApp();
    return r;
  }, "Note ajoutée.");
}

export async function deleteNoteAction(noteId: string) {
  return safeAction(async () => {
    const actor = await actorFor("notes.internal");
    await svc.deleteNote(actor, noteId);
    revalidateApp();
    return null;
  }, "Note supprimée.");
}

export async function addActivityAction(input: ActivityInput) {
  return safeAction(async () => {
    const actor = await actorFor("prospection.write");
    const r = await svc.addActivity(actor, input);
    revalidateApp();
    return r;
  }, "Activité enregistrée.");
}

export async function previewClientImportAction(rows: import("@/server/services/clients").ImportRow[]) {
  return safeAction(async () => svc.previewClientImport(await actorFor("clients.import"), rows));
}

export async function commitClientImportAction(rows: import("@/server/services/clients").ImportRow[], forceIndexes: number[]) {
  return safeAction(async () => {
    const r = await svc.commitClientImport(await actorFor("clients.import"), rows, forceIndexes);
    revalidateApp();
    return r;
  });
}
