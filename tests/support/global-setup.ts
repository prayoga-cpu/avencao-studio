import { execFileSync } from "node:child_process";
import { config } from "dotenv";

/** Applique les migrations sur la base de test (jamais sur la base de développement). */
export default function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL absent : tests d'intégration ignorés.");
    return;
  }
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL doit différer de DATABASE_URL");
  execFileSync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
