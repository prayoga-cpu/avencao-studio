"use server";

import type { NotificationType } from "@/generated/prisma/enums";
import { safeAction } from "@/server/actions";
import { actorFor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { revalidateApp } from "@/server/revalidate";

export async function markNotificationsReadAction(ids: string[] | "all") {
  return safeAction(async () => {
    const actor = await actorFor();
    await prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    revalidateApp();
    return null;
  });
}

export async function setNotificationPreferenceAction(type: NotificationType, enabled: boolean) {
  return safeAction(async () => {
    const actor = await actorFor();
    await prisma.notificationPreference.upsert({
      where: { userId_type: { userId: actor.id, type } },
      update: { enabled },
      create: { userId: actor.id, type, enabled },
    });
    revalidateApp();
    return null;
  }, "Préférence enregistrée.");
}
