import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl, pgConnectionConfig } from "./pg-config";

/**
 * Client Prisma unique par processus (réutilisé en développement entre rechargements).
 * Accès base exclusivement côté serveur.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // TLS et taille du pool : voir pg-config.ts (poolers managés type Supabase).
  const adapter = new PrismaPg(pgConnectionConfig(databaseUrl()));
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
