/**
 * URL publique de l'application (liens d'invitation, emails, origine de confiance).
 * Ordre : APP_URL, BETTER_AUTH_URL, domaine de production Vercel, puis localhost.
 * Sans `server-only` : partagé par la configuration d'authentification et les scripts.
 */
type Env = Record<string, string | undefined>;

export function publicAppUrl(env: Env = process.env): string {
  const explicit = env.APP_URL || env.BETTER_AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Origines autorisées à appeler l'authentification : URL publique + URLs de déploiement
 * Vercel (production, branche, déploiement courant) pour pouvoir tester les aperçus.
 */
export function trustedOrigins(env: Env = process.env): string[] {
  const hosts = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL].filter(Boolean) as string[];
  const extra = (env.EXTRA_TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return [...new Set([publicAppUrl(env), ...hosts.map((h) => `https://${h}`), ...extra])];
}
