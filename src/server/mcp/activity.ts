import "server-only";
import { TOOL_LABELS } from "../ai/tools";
import { prisma } from "../db";
import type { Actor } from "../policies";

export interface ClaudeActivity {
  id: string;
  at: Date;
  user: string | null;
  /** Libellé de l'outil (texte français, traduit à l'affichage). */
  tool: string;
  partial: boolean;
  records: { label: string; href: string }[];
}

interface JournalRecord {
  label?: string;
  url?: string;
}

/** Chemin interne d'un lien enregistré (les liens du journal sont absolus). */
function hrefOf(url: string | undefined): string {
  if (!url) return "/claude";
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return "/claude";
  }
}

/** Dernières écritures faites par Claude : les siennes, ou celles de tous pour un administrateur. */
export async function listClaudeActivity(actor: Actor, take = 30): Promise<ClaudeActivity[]> {
  const all = actor.role === "ADMIN";
  const events = await prisma.auditEvent.findMany({
    where: { action: { startsWith: "mcp.tool." }, ...(all ? {} : { actorId: actor.id }) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, actorId: true, createdAt: true, after: true },
  });
  const ids = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const users = all && ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return events.map((e) => {
    const after = (e.after ?? {}) as { done?: string; records?: JournalRecord[] };
    const name = e.action.slice("mcp.tool.".length);
    return {
      id: e.id,
      at: e.createdAt,
      user: all && e.actorId ? (names.get(e.actorId) ?? null) : null,
      tool: TOOL_LABELS[name] ?? name,
      partial: after.done === "partial",
      records: (after.records ?? []).slice(0, 8).map((r) => ({ label: r.label ?? "—", href: hrefOf(r.url) })),
    };
  });
}
