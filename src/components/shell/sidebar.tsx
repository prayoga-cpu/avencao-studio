import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { can } from "@/server/policies";
import { getSettings } from "@/server/settings";
import { LogoutButton } from "./logout-button";
import { MobileNav } from "./mobile-nav";
import { NAV_ITEMS } from "./nav-config";
import { NavLinks } from "./nav-links";

/** Barre latérale (desktop ≈ 280 px) et barre supérieure mobile. Lit la session : rendue derrière <Suspense>. */
export async function Sidebar() {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  if (actor.role === "VISITOR" || actor.role === "CLIENT") redirect("/acces-refuse");
  const [settings, unread] = await Promise.all([
    getSettings(),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  // Logo personnalisé (Réglages) servi par la route autorisée ; sinon logo Avencao fourni.
  const logoSrc = settings.logoAttachmentId ? `/api/files/${settings.logoAttachmentId}` : "/brand/logo-avencao.png";
  const items = NAV_ITEMS.filter((i) => i.anyOf.some((p) => can(actor, p))).map(({ href, label, icon }) => ({
    href,
    label,
    icon,
  }));

  const profile = (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-3">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-surface-2 text-sm font-bold"
          aria-hidden
        >
          {initials(actor.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{actor.name}</p>
          <p className="truncate text-xs font-bold text-warning">{ROLE_LABELS[actor.role]}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link
          href="/notifications"
          className="relative inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-subtle hover:bg-brand-soft hover:text-foreground"
        >
          <Bell className="size-4" aria-hidden />
          Notifications
          {unread > 0 ? (
            <span className="num rounded-full bg-brand px-1.5 text-[0.7rem] font-bold text-white">
              {unread > 99 ? "99+" : unread}
              <span className="sr-only"> non lues</span>
            </span>
          ) : null}
        </Link>
        <LogoutButton compact />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile : barre supérieure + tiroir */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-border bg-[#0b0b0bf2] px-3 py-2 backdrop-blur lg:hidden">
        <MobileNav items={items} footer={profile} agencyName={settings.name} />
        <Link href={items[0]?.href ?? "/"} className="flex items-center gap-2">
          <Image src={logoSrc} alt={settings.name} width={28} height={28} unoptimized={!!settings.logoAttachmentId} />
          <span className="text-sm font-bold">{settings.name}</span>
        </Link>
        <Link href="/notifications" className="relative rounded-lg p-2" aria-label={`Notifications (${unread} non lues)`}>
          <Bell className="size-5 text-subtle" aria-hidden />
          {unread > 0 ? <span className="absolute right-1 top-1 size-2 rounded-full bg-brand" aria-hidden /> : null}
        </Link>
      </div>

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-brand-border bg-sidebar px-4 py-5 shadow-[0_0_40px_rgba(255,0,102,0.08)] lg:flex av-scroll">
        <Link href={items[0]?.href ?? "/"} className="flex flex-col items-center gap-2 py-1">
          <Image src={logoSrc} alt="" width={84} height={84} priority unoptimized={!!settings.logoAttachmentId} className="opacity-95" />
          <span className="text-sm font-bold tracking-[0.2em] text-subtle uppercase">{settings.name}</span>
        </Link>
        {profile}
        <NavLinks items={items} />
      </aside>
    </>
  );
}

export function SidebarSkeleton() {
  return (
    <>
      <div className="h-12 border-b border-brand-border bg-sidebar lg:hidden" />
      <aside className="hidden h-dvh w-[280px] shrink-0 border-r border-brand-border bg-sidebar lg:block" aria-hidden />
    </>
  );
}
