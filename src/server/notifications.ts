import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Db } from "./db";

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** Clé logique de l'événement ; combinée à l'utilisateur pour la déduplication. */
  eventKey: string;
}

/** Notifications internes dédupliquées et filtrées par préférences. Aucun envoi externe. */
export async function notify(db: Db, input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return 0;
  const disabled = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, type: input.type, enabled: false },
    select: { userId: true },
  });
  const muted = new Set(disabled.map((d) => d.userId));
  const targets = userIds.filter((id) => !muted.has(id));
  if (targets.length === 0) return 0;
  const result = await db.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupeKey: `${input.eventKey}:${userId}`,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Destinataires internes « production » : administrateurs et responsables actifs. */
export async function staffUserIds(db: Db): Promise<string[]> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", role: { in: ["ADMIN", "PRODUCTION_MANAGER"] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function adminUserIds(db: Db): Promise<string[]> {
  const users = await db.user.findMany({ where: { status: "ACTIVE", role: "ADMIN" }, select: { id: true } });
  return users.map((u) => u.id);
}
