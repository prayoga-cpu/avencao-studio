import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL manquant"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET doit contenir au moins 32 caractères"),
  BETTER_AUTH_URL: z.url().optional(),
  APP_URL: z.url().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Variables serveur validées. Les secrets ne sont jamais journalisés. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuration invalide (${fields}). Voir .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export interface MailTransportConfig {
  provider: "resend" | "smtp";
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
  replyTo?: string;
}

/**
 * Configuration d'envoi : Resend (via sa passerelle SMTP, sans dépendance supplémentaire)
 * si RESEND_API_KEY est présent, sinon SMTP générique. null = aucun canal connecté.
 */
export function mailTransport(): MailTransportConfig | null {
  const e = env();
  const from = e.EMAIL_FROM || e.SMTP_FROM;
  if (!from) return null;
  if (e.RESEND_API_KEY) {
    return { provider: "resend", host: "smtp.resend.com", port: 465, user: "resend", password: e.RESEND_API_KEY, from, replyTo: e.EMAIL_REPLY_TO || undefined };
  }
  if (e.SMTP_HOST) {
    return { provider: "smtp", host: e.SMTP_HOST, port: e.SMTP_PORT ?? 587, user: e.SMTP_USER, password: e.SMTP_PASSWORD, from, replyTo: e.EMAIL_REPLY_TO || undefined };
  }
  return null;
}

export function smtpConfigured(): boolean {
  return mailTransport() !== null;
}
