import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl, pgConnectionConfig } from "./pg-config";

/**
 * Client Prisma unique par processus (réutilisé en développement entre rechargements).
 * Accès base exclusivement côté serveur.
 *
 * Création paresseuse : le client (et la lecture de DATABASE_URL) n'intervient qu'à la
 * première requête, jamais au chargement du module. Le build (`next build`, qui charge les
 * routes pour collecter leur configuration) fonctionne donc sans variables de base.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // TLS et taille du pool : voir pg-config.ts (poolers managés type Supabase).
  const adapter = new PrismaPg(pgConnectionConfig(databaseUrl()));
  return new PrismaClient({ adapter });
}

function client(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Sans DATABASE_URL (build, ou configuration manquante) : objet inerte. Les bibliothèques qui
 * inspectent le client au chargement (adaptateur Better Auth) ne déclenchent rien ; toute
 * requête réelle échoue avec un message explicite.
 */
const missingDatabase: unknown = new Proxy(function missingDatabase() {}, {
  get: (_target, property) => (property === "then" || typeof property === "symbol" ? undefined : missingDatabase),
  apply: () => {
    throw new Error("DATABASE_URL manquant : configurez la base de données de cet environnement.");
  },
});

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    if (!globalForPrisma.prisma && !process.env.DATABASE_URL) return missingDatabase;
    const target = client();
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
