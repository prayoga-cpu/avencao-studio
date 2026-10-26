/**
 * Catalogue anglais (src/lib/i18n/en.json) : phrase française exacte → traduction anglaise,
 * et modèles {0} pour les messages construits avec des variables.
 * Couverture vérifiée par tests/unit/i18n-catalog.test.ts (scripts/i18n/extract.mjs).
 */
import catalog from "./en.json";

export const EN: Record<string, string> = catalog.exact;

export const EN_TEMPLATES: ReadonlyArray<readonly [string, string]> = Object.entries(catalog.templates);
