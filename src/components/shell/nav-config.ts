import type { Permission } from "@/server/policies";

export type NavIcon =
  | "dashboard"
  | "clients"
  | "prospection"
  | "projects"
  | "videos"
  | "editors"
  | "planning"
  | "finances"
  | "reports"
  | "settings"
  | "missions"
  | "earnings";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  anyOf: Permission[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard", anyOf: ["dashboard.view"] },
  { href: "/missions", label: "Mes missions", icon: "missions", anyOf: ["missions.own"] },
  { href: "/clients", label: "Clients", icon: "clients", anyOf: ["clients.read"] },
  { href: "/prospection", label: "Prospection", icon: "prospection", anyOf: ["prospection.read"] },
  { href: "/projets", label: "Projets", icon: "projects", anyOf: ["projects.read"] },
  { href: "/videos", label: "Vidéos", icon: "videos", anyOf: ["videos.readAll"] },
  { href: "/monteurs", label: "Monteurs", icon: "editors", anyOf: ["editors.read"] },
  { href: "/planning", label: "Planning", icon: "planning", anyOf: ["planning.view"] },
  { href: "/mes-reglements", label: "Mes règlements", icon: "earnings", anyOf: ["earnings.own"] },
  {
    href: "/finances",
    label: "Finances",
    icon: "finances",
    anyOf: ["invoices.read", "costs.read", "payments.read", "expenses.read"],
  },
  { href: "/rapports", label: "Rapports", icon: "reports", anyOf: ["reports.operational", "reports.finance"] },
  { href: "/reglages", label: "Réglages", icon: "settings", anyOf: ["settings.manage", "users.manage"] },
];
