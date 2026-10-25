/**
 * Vérification de la configuration (.env) sans afficher aucune valeur secrète.
 *   pnpm check:env            → tous les contrôles (dont écriture/suppression d'un fichier test S3)
 *   pnpm check:env --no-write → contrôles en lecture seule
 * Aucun email n'est envoyé : seule l'authentification SMTP est testée.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import nodemailer from "nodemailer";
import pg from "pg";
import { pgConnectionConfig } from "../src/server/pg-config";

type Status = "OK" | "AVERTISSEMENT" | "ÉCHEC" | "IGNORÉ";
const results: { area: string; check: string; status: Status; detail: string }[] = [];
const noWrite = process.argv.includes("--no-write");

function record(area: string, check: string, status: Status, detail = "") {
  results.push({ area, check, status, detail });
}

function redactHost(url: string | undefined): string {
  if (!url) return "(vide)";
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    return parts.length > 2 ? `<…>.${parts.slice(-2).join(".")}` : u.hostname;
  } catch {
    return "(URL invalide)";
  }
}

function errText(e: unknown): string {
  const err = e as { name?: string; message?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const code = err.$metadata?.httpStatusCode ? `HTTP ${err.$metadata.httpStatusCode}` : "";
  // Les messages des SDK ne contiennent pas les secrets ; on les tronque par prudence.
  return [err.name, err.Code, code, (err.message ?? "").replace(/[A-Za-z0-9_\-]{30,}/g, "<…>").slice(0, 160)]
    .filter(Boolean)
    .join(" — ");
}

async function checkDatabase(label: string, url: string | undefined) {
  if (!url) return record("Base de données", label, "ÉCHEC", "variable absente");
  const client = new pg.Client({ ...pgConnectionConfig(url), connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const v = await client.query<{ server_version: string }>("SHOW server_version");
    let migrations = "table de migrations absente";
    try {
      const m = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      migrations = `${m.rows[0].n} migration(s) appliquée(s)`;
    } catch {
      /* base vierge */
    }
    record("Base de données", label, "OK", `PostgreSQL ${v.rows[0].server_version} sur ${redactHost(url.replace(/^postgres(ql)?:/, "http:"))} — ${migrations}`);
  } catch (e) {
    record("Base de données", label, "ÉCHEC", errText(e));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkAuth() {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  record("Authentification", "BETTER_AUTH_SECRET", secret.length >= 32 ? "OK" : "ÉCHEC", `${secret.length} caractères (32 minimum)`);
  for (const key of ["BETTER_AUTH_URL", "APP_URL"]) {
    const v = process.env[key];
    let ok = false;
    try {
      ok = !!v && ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      ok = false;
    }
    record("Authentification", key, ok ? "OK" : "ÉCHEC", ok ? new URL(v!).origin : "URL invalide ou absente");
  }
  if (process.env.APP_URL && process.env.BETTER_AUTH_URL && process.env.APP_URL !== process.env.BETTER_AUTH_URL) {
    record("Authentification", "Cohérence des URL", "AVERTISSEMENT", "APP_URL et BETTER_AUTH_URL diffèrent");
  }
}

async function checkStorage() {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "s3") {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      record("Stockage", "Pilote", "AVERTISSEMENT", "local en production : les fichiers seraient perdus sur un hébergement sans disque persistant (Vercel). Utilisez S3/R2.");
    } else {
      record("Stockage", "Pilote", "OK", `local (${process.env.STORAGE_LOCAL_DIR ?? ".storage"})`);
    }
    return;
  }
  const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !process.env[k]);
  if (missing.length) return record("Stockage", "Variables S3", "ÉCHEC", `manquantes : ${missing.join(", ")}`);
  record("Stockage", "Pilote", "OK", `S3 compatible — endpoint ${redactHost(process.env.S3_ENDPOINT)}, région ${process.env.S3_REGION}, path-style ${process.env.S3_FORCE_PATH_STYLE === "true" ? "oui" : "non"}`);
  const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const Bucket = process.env.S3_BUCKET!;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
    record("Stockage", "Accès au bucket", "OK", "bucket trouvé, identifiants acceptés");
  } catch (e) {
    record("Stockage", "Accès au bucket", "ÉCHEC", errText(e));
    return;
  }
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket, MaxKeys: 5 }));
    record("Stockage", "Lecture (liste)", "OK", `${list.KeyCount ?? 0} objet(s) visible(s) sur les 5 premiers`);
  } catch (e) {
    record("Stockage", "Lecture (liste)", "AVERTISSEMENT", `liste refusée (${errText(e)}) — non bloquant si les droits sont limités aux objets`);
  }
  if (noWrite) {
    record("Stockage", "Écriture", "IGNORÉ", "--no-write");
    return;
  }
  const Key = `_avencao-healthcheck/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.txt`;
  const body = `avencao healthcheck ${new Date().toISOString()}`;
  try {
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: "text/plain" }));
    const got = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const text = await got.Body?.transformToString();
    record("Stockage", "Écriture + relecture", text === body ? "OK" : "ÉCHEC", text === body ? "fichier test écrit puis relu à l'identique" : "contenu relu différent");
  } catch (e) {
    record("Stockage", "Écriture + relecture", "ÉCHEC", errText(e));
  } finally {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket, Key }));
      record("Stockage", "Suppression du fichier test", "OK", "rien n'est laissé dans le bucket");
    } catch (e) {
      record("Stockage", "Suppression du fichier test", "AVERTISSEMENT", `à supprimer à la main : ${Key} (${errText(e)})`);
    }
  }
}

