/**
 * Worker des jobs durables (pg-boss, file stockée dans PostgreSQL).
 *   pnpm worker
 * - planifie les jobs récurrents (cron, fuseau de l'agence) ;
 * - exécute les jobs envoyés par /api/cron/<job> ou par la planification ;
 * - tentatives avec délai exponentiel ; un job « singleton » à la fois par nom.
 * Supervision : table JobLog (CRM) + tables pg-boss (schéma « pgboss »). Voir docs/jobs.md.
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { JOBS, runJob, type JobName } from "../src/server/jobs/registry";
import { getSettingsUncached } from "../src/server/jobs/settings";
import { databaseUrl, pgConnectionConfig } from "../src/server/pg-config";

async function main() {
  const boss = new PgBoss({ ...pgConnectionConfig(databaseUrl()), schema: "pgboss" });
  boss.on("error", (e) => console.error("[worker] erreur pg-boss", e.message));
  await boss.start();
  const settings = await getSettingsUncached();
  for (const [name, def] of Object.entries(JOBS) as [JobName, (typeof JOBS)[JobName]][]) {
    await boss.createQueue(name, { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true });
    await boss.schedule(name, def.cron, null, { tz: settings.timezone, singletonKey: name });
    await boss.work<{ key?: string }>(name, async (jobs) => {
      for (const job of jobs) {
        const details = await runJob(name, job.data?.key);
        console.log(`[worker] ${name} terminé`, JSON.stringify(details));
      }
    });
    console.log(`[worker] ${name} planifié (${def.cron}, ${settings.timezone}) — ${def.description}`);
  }
  const shutdown = async () => {
    console.log("[worker] arrêt…");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[worker] démarrage impossible", e);
  process.exit(1);
});
