import "server-only";
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

/** Journal d'audit : toute rectification de mouvement validé y laisse une trace. */
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (toJsonSafe(input.before) as object),
      after: input.after === undefined ? undefined : (toJsonSafe(input.after) as object),
      reason: input.reason ?? null,
    },
  });
}
