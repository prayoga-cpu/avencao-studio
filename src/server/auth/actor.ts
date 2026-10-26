import "server-only";
import { prisma } from "../db";
import type { Actor } from "../policies";
import { isMasterAdmin } from "./login-policy";

/**
 * Charge l'acteur d'un utilisateur depuis la base (rôle et statut relus à chaque requête :
 * un changement de droits ou une désactivation s'applique immédiatement, y compris aux jetons MCP).
 */
export async function loadActor(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      financeAccess: true,
      editorProfile: { select: { id: true } },
    },
  });
  if (!user) return null;
  // Administrateur principal : accès complet, quel que soit l'état enregistré en base.
  const master = isMasterAdmin(user.email);
  if (!master && user.status !== "ACTIVE") return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: master ? "ADMIN" : user.role,
    financeAccess: master ? true : user.financeAccess,
    editorId: user.editorProfile?.id ?? null,
  };
}
