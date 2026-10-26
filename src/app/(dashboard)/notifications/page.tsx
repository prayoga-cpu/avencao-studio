import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/app/action-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { markNotificationsReadAction, setNotificationPreferenceAction } from "@/features/notifications/actions";
import { formatDateTime } from "@/lib/dates";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/labels";
import type { NotificationType } from "@/generated/prisma/enums";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Notifications") };
}

export default async function NotificationsPage() {
  const tr = await getT();
  const actor = await requireActor();
  const [items, prefs, settings] = await Promise.all([
    prisma.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notificationPreference.findMany({ where: { userId: actor.id } }),
    getSettings(),
  ]);
  const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.type));
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader
        title={tr("Notifications")}
        subtitle={tr("Notifications internes uniquement. Aucun email ni WhatsApp n'est envoyé sans canal connecté et activé.")}
        actions={unread ? <ActionButton size="sm" action={markNotificationsReadAction.bind(null, "all")}>{tr("Tout marquer comme lu (")}{unread})</ActionButton> : null}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Section title={tr("Récentes")} className="xl:col-span-2" bodyClassName="p-0">
          {items.length === 0 ? (
            <EmptyState className="m-4" title={tr("Aucune notification")} description={tr("Missions attribuées, échéances proches, retards, retours, validations, seuil de marge, coûts manquants.")} />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 text-sm", !n.readAt && "bg-brand-soft/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={tr(NOTIFICATION_TYPE_LABELS[n.type])} tone={n.type === "OVERDUE" || n.type === "MARGIN_BELOW_THRESHOLD" ? "danger" : n.type === "MISSING_COST" || n.type === "DEADLINE_SOON" ? "warning" : "info"} />
                      <span className="text-xs text-faint">{formatDateTime(n.createdAt, settings.timezone)}</span>
                      {!n.readAt ? <span className="sr-only">{tr("non lue")}</span> : null}
                    </div>
                    {n.link ? <Link href={n.link} className="mt-1 block font-medium hover:text-brand">{tr(n.title)}</Link> : <p className="mt-1 font-medium">{tr(n.title)}</p>}
                    {n.body ? <p className="text-xs text-subtle">{tr(n.body)}</p> : null}
                  </div>
                  {!n.readAt ? <ActionButton size="xs" variant="ghost" action={markNotificationsReadAction.bind(null, [n.id])}>{tr("Lu")}</ActionButton> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tr("Préférences")} description={tr("Désactiver un type stoppe les nouvelles notifications de ce type pour vous.")}>
          <ul className="flex flex-col gap-2">
            {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((t) => (
              <li key={t} className="flex items-center justify-between gap-2 text-sm">
                <span>{tr(NOTIFICATION_TYPE_LABELS[t])}</span>
                <ActionButton size="xs" variant={disabled.has(t) ? "outline" : "ghost"} action={setNotificationPreferenceAction.bind(null, t, disabled.has(t))}>
                  {disabled.has(t) ? tr("Désactivée — réactiver") : tr("Activée — couper")}
                </ActionButton>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
