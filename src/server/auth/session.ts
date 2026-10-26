import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UnauthenticatedError } from "../errors";
import { assertCan, can, type Actor, type Permission } from "../policies";
import { auth } from "./auth";
import { loadActor } from "./actor";

/**
 * Couche d'accès (DAL) : lit la session à chaque requête, recharge le rôle depuis la
 * base (un changement de droits s'applique immédiatement) et renvoie un acteur réduit.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadActor(session.user.id);
});

/** Pour les pages : redirige vers la connexion ou la page « accès refusé ». */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  if (actor.role === "VISITOR" || actor.role === "CLIENT") redirect("/acces-refuse");
  return actor;
}

export async function requirePagePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission)) redirect("/acces-refuse");
  return actor;
}

/** Pour les Server Actions et Route Handlers : lève une erreur au lieu de rediriger. */
export async function actorFor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor || actor.role === "VISITOR" || actor.role === "CLIENT") throw new UnauthenticatedError();
  if (permission) assertCan(actor, permission);
  return actor;
}
