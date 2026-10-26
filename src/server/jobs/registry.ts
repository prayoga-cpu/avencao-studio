import "server-only";
import { todayInTimezone } from "@/lib/dates";
import { prisma } from "../db";
import { purgeMcpData } from "../mcp/oauth";
import { generateDueRetainerPeriods } from "../services/retainers";
import { runReminderScan } from "./reminders";
import { getSettingsUncached } from "./settings";

/**
 * Jobs durables (file pg-boss dans PostgreSQL, worker séparé). Chaque job est idempotent :
 * - rappels : notifications dédupliquées par clé d'événement ;
 * - récurrence : contrainte unique (contrat, période).
 * Chaque exécution est tracée dans JobLog (relançable sans effet de bord).
 */
export const JOBS = {
  "reminders.scan": { cron: "0 * * * *", description: "Échéances proches, retards, validations en attente, coûts manquants ; nettoyage des jetons Claude expirés" },
  "retainers.generate": { cron: "15 2 * * *", description: "Génération des périodes de forfaits récurrents du mois" },
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(name: string): name is JobName {
  return name in JOBS;
}

export async function runJob(name: JobName, key?: string) {
  const log = await prisma.jobLog.create({ data: { name, key: key ?? null, status: "RUNNING" } });
  try {
    let details: unknown;
    if (name === "reminders.scan") {
      // Nettoyage des codes et jetons MCP expirés (idempotent) avec le passage des rappels.
      details = { ...(await runReminderScan()), mcpCleanup: await purgeMcpData() };
    }
    else {
      const settings = await getSettingsUncached();
      details = await generateDueRetainerPeriods(todayInTimezone(settings.timezone));
    }
    await prisma.jobLog.update({ where: { id: log.id }, data: { status: "SUCCEEDED", details: details as object, finishedAt: new Date() } });
    return details;
  } catch (e) {
    await prisma.jobLog.update({ where: { id: log.id }, data: { status: "FAILED", details: { error: (e as Error).message }, finishedAt: new Date() } });
    throw e;
  }
}
