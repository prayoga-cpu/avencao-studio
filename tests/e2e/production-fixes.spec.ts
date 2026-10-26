import { expect, test, type Locator, type Page } from "@playwright/test";
import { statePath } from "./global-setup";

/** Captures facultatives pour relecture visuelle (E2E_SCREENSHOTS_DIR). */
async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function openFirstProject(page: Page) {
  await page.goto("/projets");
  // Liens visibles seulement : sur mobile, le tableau (caché) précède les cartes dans le DOM.
  await page.locator('a[href^="/projets/"]:not([href*="nouveau"]):visible').first().click();
  await expect(page).toHaveURL(/\/projets\/(?!nouveau)[a-z0-9]+$/);
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("élément non affiché");
  return b;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("administrateur", () => {
  test.use({ storageState: statePath("admin") });

  test("ajout groupé de vidéos : fenêtre large, boutons collés en bas, aucun champ masqué", async ({ page }) => {
    await openFirstProject(page);
    await page.getByRole("button", { name: "Ajouter des vidéos" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const d = await box(dialog);
    const viewport = page.viewportSize()!;
    // Avant : 384 px (sm:max-w-sm l'emportait) et fenêtre plus haute que l'écran.
    expect(d.width).toBeGreaterThan(600);
    expect(d.y).toBeGreaterThanOrEqual(0);
    expect(d.y + d.height).toBeLessThanOrEqual(viewport.height + 1);
    const submit = dialog.getByRole("button", { name: "Créer les vidéos" });
    const s = await box(submit);
    expect(s.y + s.height).toBeLessThanOrEqual(d.y + d.height);
    await shot(page, "bulk-dialog-desktop");
    // Tout en bas du formulaire, le dernier champ reste au-dessus des boutons.
    await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const brief = await box(dialog.getByLabel("Brief commun"));
    const footerTop = (await box(submit)).y;
    expect(brief.y + brief.height).toBeLessThanOrEqual(footerTop);
  });

  test("sélection groupée : seules les étapes autorisées sont proposées, attribution groupée disponible", async ({ page }) => {
    await page.goto("/videos");
    const checks = page.locator("tbody input[type=checkbox]");
    await checks.nth(0).check();
    await checks.nth(1).check();
    const bar = page.getByRole("region", { name: "Actions groupées" });
    await expect(bar).toBeVisible();
    await expect(bar.getByText("2 sélectionnée(s)")).toBeVisible();
    const options = await bar.getByLabel("Étape", { exact: true }).locator("option:not([disabled])").allTextContents();
    const steps = options.filter((o) => /\d+\/2$/.test(o));
    expect(steps.length).toBeGreaterThan(0);
    await shot(page, "bulk-bar-desktop");

    await bar.getByRole("button", { name: "Attribuer à…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Prestataire").selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Calculer l'impact" }).click();
    await expect(dialog.getByText("Missions à créer")).toBeVisible();
    await shot(page, "bulk-assign-desktop");
  });

  test("prix du projet : la part de chaque vidéo s'affiche avant d'enregistrer", async ({ page }) => {
    await openFirstProject(page);
    await page.getByRole("button", { name: "Prix du projet" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Montant HT du forfait").fill("700");
    await expect(dialog.getByText(/par vidéo \(répartition automatique/).or(dialog.getByText(/sera réparti dès l'ajout/))).toBeVisible();
    await dialog.getByText("Prix par vidéo", { exact: true }).click();
    await expect(dialog.getByLabel("Prix HT par vidéo")).toBeVisible();
    await page.waitForTimeout(250); // fin de la transition de couleur des cartes
    await shot(page, "project-price-desktop");
  });

  test("barre latérale : le bouton de déconnexion reste dans la carte profil", async ({ page }) => {
    await page.goto("/dashboard");
    const aside = page.locator("aside");
    const logout = aside.getByRole("button", { name: "Se déconnecter" });
    const card = aside.locator("div.rounded-2xl").filter({ has: page.getByRole("button", { name: "Se déconnecter" }) });
    const c = await box(card);
    const b = await box(logout);
    expect(b.x).toBeGreaterThanOrEqual(c.x);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width);
    await shot(page, "sidebar-desktop");
  });

  test("dialogue en feuille mobile : pleine largeur, ancré en bas, boutons visibles @mobile", async ({ page }) => {
    await openFirstProject(page);
    await noHorizontalOverflow(page);
    await page.getByRole("button", { name: "Ajouter des vidéos" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300); // fin de l'animation d'ouverture
    const viewport = page.viewportSize()!;
    const d = await box(dialog);
    expect(Math.round(d.width)).toBe(viewport.width);
    expect(Math.round(d.y + d.height)).toBe(viewport.height);
    const submit = await box(dialog.getByRole("button", { name: "Créer les vidéos" }));
    expect(submit.y + submit.height).toBeLessThanOrEqual(viewport.height);
    await shot(page, "bulk-dialog-mobile");
  });

  test("vidéos sur mobile : filtres repliés, sélection et barre d'actions en bas @mobile", async ({ page }) => {
    await page.goto("/videos");
    await noHorizontalOverflow(page);
    const filters = page.getByRole("button", { name: "Filtres" });
    await expect(filters).toBeVisible();
    await expect(page.getByLabel("Client", { exact: true })).toBeHidden();
    await filters.click();
    await expect(page.getByLabel("Client", { exact: true })).toBeVisible();
    await page.locator("li input[type=checkbox]").first().check();
    const bar = page.getByRole("region", { name: "Actions groupées" });
    await expect(bar).toBeVisible();
    const viewport = page.viewportSize()!;
    const b = await box(bar);
    expect(Math.round(b.y + b.height)).toBe(viewport.height);
    await noHorizontalOverflow(page);
    await shot(page, "bulk-bar-mobile");
  });
});

test.describe("monteur", () => {
  test.use({ storageState: statePath("editor") });

  test("planning du monteur : agenda lisible sur téléphone @mobile", async ({ page }) => {
    await page.goto("/planning");
    await noHorizontalOverflow(page);
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(page.locator("ol").first().or(page.getByText(/Aucune échéance/).first())).toBeVisible();
    await shot(page, "planning-editor-mobile");
  });
});
