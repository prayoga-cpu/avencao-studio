"use server";

import { z } from "zod";
import { actorFor } from "@/server/auth/session";
import { safeAction, type ActionResult } from "@/server/actions";
import { createPersonalToken, revokeGrant, revokePersonalToken, setGrantWriteAccess, setPersonalTokenWriteAccess } from "@/server/mcp/oauth";

const createSchema = z.object({
  name: z.string().trim().min(2, "Donnez un nom au jeton (ex. « Claude Code — MacBook »).").max(80, "Nom trop long (80 caractères maximum)."),
  days: z.coerce.number().int(),
  write: z.boolean().optional(),
});

/** Jeton personnel : affiché une seule fois au navigateur, seule son empreinte est stockée. */
export async function createPersonalTokenAction(input: { name: string; days: number; write?: boolean }): Promise<ActionResult<{ token: string }>> {
  return safeAction(async () => {
    const actor = await actorFor("assistant.use");
    const data = createSchema.parse(input);
    const { token } = await createPersonalToken(actor, data);
    return { token };
  }, "Jeton créé : copiez-le maintenant, il ne sera plus affiché.");
}

export async function revokePersonalTokenAction(id: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await actorFor("assistant.use");
    await revokePersonalToken(actor, z.string().min(1).max(64).parse(id));
    return null;
  }, "Jeton révoqué.");
}

export async function revokeGrantAction(grantId: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await actorFor("assistant.use");
    await revokeGrant(actor, z.string().min(1).max(64).parse(grantId));
    return null;
  }, "Accès de l'application révoqué.");
}

/** Écriture par Claude (portée crm:write) : activée ou retirée pour une application connectée. */
export async function setGrantWriteAccessAction(grantId: string, write: boolean): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await actorFor("assistant.use");
    await setGrantWriteAccess(actor, z.string().min(1).max(64).parse(grantId), z.boolean().parse(write));
    return null;
  }, "Accès de Claude mis à jour.");
}

export async function setTokenWriteAccessAction(tokenId: string, write: boolean): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await actorFor("assistant.use");
    await setPersonalTokenWriteAccess(actor, z.string().min(1).max(64).parse(tokenId), z.boolean().parse(write));
    return null;
  }, "Accès de Claude mis à jour.");
}
