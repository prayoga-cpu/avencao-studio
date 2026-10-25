/**
 * Formatage d'affichage (serveur et navigateur). Les montants arrivent en chaînes
 * décimales et sont formatés sans conversion financière en Number : Intl.NumberFormat
 * accepte les chaînes numériques et conserve leur précision.
 */
import type { CurrencyCode } from "./money";

const DECIMALS: Record<CurrencyCode, number> = { EUR: 2, USD: 2, IDR: 0 };
const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, compact = false): Intl.NumberFormat {
  const key = `${currency}-${compact}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", {
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
  options: { compact?: boolean; empty?: string } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return options.empty ?? "À renseigner";
  return formatter(currency, options.compact).format(amount as unknown as number);
}

const pctFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** « 56.67 » → « 56,67 % ». null → « non calculable ». */
export function formatPercent(value: NumericString | null | undefined, empty = "non calculable"): string {
  if (value === null || value === undefined || value === "") return empty;
  return `${pctFormatter.format(value as unknown as number)} %`;
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
