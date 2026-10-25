/**
 * Arithmétique monétaire exacte (decimal.js). Aucun calcul financier en float.
 *
 * Règles (voir docs/definitions-financieres.md) :
 * - Arrondi « demi supérieur » (ROUND_HALF_UP) à la précision de la devise.
 * - Précision : EUR et USD = 2 décimales ; IDR = 0 décimale (usage courant,
 *   stocké en NUMERIC(18,2) avec ,00).
 * - Taux de change en « unités de devise pour 1 EUR » ; EUR = montant / taux.
 * - Les montants circulent entre serveur et navigateur sous forme de chaînes.
 */
import DecimalJs from "decimal.js";

export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

export type CurrencyCode = "EUR" | "IDR" | "USD";
export const CURRENCIES: readonly CurrencyCode[] = ["EUR", "IDR", "USD"] as const;

export const CURRENCY_DECIMALS: Record<CurrencyCode, number> = {
  EUR: 2,
  USD: 2,
  IDR: 0,
};

/** Valeur acceptée en entrée : nombre décimal sous forme de chaîne, Decimal (decimal.js ou Prisma). */
export type DecimalLike = string | number | Decimal | { toString(): string };

export function dec(value: DecimalLike | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Montant invalide");
    // Les nombres ne servent qu'aux quantités entières (ex. nombre de vidéos).
    return new Decimal(value);
  }
  return new Decimal(value.toString());
}

/** Comme `dec` mais conserve null (coût inconnu ≠ 0). */
export function decOrNull(value: DecimalLike | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  return dec(value);
}

export function roundMoney(value: Decimal, currency: CurrencyCode): Decimal {
  return value.toDecimalPlaces(CURRENCY_DECIMALS[currency], Decimal.ROUND_HALF_UP);
}

/** Arrondi au centime (EUR, reporting). */
export function roundCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Iterable<Decimal>): Decimal {
  let total = new Decimal(0);
  for (const v of values) total = total.plus(v);
  return total;
}

/** Conversion en EUR à partir d'un taux figé « unités pour 1 EUR ». */
export function toEur(amount: Decimal, unitsPerEur: DecimalLike): Decimal {
  const rate = dec(unitsPerEur);
  if (rate.lte(0)) throw new Error("Taux de change invalide");
  return roundCents(amount.div(rate));
}

/**
 * Lecture d'une saisie utilisateur : accepte « 1 200,50 », « 1200.5 », « 1 800 000 ».
 * Retourne null si la saisie n'est pas un nombre valide.
 */
export function parseDecimalInput(input: string): Decimal | null {
  const cleaned = input
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/€|eur|usd|idr|\$|rp/gi, "");
  if (cleaned === "") return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Le dernier séparateur est le séparateur décimal.
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return new Decimal(normalized);
}

/**
 * Répartition déterministe d'un total selon des poids (méthode du plus fort reste).
 * - La somme des parts est exactement égale au total arrondi à la devise.
 * - Les unités résiduelles vont aux plus grands restes ; à égalité, à l'index le plus petit.
 * - Poids tous nuls → répartition égale.
 */
export function allocateByWeights(
  total: Decimal,
  weights: Decimal[],
  currency: CurrencyCode,
): Decimal[] {
  if (weights.length === 0) return [];
  if (total.isNegative()) throw new Error("Répartition d'un montant négatif non prise en charge");
  if (weights.some((w) => w.isNegative())) throw new Error("Poids négatif");
  const decimals = CURRENCY_DECIMALS[currency];
  const unit = new Decimal(1).div(new Decimal(10).pow(decimals));
  const target = roundMoney(total, currency);
  const effective = weights.every((w) => w.isZero()) ? weights.map(() => new Decimal(1)) : weights;
  const weightSum = sum(effective);

  const raw = effective.map((w) => target.mul(w).div(weightSum));
  const floors = raw.map((r) => r.div(unit).floor().mul(unit));
  let remainderUnits = target.minus(sum(floors)).div(unit).round().toNumber();

  const order = raw
    .map((r, index) => ({ index, frac: r.minus(floors[index]) }))
    .sort((a, b) => {
      const cmp = b.frac.comparedTo(a.frac);
      return cmp !== 0 ? cmp : a.index - b.index;
    });

  const result = [...floors];
  for (const { index } of order) {
    if (remainderUnits <= 0) break;
    result[index] = result[index].plus(unit);
    remainderUnits -= 1;
  }
  return result;
}

export function allocateEqually(total: Decimal, count: number, currency: CurrencyCode): Decimal[] {
  return allocateByWeights(
    total,
    Array.from({ length: count }, () => new Decimal(1)),
    currency,
  );
}

/**
 * Taux de marge sur CA = marge / revenu × 100.
 * Revenu nul → null (« non calculable »), jamais 0 % ni division par zéro.
 */
export function marginRate(revenue: Decimal, margin: Decimal): Decimal | null {
  if (revenue.isZero()) return null;
  return margin.div(revenue).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Montant HT d'une ligne : quantité × prix unitaire − remise, arrondi devise. */
export function lineNet(
  quantity: DecimalLike,
  unitPrice: DecimalLike,
  discount: DecimalLike,
  currency: CurrencyCode,
): Decimal {
  return roundMoney(dec(quantity).mul(dec(unitPrice)).minus(dec(discount)), currency);
}

/** TVA d'une ligne arrondie à la devise. */
export function lineVat(net: Decimal, vatRatePct: DecimalLike, currency: CurrencyCode): Decimal {
  return roundMoney(net.mul(dec(vatRatePct)).div(100), currency);
}

export function toMoneyString(value: Decimal | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(2);
}

export function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}
