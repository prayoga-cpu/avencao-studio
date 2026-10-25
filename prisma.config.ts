import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Migrations : DIRECT_URL si défini (connexion directe ou pooler en mode session, requis par
 * Supabase pour les verrous de migration), sinon DATABASE_URL. L'application, elle, utilise
 * toujours DATABASE_URL (voir src/server/db.ts). `prisma generate` n'ouvre aucune connexion.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  ...(url ? { datasource: { url } } : {}),
});
