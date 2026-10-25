/**
 * Calcul du coût d'une mission à partir du tarif figé.
 * - Forfait vidéo : ne varie pas avec la durée finale.
 * - Minute finale : règle d'arrondi explicite ; durée finale si connue, sinon durée attendue (estimation).
 * - Enveloppe mensuelle : pas de coût par mission (la dépense est l'enveloppe, allouée analytiquement).
 * - Tarif ou durée manquants : coût « À renseigner » (null), jamais 0.
 */
import type { MinuteRounding, RateMode } from "@/generated/prisma/enums";
import { Decimal, dec, roundMoney, type CurrencyCode, type DecimalLike } from "@/lib/money";

export interface RateSnapshot {
  mode: RateMode;
  unitPrice: DecimalLike;
  currency: CurrencyCode;
  quantity: DecimalLike;
  minuteRounding?: MinuteRounding | null;
}

export type CostStatus = "OK" | "ESTIMATED_FROM_EXPECTED" | "MISSING_RATE" | "MISSING_DURATION" | "ENVELOPE";

export interface CostResult {
  amount: Decimal | null;
  billableQuantity: Decimal | null;
  status: CostStatus;
  basis: string;
}

export function billableMinutes(seconds: number, rounding: MinuteRounding): Decimal {
  const sec = new Decimal(seconds);
  switch (rounding) {
    case "EXACT_SECOND":
      return sec.div(60);
    case "CEIL_HALF_MINUTE":
      return sec.div(30).ceil().div(2);
    case "CEIL_MINUTE":
    default:
      return sec.div(60).ceil();
  }
}

export function computeAssignmentCost(
  rate: RateSnapshot | null,
  ctx: { finalDurationSec?: number | null; expectedDurationSec?: number | null; defaultRounding?: MinuteRounding } = {},
): CostResult {
  if (!rate || rate.unitPrice === null || rate.unitPrice === undefined || rate.unitPrice === "") {
    return { amount: null, billableQuantity: null, status: "MISSING_RATE", basis: "Tarif non renseigné" };
  }
  const unitPrice = dec(rate.unitPrice);
  const quantity = dec(rate.quantity || 1);

  switch (rate.mode) {
    case "MONTHLY_ENVELOPE":
      return {
        amount: null,
        billableQuantity: null,
        status: "ENVELOPE",
        basis: "Couvert par l'enveloppe mensuelle du prestataire (allocation analytique)",
      };
    case "PER_FINAL_MINUTE": {
      const rounding = rate.minuteRounding ?? ctx.defaultRounding ?? "CEIL_MINUTE";
      const seconds = ctx.finalDurationSec ?? ctx.expectedDurationSec ?? null;
      if (seconds === null || seconds === undefined) {
        return {
          amount: null,
          billableQuantity: null,
          status: "MISSING_DURATION",
          basis: "Durée finale inconnue : coût à renseigner",
        };
      }
      const minutes = billableMinutes(seconds, rounding);
      const estimated = ctx.finalDurationSec === null || ctx.finalDurationSec === undefined;
      return {
        amount: roundMoney(unitPrice.mul(minutes), rate.currency),
        billableQuantity: minutes,
        status: estimated ? "ESTIMATED_FROM_EXPECTED" : "OK",
        basis: `${minutes.toString()} min × ${unitPrice.toString()} ${rate.currency}${estimated ? " (sur la durée attendue)" : ""}`,
      };
    }
    case "PER_VIDEO":
    case "HOURLY":
    case "DAILY":
    default:
      return {
        amount: roundMoney(unitPrice.mul(quantity), rate.currency),
        billableQuantity: quantity,
        status: "OK",
        basis: `${quantity.toString()} × ${unitPrice.toString()} ${rate.currency}`,
      };
  }
}
