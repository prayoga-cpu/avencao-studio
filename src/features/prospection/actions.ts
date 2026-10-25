"use server";

import type { OpportunityStage } from "@/generated/prisma/enums";
import type { OpportunityInput } from "./schemas";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { revalidateApp } from "@/server/revalidate";
import * as svc from "@/server/services/opportunities";

export async function createOpportunityAction(input: OpportunityInput) {
  return safeAction(async () => {
    const r = await svc.createOpportunity(await actorFor("prospection.write"), input);
    revalidateApp();
    return r;
  }, "Opportunité créée.");
}

export async function updateOpportunityAction(id: string, input: OpportunityInput) {
  return safeAction(async () => {
    const r = await svc.updateOpportunity(await actorFor("prospection.write"), id, input);
    revalidateApp();
    return r;
  }, "Opportunité enregistrée.");
}

export async function moveOpportunityAction(id: string, stage: OpportunityStage, lostReason = "") {
  return safeAction(async () => {
    const r = await svc.moveOpportunityStage(await actorFor("prospection.write"), { id, stage, lostReason });
    revalidateApp();
    return r;
  });
}

export async function convertOpportunityAction(id: string) {
  return safeAction(async () => {
    const r = await svc.convertOpportunityToProject(await actorFor("projects.write"), id);
    revalidateApp();
    return r;
  }, "Projet créé (aucune facture ni encaissement n'a été généré).");
}
