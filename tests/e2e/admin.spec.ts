import { expect, test } from "@playwright/test";
import { statePath } from "./global-setup";

test.use({ storageState: statePath("admin") });

test("tableau de bord : indicateurs financiers et production", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByText("Marge de production").first()).toBeVisible();
  await expect(page.getByText("Vidéos actives")).toBeVisible();
});

test("fiche vidéo : marge et coûts visibles pour l'administrateur", async ({ page }) => {
  await page.goto("/videos");
  await page.locator('a[href^="/videos/"]:not([href*="nouvelle"])').first().click();
  await page.getByRole("link", { name: "Finances", exact: true }).click();
  await expect(page).toHaveURL(/onglet=finances|tab=finances|finances/);
  await expect(page.getByText(/marge/i).first()).toBeVisible();
});

test("création d'un client puis détection de doublon par email", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  await page.goto("/clients/nouveau");
  await page.fill("input[name=displayName]", `E2E Client ${stamp}`);
  await page.fill("input[name=email]", email);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page).toHaveURL(/\/clients\/(?!nouveau)[a-z0-9]+/);
  await expect(page.getByRole("heading", { name: `E2E Client ${stamp}` })).toBeVisible();

  await page.goto("/clients/nouveau");
  await page.fill("input[name=displayName]", `E2E Autre ${stamp}`);
  await page.fill("input[name=email]", email);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText("Client possiblement déjà enregistré")).toBeVisible();
});

test("export CSV du rapport de résultat", async ({ page }) => {
  const res = await page.request.get("/api/exports/resultat");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain(";");
});

test("navigation mobile @mobile", async ({ page }) => {
  await page.goto("/videos");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Clients" }).click();
  await expect(page).toHaveURL(/\/clients/);
});

test("charge créée puis annulée avec motif (bouton de confirmation)", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const label = `E2E charge ${Date.now()}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  await page.goto("/finances/charges/nouvelle");
  await page.locator("select[name=categoryId]").selectOption({ index: 1 });
  await page.fill("input[name=label]", label);
  await page.fill("input[name=expenseDate]", today);
  await page.fill("input[name=periodMonth]", today.slice(0, 7));
  await page.fill("input[name=amountNet]", "12,50");
  await page.getByRole("button", { name: "Enregistrer la charge" }).click();
  await expect(page).toHaveURL(/onglet=charges/);

  const row = page.locator("tr", { hasText: label });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Annuler" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("Saisie de test e2e");
  await dialog.getByRole("button", { name: "Annuler", exact: true }).last().click();
  await expect(row.getByText("Annulée")).toBeVisible();
  expect(consoleErrors.filter((e) => e.includes("Functions cannot be passed"))).toEqual([]);
});
