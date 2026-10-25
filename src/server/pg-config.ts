/**
 * Configuration de connexion PostgreSQL commune (Prisma, worker, cron, scripts).
 *
 * Pourquoi : la version installée de `pg` traite `sslmode=require` comme `verify-full`
 * (vérification complète du certificat). Les poolers managés (Supabase…) présentent une
 * chaîne signée par leur propre autorité, absente du magasin de Node : la connexion échoue
 * avec « self-signed certificate in certificate chain ». On applique donc la sémantique libpq :
 *
 * | URL / variable                      | Comportement                                        |
 * |-------------------------------------|-----------------------------------------------------|
 * | pas de sslmode, ou `disable`        | sans TLS (base locale)                              |
 * | `DATABASE_CA_CERT` défini (PEM)     | TLS + vérification du certificat avec cette autorité |
 * | `verify-full` / `verify-ca`         | TLS + vérification avec les autorités système       |
 * | `require` / `prefer` / `no-verify`  | TLS chiffré, certificat non vérifié (libpq)         |
 *
 * Aucun `server-only` ici : utilisé aussi par les scripts (check:env) hors React Server.
 */
import type { ConnectionOptions } from "node:tls";

type Env = Record<string, string | undefined>;

export interface PgConnectionConfig {
  connectionString: string;
  ssl?: boolean | ConnectionOptions;
  max?: number;
}

const SSL_PARAMS = ["sslmode", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey"];

export function pgConnectionConfig(url: string, env: Env = process.env): PgConnectionConfig {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get("sslmode");
  for (const p of SSL_PARAMS) parsed.searchParams.delete(p);
  const connectionString = parsed.toString();
  const max = env.DATABASE_POOL_MAX ? Number.parseInt(env.DATABASE_POOL_MAX, 10) : undefined;
  const base: PgConnectionConfig = { connectionString, ...(max && max > 0 ? { max } : {}) };

  if (!mode || mode === "disable") return { ...base, ssl: false };
  const ca = env.DATABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
  if (ca) return { ...base, ssl: { ca, rejectUnauthorized: true } };
  if (mode === "verify-full" || mode === "verify-ca") return { ...base, ssl: { rejectUnauthorized: true } };
  return { ...base, ssl: { rejectUnauthorized: false } };
}

/** URL de la base applicative (requêtes). */
export function databaseUrl(env: Env = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  return url;
}
