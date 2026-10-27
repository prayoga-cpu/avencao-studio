import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "./db";
import { toJsonSafe } from "./serialize";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Canal d'une modification : Claude (serveur MCP). Absent = écrans du CRM. */
export interface AuditSource {
  via: "MCP";
  /** Jeton MCP de la conversation (null : dépôt d'une pièce par lien, sans jeton). */
  mcpTokenId: string | null;
}

const source = new AsyncLocalStorage<AuditSource>();

/**
 * Exécute `fn` en marquant chaque entrée du journal écrite pendant l'appel avec son canal
 * (« via Claude »), sans changer la signature des services.
 */
export function withAuditSource<T>(value: AuditSource, fn: () => Promise<T>): Promise<T> {
  return source.run(value, fn);
}

export function currentAuditSource(): AuditSource | undefined {
  return source.getStore();
}

/** Journal d'audit : toute rectification de mouvement validé y laisse une trace. */
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  const channel = source.getStore();
  await db.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (toJsonSafe(input.before) as object),
      after: input.after === undefined ? undefined : (toJsonSafe(input.after) as object),
      reason: input.reason ?? null,
      via: channel?.via ?? null,
      mcpTokenId: channel?.mcpTokenId ?? null,
    },
  });
}
