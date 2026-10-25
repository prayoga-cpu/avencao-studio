import "server-only";
/**
 * Politiques d'autorisation centralisées (rôle × action), exécutées côté serveur.
 * Utilisées par les Server Components, Server Actions et Route Handlers.
 * Masquer un bouton ne suffit jamais : chaque mutation appelle `assertCan`.
 * Documentation : docs/permissions.md
 */
import type { Role } from "@/generated/prisma/enums";
import { ForbiddenError } from "./errors";

export type Permission =
  | "dashboard.view"
  | "finance.kpis"
  | "clients.read"
  | "clients.write"
  | "clients.import"
  | "clients.archive"
  | "prospection.read"
  | "prospection.write"
  | "projects.read"
  | "projects.write"
  | "videos.readAll"
  | "videos.write"
  | "videos.validate"
  | "videos.deliver"
  | "assignments.write"
  | "editors.read"
  | "editors.write"
  | "editors.appraisal"
  | "rates.read"
  | "rates.write"
  | "costs.read"
  | "costs.write"
  | "costs.validate"
  | "sales.read"
  | "sales.write"
  | "invoices.read"
  | "invoices.write"
  | "payments.read"
  | "payments.write"
  | "supplierPayments.read"
  | "supplierPayments.write"
  | "expenses.read"
  | "expenses.write"
  | "retainers.read"
  | "retainers.write"
  | "margins.project"
  | "margins.global"
  | "reports.finance"
  | "reports.operational"
  | "exports.finance"
  | "planning.view"
  | "notes.internal"
  | "notes.adminOnly"
  | "settings.manage"
  | "users.manage"
  | "imports.run"
  | "legacy.reconcile"
  | "missions.own"
  | "earnings.own"
  | "time.log";

export interface Actor {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  financeAccess: boolean;
  editorId: string | null;
}

const PRODUCTION: Permission[] = [
  "dashboard.view",
  "clients.read",
  "clients.write",
  "clients.import",
  "prospection.read",
  "prospection.write",
  "projects.read",
  "projects.write",
  "videos.readAll",
  "videos.write",
  "videos.validate",
  "videos.deliver",
  "assignments.write",
  "editors.read",
  "editors.write",
  "reports.operational",
  "planning.view",
  "notes.internal",
  "time.log",
];

/** Accès financier activable explicitement pour un responsable de production (sans marge globale). */
const FINANCE_GRANT: Permission[] = [
  "rates.read",
  "costs.read",
  "costs.write",
  "costs.validate",
  "sales.read",
  "sales.write",
  "invoices.read",
  "invoices.write",
  "payments.read",
  "payments.write",
  "supplierPayments.read",
  "supplierPayments.write",
  "expenses.read",
  "expenses.write",
  "retainers.read",
  "retainers.write",
  "margins.project",
  "exports.finance",
];

const ALL: Permission[] = [
  ...PRODUCTION,
  ...FINANCE_GRANT,
  "finance.kpis",
  "clients.archive",
  "editors.appraisal",
  "rates.write",
  "margins.global",
  "reports.finance",
  "notes.adminOnly",
  "settings.manage",
  "users.manage",
  "imports.run",
  "legacy.reconcile",
];

const EDITOR: Permission[] = ["missions.own", "earnings.own", "planning.view", "time.log"];

export function permissionsFor(actor: Pick<Actor, "role" | "financeAccess">): Set<Permission> {
  switch (actor.role) {
    case "ADMIN":
      return new Set(ALL);
    case "PRODUCTION_MANAGER":
      return new Set(actor.financeAccess ? [...PRODUCTION, ...FINANCE_GRANT] : PRODUCTION);
    case "EDITOR":
      return new Set(EDITOR);
    // Client (phase 2) et visiteur : aucun accès métier par défaut.
    case "CLIENT":
    case "VISITOR":
    default:
      return new Set();
  }
}

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  return permissionsFor(actor).has(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

export function isStaff(actor: Actor): boolean {
  return actor.role === "ADMIN" || actor.role === "PRODUCTION_MANAGER";
}

/** Rôles qu'un administrateur peut attribuer (jamais via un formulaire non-admin). */
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "PRODUCTION_MANAGER", "EDITOR", "VISITOR"];
