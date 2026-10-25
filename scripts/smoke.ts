/**
 * Vérification rapide d'un déploiement, sans compte ni donnée créée.
 *   pnpm smoke https://avencao.vercel.app
 *   SMOKE_CRON_SECRET=… pnpm smoke https://…     (vérifie aussi un job planifié)
 *
 * Contrôles : santé (base + migrations), HTTPS, en-têtes de sécurité, redirection vers la
 * connexion, API fermées sans session (401), inscription publique fermée, cron protégé.
 * Code de sortie ≠ 0 si un contrôle échoue.
 */
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage : pnpm smoke <url>   (ex. https://avencao.vercel.app)");
  process.exit(1);
}

type Result = { check: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (check: string, ok: boolean, detail: string) => results.push({ check, ok, detail });

async function get(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init, signal: AbortSignal.timeout(20_000) });
}

async function main() {
  const health = await get("/api/health").catch((e: Error) => e);
  if (health instanceof Error) {
    record("Santé", false, `injoignable : ${health.message}`);
  } else {
    const body = (await health.json().catch(() => ({}))) as { status?: string; database?: string; migrationsApplied?: number; version?: string | null };
    record("Santé", health.status === 200 && body.status === "ok", `HTTP ${health.status} · base ${body.database ?? "?"} · ${body.migrationsApplied ?? "?"} migration(s) · version ${body.version ?? "?"}`);
  }

  record("HTTPS", base.startsWith("https://") || base.includes("localhost"), base.startsWith("https://") ? "oui" : "non (acceptable en local uniquement)");

  const login = await get("/connexion");
  record("Page de connexion", login.status === 200, `HTTP ${login.status}`);
  const headers = login.headers;
  const missing = [
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
  ].filter(([h, v]) => headers.get(h)?.toLowerCase() !== v.toLowerCase());
  record("En-têtes de sécurité", missing.length === 0, missing.length ? `manquants : ${missing.map(([h]) => h).join(", ")}` : "présents");
  record("En-tête X-Powered-By masqué", !headers.get("x-powered-by"), headers.get("x-powered-by") ?? "absent");

  const dash = await get("/dashboard");
  const loc = dash.headers.get("location") ?? "";
  record("Page privée sans session", [307, 308, 302, 303].includes(dash.status) && loc.includes("/connexion"), `HTTP ${dash.status} → ${loc || "—"}`);

  for (const path of ["/api/exports/resultat", "/api/files/inexistant"]) {
    const r = await get(path);
    record(`API fermée ${path}`, r.status === 401, `HTTP ${r.status}`);
  }

  const signUp = await get("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: `smoke-${Date.now()}@example.com`, password: "Smoke-test-password-123", name: "Smoke" }),
  });
  record("Inscription publique fermée", signUp.status >= 400 && signUp.status < 500, `HTTP ${signUp.status}`);

  const cronNoSecret = await get("/api/cron/reminders.scan");
  record("Cron protégé (sans secret)", cronNoSecret.status === 401, `HTTP ${cronNoSecret.status}`);

  const secret = process.env.SMOKE_CRON_SECRET;
  if (secret) {
    const cron = await get("/api/cron/reminders.scan", { headers: { authorization: `Bearer ${secret}` } });
    const body = (await cron.json().catch(() => ({}))) as { ran?: boolean; queued?: boolean };
    record("Cron avec secret", cron.status === 200 && Boolean(body.ran || body.queued), `HTTP ${cron.status} · ${body.ran ? "exécuté" : body.queued ? "mis en file" : "—"}`);
  }

  console.table(results.map((r) => ({ contrôle: r.check, résultat: r.ok ? "OK" : "ÉCHEC", détail: r.detail })));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `✗ ${failed} contrôle(s) en échec sur ${base}` : `✓ ${results.length} contrôles OK sur ${base}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
});
