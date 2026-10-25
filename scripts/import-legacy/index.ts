/**
 * Import de l'ancien CRM Rails.
 *
 *   pnpm import:legacy --source production --mysql "mysql://lecture@hote/avencao"   (simulation)
 *   pnpm import:legacy --source production --json ./export-rails --storage-dir ./rails-storage
 *   pnpm import:legacy --source production --mysql … --apply --backup-confirmed       (écriture)
 *   pnpm import:legacy --rollback <importRunId>
 *
 * Options :
 *   --source <nom>          libellé de l'instance (production, axel, bobby, joseph…) — obligatoire
 *   --mysql <url>           connexion MySQL en lecture (sinon LEGACY_MYSQL_URL)
 *   --json <dossier>        dossier de fichiers <table>.json (alternative à MySQL)
 *   --storage-dir <dossier> dossier « storage » Active Storage (sinon LEGACY_STORAGE_DIR)
 *   --decisions <fichier>   JSON { "<id suivi_client>": "project" | "video" }
 *   --report <fichier>      écrit le rapport complet en JSON
 *   --apply                 enregistre réellement (sinon simulation, tout est annulé)
 *   --backup-confirmed      obligatoire avec --apply : confirme qu'une sauvegarde PostgreSQL existe
 *
 * Ne modifie jamais la base Rails. N'envoie aucun email. N'importe aucun mot de passe.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { runLegacyImport } from "@/server/legacy-import/importer";
import { rollbackImportRun } from "@/server/legacy-import/rollback";
import { jsonDirSource, mysqlSource, type LegacySource } from "@/server/legacy-import/sources";
import { prisma } from "@/server/db";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    mysql: { type: "string" },
    json: { type: "string" },
    "storage-dir": { type: "string" },
    decisions: { type: "string" },
    report: { type: "string" },
    apply: { type: "boolean", default: false },
    "backup-confirmed": { type: "boolean", default: false },
    rollback: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  if (values.rollback) {
    const result = await rollbackImportRun(values.rollback);
    console.log(`✓ Import annulé : ${result.clients} client(s), ${result.users} compte(s), ${result.mappings} correspondance(s) supprimés.`);
    return;
  }
  const sourceLabel = values.source?.trim();
  if (!sourceLabel) fail("--source est obligatoire (ex. production, axel, bobby, joseph)");
  if (values.apply && !values["backup-confirmed"]) {
    fail("--apply exige --backup-confirmed : faites d'abord une sauvegarde (scripts/backup.sh) et vérifiez-la.");
  }
  if (values.apply && process.env.NODE_ENV === "production" && process.env.ALLOW_LEGACY_IMPORT !== "1") {
    fail("Import en production : définissez ALLOW_LEGACY_IMPORT=1 après validation de la simulation.");
  }

  let source: LegacySource;
  const mysqlUrl = values.mysql ?? process.env.LEGACY_MYSQL_URL;
  if (values.json) source = jsonDirSource(values.json);
  else if (mysqlUrl) source = await mysqlSource(mysqlUrl);
  else fail("Indiquez --mysql <url> (ou LEGACY_MYSQL_URL) ou --json <dossier>");

  const suiviDecisions = values.decisions ? (JSON.parse(await readFile(values.decisions, "utf8")) as Record<string, "project" | "video">) : undefined;
  const storageDir = values["storage-dir"] ?? (process.env.LEGACY_STORAGE_DIR || null);

  console.log(`→ ${values.apply ? "IMPORT RÉEL" : "Simulation (rien ne sera enregistré)"} — source « ${sourceLabel} »`);
  try {
    const summary = await runLegacyImport(source, { sourceLabel, apply: values.apply, storageDir, suiviDecisions });
    console.log(`\nExécution ${summary.runId} (${summary.mode})`);
    console.table(
      Object.keys(summary.read).map((t) => ({ table: t, lues: summary.read[t], créées: summary.created[t] ?? 0, "déjà importées": summary.skippedExisting[t] ?? 0 })),
    );
    const extra = Object.entries(summary.created).filter(([k]) => !(k in summary.read));
    if (extra.length) console.table(Object.fromEntries(extra));
    console.log("Rapprochement :");
    console.table(summary.reconciliation);
    const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
    for (const i of summary.issues) counts[i.level]++;
    console.log(`Anomalies : ${counts.ERROR} erreur(s), ${counts.WARNING} avertissement(s), ${counts.INFO} info(s) — détail dans Réglages › Import ou --report.`);
    for (const i of summary.issues.filter((x) => x.level === "ERROR").slice(0, 20)) console.log(`  ✗ [${i.table}${i.legacyId ? ` #${i.legacyId}` : ""}] ${i.message}`);
    if (values.report) {
      await writeFile(values.report, JSON.stringify(summary, null, 2));
      console.log(`Rapport écrit : ${values.report}`);
    }
    if (!values.apply) console.log("\nSimulation terminée. Relancez avec --apply --backup-confirmed pour enregistrer.");
    if (summary.issues.some((i) => i.table === "import" && i.level === "ERROR")) process.exitCode = 1;
  } finally {
    await source.close();
  }
}

main()
  .catch((e) => {
    console.error(`✗ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
