/**
 * Formatage d'affichage (serveur et navigateur). Les montants arrivent en chaînes
 * décimales et sont formatés sans conversion financière en Number : Intl.NumberFormat
 * accepte les chaînes numériques et conserve leur précision.
 */
import type { CurrencyCode } from "./money";
import { INTL_LOCALE, type Locale } from "./i18n/locales";

const DECIMALS: Record<CurrencyCode, number> = { EUR: 2, USD: 2, IDR: 0 };
const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, compact = false, locale: Locale = "fr"): Intl.NumberFormat {
  const key = `${currency}-${compact}-${locale}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: "currency",
      currency,
      minimumFractionDigits: compact ? 0 : DECIMALS[currency],
      maximumFractionDigits: compact ? 0 : DECIMALS[currency],
    });
    cache.set(key, f);
  }
  return f;
}

type NumericString = `${number}` | string;

/** 1234.5 (chaîne) → « 1 234,50 € ». null → « À renseigner ». */
export function formatMoney(
  amount: NumericString | null | undefined,
  currency: CurrencyCode = "EUR",
  options: { compact?: boolean; empty?: string; locale?: Locale } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return options.empty ?? (options.locale === "en" ? "To be entered" : "À renseigner");
  return formatter(currency, options.compact, options.locale).format(amount as unknown as number);
}

const pctFormatters: Record<Locale, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat(INTL_LOCALE.fr, { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat(INTL_LOCALE.en, { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
};

/** « 56.67 » → « 56,67 % » (fr) ou « 56.67% » (en). null → « non calculable ». */
export function formatPercent(value: NumericString | null | undefined, empty?: string, locale: Locale = "fr"): string {
  if (value === null || value === undefined || value === "") return empty ?? (locale === "en" ? "not computable" : "non calculable");
  const n = pctFormatters[locale].format(value as unknown as number);
  return locale === "en" ? `${n}%` : `${n} %`;
}

const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

export function formatNumber(value: NumericString | number | null | undefined, empty = "—"): string {
  if (value === null || value === undefined || value === "") return empty;
  return numberFormatter.format(value as number);
}

export function formatHours(value: NumericString | null | undefined, empty = "non estimé"): string {
  if (value === null || value === undefined || value === "") return empty;
  return `${numberFormatter.format(value as unknown as number)} h`;
}

/** Signe d'un montant décimal en chaîne, sans Number. */
export function signOf(amount: string | null | undefined): -1 | 0 | 1 {
  if (!amount) return 0;
  const t = amount.trim();
  if (/^-/.test(t) && /[1-9]/.test(t)) return -1;
  return /[1-9]/.test(t) ? 1 : 0;
}

export function initials(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
