import { expect, test } from "@playwright/test";
import { statePath } from "./global-setup";

test.describe("sans session", () => {
  test("les pages redirigent vers la connexion", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
  });

  test("un mauvais mot de passe affiche une erreur générique", async ({ page }) => {
    await page.goto("/connexion");
    await page.fill("input[name=email]", "inconnu@avencao.test");
    await page.fill("input[name=password]", "mauvais-mot-de-passe");
    await page.click("button[type=submit]");
    await expect(page.getByText(/Identifiants incorrects|Trop de tentatives/)).toBeVisible();
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("les API de fichiers et d'export refusent sans session", async ({ request }) => {
    expect((await request.get("/api/exports/resultat")).status()).toBe(401);
    expect((await request.get("/api/files/inexistant")).status()).toBe(401);
    expect((await request.post("/api/cron/reminders.scan")).status()).toBe(401);
  });

  test("l'inscription publique est fermée", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", { data: { email: "pirate@example.com", password: "Motdepasse-123", name: "X" } });
    expect(res.ok()).toBe(false);
  });
});

test.describe("monteur", () => {
  test.use({ storageState: statePath("editor") });

  test("arrive sur ses missions et ne voit ni prix de vente ni marge", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/missions/);
    await expect(page.getByRole("heading", { name: "Mes missions" })).toBeVisible();
    const mission = page.locator('a[href^="/missions/"]').first();
    await expect(mission).toBeVisible();
    await mission.click();
    await expect(page.getByText("Ma mission")).toBeVisible();
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const forbidden of ["marge", "prix de vente", "chiffre d'affaires", "ca facturé", "rentabilité"]) {
      expect(text, `« ${forbidden} » ne doit pas apparaître`).not.toContain(forbidden);
    }
  });

  test("les écrans internes sont refusés même par URL directe", async ({ page }) => {
    for (const url of ["/finances", "/clients", "/videos", "/rapports", "/reglages", "/monteurs", "/finances/factures/nouvelle"]) {
      await page.goto(url);
      await expect(page, url).toHaveURL(/\/acces-refuse/);
    }
  });

  test("les exports financiers sont refusés", async ({ page }) => {
    for (const report of ["resultat", "clients", "monteurs", "factures", "charges"]) {
      const res = await page.request.get(`/api/exports/${report}`);
      expect(res.status(), report).toBe(403);
    }
  });
});

test.describe("responsable de production sans accès financier", () => {
  test.use({ storageState: statePath("production") });

  test("voit la production mais aucun indicateur financier", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByText("Vidéos actives")).toBeVisible();
    await expect(page.getByText("Marge de production")).toHaveCount(0);
    await expect(page.getByText("CA facturé HT net")).toHaveCount(0);
    await page.goto("/finances");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });

  test("la fiche vidéo n'a pas d'onglet Finances", async ({ page }) => {
    await page.goto("/videos");
    const first = page.locator('a[href^="/videos/"]:not([href*="nouvelle"])').first();
    await first.click();
    await expect(page.getByRole("link", { name: "Production", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Finances", exact: true })).toHaveCount(0);
    expect((await page.request.get("/api/exports/resultat")).status()).toBe(403);
  });
});
