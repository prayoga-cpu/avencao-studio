import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours critiques sur une base initialisée par `pnpm db:seed` (données de démo).
 * Local : `pnpm test:e2e`. Déploiement : `E2E_BASE_URL=https://… E2E_PASSWORD=… pnpm test:e2e`.
 * Les tests ne créent que des données préfixées « E2E » et ne suppriment rien.
 * Connexion limitée à 5 tentatives/minute : une seule connexion par rôle (global-setup).
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", locale: "fr-FR", timezoneId: "Asia/Makassar" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false }, grep: /@mobile/ },
  ],
  // Cible distante (déploiement) : aucun serveur local n'est lancé.
  webServer: isLocal
    ? { command: process.env.E2E_SERVER_COMMAND || "pnpm dev", url: `${baseURL}/connexion`, reuseExistingServer: true, timeout: 180_000 }
    : undefined,
});
