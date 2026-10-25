import { NextResponse } from "next/server";
import { connection } from "next/server";
import { prisma } from "@/server/db";

/**
 * Santé du déploiement (public, sans donnée métier ni secret) : base joignable et
 * migrations appliquées, version déployée. Utilisé par le healthcheck et `pnpm smoke`.
 */
export async function GET() {
  await connection();
  const started = Date.now();
  let database: "ok" | "unreachable" = "ok";
  let migrations: number | null = null;
  try {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    migrations = Number(rows[0]?.n ?? 0);
  } catch {
    database = "unreachable";
  }
  const ok = database === "ok" && (migrations ?? 0) > 0;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      database,
      migrationsApplied: migrations,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? null,
      latencyMs: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
