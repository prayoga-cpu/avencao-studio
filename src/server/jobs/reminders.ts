import "server-only";
/**
 * Rappels internes (idempotents) : la clé de déduplication de chaque notification
 * garantit qu'une relance du job ne crée aucun doublon.
 */
import { addDays, toDateOnlyString, todayInTimezone } from "@/lib/dates";
import { prisma } from "../db";
import { CLOSED_VIDEO_STATUSES } from "../domain/video-workflow";
import { adminUserIds, notify, staffUserIds } from "../notifications";
import { getSettingsUncached } from "./settings";

export async function runReminderScan(now = new Date()) {
  const settings = await getSettingsUncached();
  const today = todayInTimezone(settings.timezone, now);
  const soon = addDays(today, settings.deadlineSoonDays);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const soonDate = new Date(`${soon}T00:00:00Z`);
  const staff = await staffUserIds(prisma);
  const admins = await adminUserIds(prisma);
  const open = { status: { notIn: [...CLOSED_VIDEO_STATUSES, "APPROVED" as const] } };
  const videos = await prisma.video.findMany({
    where: { ...open, OR: [{ clientDeadline: { lte: soonDate } }, { internalDeadline: { lte: soonDate } }] },
    select: {
      id: true, reference: true, title: true, clientDeadline: true, internalDeadline: true, status: true, updatedAt: true,
      assignments: { where: { status: { not: "CANCELLED" } }, select: { editor: { select: { userId: true } } } },
    },
  });
  let created = 0;
  for (const v of videos) {
    const editors = v.assignments.map((a) => a.editor.userId).filter((x): x is string => !!x);
    for (const [field, date] of [["client", v.clientDeadline], ["interne", v.internalDeadline]] as const) {
      if (!date) continue;
      const d = toDateOnlyString(date);
      if (d < today) {
        created += await notify(prisma, {
          userIds: field === "client" ? staff : [...staff, ...editors],
          type: "OVERDUE",
          title: `En retard : ${v.title}`,
          body: `${v.reference} — deadline ${field} du ${d} dépassée`,
          link: `/videos/${v.id}`,
          entityType: "Video",
          entityId: v.id,
          eventKey: `overdue:${v.id}:${field}:${d}`,
        });
      } else if (d <= soon) {
        created += await notify(prisma, {
          userIds: field === "client" ? staff : [...staff, ...editors],
          type: "DEADLINE_SOON",
          title: `Échéance proche : ${v.title}`,
          body: `${v.reference} — deadline ${field} le ${d}`,
          link: `/videos/${v.id}`,
          entityType: "Video",
          entityId: v.id,
          eventKey: `deadline-soon:${v.id}:${field}:${d}`,
        });
      }
    }
  }
  // Validation en attente depuis plus d'un jour.
  const waiting = await prisma.video.findMany({
    where: { status: { in: ["INTERNAL_REVIEW", "CLIENT_REVIEW"] }, updatedAt: { lt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, reference: true, title: true, status: true, updatedAt: true },
  });
  for (const v of waiting) {
    created += await notify(prisma, {
      userIds: staff,
      type: "VALIDATION_PENDING",
      title: `Validation en attente : ${v.title}`,
      body: `${v.reference} attend une décision depuis le ${toDateOnlyString(v.updatedAt)}`,
      link: `/videos/${v.id}?onglet=versions`,
      entityType: "Video",
      entityId: v.id,
      eventKey: `validation-wait:${v.id}:${v.status}:${toDateOnlyString(v.updatedAt)}`,
    });
  }
  // Coûts manquants : un récapitulatif par jour.
  const missing = await prisma.directCost.count({ where: { amount: null, stage: { not: "CANCELLED" } } });
  if (missing > 0) {
    created += await notify(prisma, {
      userIds: admins,
      type: "MISSING_COST",
      title: `${missing} coût(s) à renseigner`,
      body: "Les marges concernées restent provisoires.",
      link: "/finances?onglet=couts&manquants=1",
      eventKey: `missing-costs:${today}`,
    });
  }
  void todayDate;
  return { scannedVideos: videos.length, waiting: waiting.length, notificationsCreated: created };
}