async function checkEmail() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM;
  if (!key && !process.env.SMTP_HOST) {
    record("Email", "Canal", "AVERTISSEMENT", "aucun canal : les liens d'invitation seront affichés à l'admin");
    return;
  }
  if (!from) record("Email", "EMAIL_FROM", "ÉCHEC", "expéditeur absent");
  const fromDomain = from?.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
      if (res.status === 200) {
        const json = (await res.json()) as { data?: { name: string; status: string }[] };
        const domain = json.data?.find((d) => d.name.toLowerCase() === fromDomain);
        record("Email", "Clé API Resend", "OK", `${json.data?.length ?? 0} domaine(s) sur le compte`);
        record(
          "Email",
          `Domaine expéditeur (${fromDomain ?? "?"})`,
          domain?.status === "verified" ? "OK" : "ÉCHEC",
          domain ? `statut Resend : ${domain.status}` : "domaine absent du compte Resend : les envois seront refusés",
        );
      } else if (res.status === 401 && /restricted/i.test(await res.text())) {
        record("Email", "Clé API Resend", "OK", "clé à accès « envoi uniquement » : domaine non vérifiable par l'API (voir test SMTP)");
      } else {
        record("Email", "Clé API Resend", "ÉCHEC", `HTTP ${res.status}`);
      }
    } catch (e) {
      record("Email", "Clé API Resend", "ÉCHEC", errText(e));
    }
  }
  const transport = key
    ? nodemailer.createTransport({ host: "smtp.resend.com", port: 465, secure: true, auth: { user: "resend", pass: key } })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
  try {
    await transport.verify();
    record("Email", "Authentification SMTP", "OK", key ? "smtp.resend.com accepte la clé (aucun email envoyé)" : "serveur SMTP joignable (aucun email envoyé)");
  } catch (e) {
    record("Email", "Authentification SMTP", "ÉCHEC", errText(e));
  }
}

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;
  for (const [label, key] of [
    ["clé publishable", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ["clé secrète", process.env.SUPABASE_SECRET_KEY],
  ] as const) {
    if (!key) continue;
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key } });
      record("Supabase (non utilisé)", label, res.ok ? "OK" : "ÉCHEC", `projet ${redactHost(url)} — HTTP ${res.status}`);
    } catch (e) {
      record("Supabase (non utilisé)", label, "ÉCHEC", errText(e));
    }
  }
}

async function main() {
  await checkAuth();
  await checkDatabase("DATABASE_URL", process.env.DATABASE_URL);
  if (process.env.DIRECT_URL) await checkDatabase("DIRECT_URL (migrations)", process.env.DIRECT_URL);
  await checkDatabase("TEST_DATABASE_URL", process.env.TEST_DATABASE_URL);
  await checkStorage();
  await checkEmail();
  await checkSupabase();
  const width = Math.max(...results.map((r) => `${r.area} › ${r.check}`.length));
  for (const r of results) {
    console.log(`${r.status.padEnd(13)} ${`${r.area} › ${r.check}`.padEnd(width)}  ${r.detail}`);
  }
  if (results.some((r) => r.status === "ÉCHEC")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(errText(e));
  process.exitCode = 1;
});
