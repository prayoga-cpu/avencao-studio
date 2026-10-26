/** Langues de l'interface. Le français reste la langue de référence (texte source). */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "avencao_lang";
export const LOCALE_LABELS: Record<Locale, string> = { fr: "Français", en: "English" };
/** Formats régionaux : en-GB garde les dates JJ/MM/AAAA et l'euro. */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}
