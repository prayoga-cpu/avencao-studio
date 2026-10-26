"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  Target,
  UserCog,
  Users,
  Wallet,
  Banknote,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIcon } from "./nav-config";
import { useT } from "#i18n";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  clients: Users,
  prospection: Target,
  projects: FolderKanban,
  videos: Clapperboard,
  editors: UserCog,
  planning: CalendarDays,
  finances: Wallet,
  reports: BarChart3,
  settings: Settings,
  missions: ListChecks,
  earnings: Banknote,
  claude: Sparkles,
};

export function NavLinks({
  items,
  onNavigate,
}: {
  items: { href: string; label: string; icon: NavIcon }[];
  onNavigate?: () => void;
}) {
  const tr = useT();
  const pathname = usePathname();
  return (
    <nav aria-label={tr("Navigation principale")}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#d9d9d9] transition-colors hover:bg-brand-soft hover:text-foreground",
                  active && "bg-brand-soft text-foreground shadow-[inset_3px_0_0_var(--av-accent)]",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-subtle")} />
                <span>{tr(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
