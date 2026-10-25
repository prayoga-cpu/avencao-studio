import { prisma } from "@/server/db";
import type { Actor } from "@/server/policies";
import { parseDateOnly } from "@/lib/dates";

/** Vide toutes les tables métier (base de test uniquement). */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("resetDb refusé hors base de test");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.agencySettings.create({ data: { id: 1, timezone: "Asia/Makassar", marginThresholdPct: "40" } });
}

let n = 0;
export async function makeActor(role: Actor["role"], opts: { financeAccess?: boolean; editorId?: string } = {}): Promise<Actor> {
  n += 1;
  const user = await prisma.user.create({
    data: { email: `u${n}-${role.toLowerCase()}@test.local`, name: `${role} ${n}`, role, financeAccess: opts.financeAccess ?? role === "ADMIN" },
  });
  if (opts.editorId) await prisma.editorProfile.update({ where: { id: opts.editorId }, data: { userId: user.id } });
  return { id: user.id, name: user.name, email: user.email, image: null, role, financeAccess: user.financeAccess, editorId: opts.editorId ?? null };
}

export async function makeClient(name = "Client Test") {
  return prisma.client.create({ data: { displayName: name, status: "ACTIVE", currency: "EUR" } });
}

export async function makeProject(clientId: string, title = "Projet test") {
  n += 1;
  return prisma.project.create({ data: { reference: `PRJ-T-${n}`, title, clientId, status: "ACTIVE" } });
}

export async function makeVideos(projectId: string, count: number, extra: Record<string, unknown> = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    n += 1;
    out.push(await prisma.video.create({ data: { reference: `AV-T-${n}`, projectId, title: `Vidéo ${i + 1}`, type: "REEL", position: i, ...extra } }));
  }
  return out;
}

export async function makeEditor(name = "Monteur test", payCurrency: "EUR" | "IDR" | "USD" = "EUR") {
  return prisma.editorProfile.create({ data: { displayName: name, payCurrency, status: "ACTIVE", skills: ["PREMIERE_PRO"], formats: ["REEL"] } });
}

export async function setRate(date: string, currency: "IDR" | "USD", unitsPerEur: string) {
  return prisma.exchangeRate.create({ data: { date: parseDateOnly(date), currency, unitsPerEur } });
}

export { prisma };
