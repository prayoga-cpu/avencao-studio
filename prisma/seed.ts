/**
 * Seed : données de référence + compte administrateur + (hors production) données de
 * démonstration fictives clairement identifiées. Idempotent : relançable sans doublon.
 *   pnpm db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseUrl, pgConnectionConfig } from "../src/server/pg-config";
import { seedBase } from "./seed-base";
import { seedDemo } from "./seed-demo";

const prisma = new PrismaClient({ adapter: new PrismaPg(pgConnectionConfig(databaseUrl())) });

async function ensureUser(email: string, name: string, role: "ADMIN" | "PRODUCTION_MANAGER" | "EDITOR", password: string, financeAccess = false) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, status: "ACTIVE", emailVerified: true, financeAccess: role === "ADMIN" ? true : financeAccess },
  });
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (!account) {
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: await hashPassword(password) },
    });
  }
  return user;
}

async function main() {
  const isProd = process.env.NODE_ENV === "production";
  await seedBase(prisma);

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 10) throw new Error("SEED_ADMIN_PASSWORD : 10 caractères minimum");
    if (isProd && (adminPassword.length < 14 || /demo|démo|password|avencao/i.test(adminPassword))) {
      // Le dépôt est public : jamais de mot de passe de démonstration ou devinable en production.
      throw new Error("SEED_ADMIN_PASSWORD en production : 14 caractères minimum, sans « demo », « password » ni « avencao ».");
    }
    await ensureUser(adminEmail, process.env.SEED_ADMIN_NAME || (isProd ? "Administrateur" : "Evan (démo)"), "ADMIN", adminPassword);
    console.log(`Administrateur prêt : ${adminEmail}`);
  } else {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD absents : aucun administrateur créé.");
  }

  const allowDemo = !isProd || process.env.ALLOW_DEMO_SEED === "1";
  if (allowDemo && process.env.SEED_DEMO !== "0" && !adminPassword) {
    console.log("Données de démonstration ignorées : SEED_ADMIN_PASSWORD est requis (mot de passe des comptes de démo).");
  } else if (allowDemo && process.env.SEED_DEMO !== "0" && adminPassword) {
    const password = adminPassword;
    const manager = await ensureUser("production@avencao.test", "Léa Production (démo)", "PRODUCTION_MANAGER", password);
    const editorUser = await ensureUser("monteur@avencao.test", "Kai Monteur (démo)", "EDITOR", password);
    await seedDemo(prisma, { managerId: manager.id, editorUserId: editorUser.id });
    console.log("Données de démonstration fictives prêtes.");
  } else {
    console.log(isProd ? "Données de démonstration ignorées (production)." : "Données de démonstration désactivées (SEED_DEMO=0).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
