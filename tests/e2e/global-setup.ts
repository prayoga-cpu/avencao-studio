import { request, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";

export const ROLES = {
  admin: process.env.SEED_ADMIN_EMAIL || "admin@avencao.test",
  production: "production@avencao.test",
  editor: "monteur@avencao.test",
} as const;
export type E2ERole = keyof typeof ROLES;
export const statePath = (role: E2ERole) => `test-results/.auth/${role}.json`;

/** Une connexion par rôle via l'API Better Auth, cookies enregistrés pour tous les tests. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const password = process.env.E2E_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_PASSWORD ou SEED_ADMIN_PASSWORD requis (comptes de démo du seed)");
  await mkdir("test-results/.auth", { recursive: true });
  for (const role of Object.keys(ROLES) as E2ERole[]) {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/sign-in/email", { data: { email: ROLES[role], password }, headers: { origin: baseURL } });
    if (!res.ok()) throw new Error(`Connexion ${role} impossible (${res.status()}) — base initialisée avec pnpm db:seed ?`);
    await ctx.storageState({ path: statePath(role) });
    await ctx.dispose();
  }
}
