import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { PgBoss } from "pg-boss";
import { isJobName, runJob, type JobName } from "@/server/jobs/registry";
import { databaseUrl, pgConnectionConfig } from "@/server/pg-config";

/**
 * Déclencheur cron authentifié (en-tête `Authorization: Bearer <CRON_SECRET>`).
 *
 * - Mode file (défaut hors Vercel) : dépose un job dans pg-boss, exécuté par le worker
 *   (`pnpm worker`) avec reprises.
 * - Mode direct (`JOBS_INLINE=true`, défaut sur Vercel où aucun worker ne tourne) : exécute
 *   le job dans la requête. Sans risque de doublon : chaque job est idempotent et tracé
 *   dans JobLog.
 *
 * GET est accepté pour Vercel Cron (qui envoie le secret automatiquement), POST pour les
 * planificateurs externes.
 */
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function inlineMode(): boolean {
  if (process.env.JOBS_INLINE) return process.env.JOBS_INLINE === "true";
  return Boolean(process.env.VERCEL);
}

async function enqueue(job: JobName) {
  const boss = new PgBoss({ ...pgConnectionConfig(databaseUrl()), schema: "pgboss", supervise: false, schedule: false, migrate: false });
  try {
    await boss.start();
    const minute = new Date().toISOString().slice(0, 16);
    const id = await boss.send(job, { key: `cron:${minute}` }, { singletonKey: `${job}:${minute}` });
    return NextResponse.json({ queued: Boolean(id), job, id });
  } catch (e) {
    console.error("[cron] envoi impossible", (e as Error).message);
    return NextResponse.json({ error: "File indisponible (worker démarré au moins une fois ?)." }, { status: 503 });
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
  }
}

async function handle(request: NextRequest, ctx: RouteContext<"/api/cron/[job]">) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: "Job inconnu." }, { status: 404 });
  if (!inlineMode()) return enqueue(job);
  try {
    const details = await runJob(job, `cron:${new Date().toISOString().slice(0, 16)}`);
    return NextResponse.json({ ran: true, job, details });
  } catch (e) {
    console.error(`[cron] ${job} en échec`, (e as Error).message);
    return NextResponse.json({ error: "Échec du job (voir JobLog)." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
