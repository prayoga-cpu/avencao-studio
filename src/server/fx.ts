import "server-only";
import type { Currency, FxSource } from "@/generated/prisma/enums";
import { parseDateOnly } from "@/lib/dates";
import { Decimal, dec, parseDecimalInput, roundCents } from "@/lib/money";
import type { Db } from "./db";
import { DomainError } from "./errors";

export interface FxSnapshot {
  unitsPerEur: Decimal;
  rateDate: Date;
  source: FxSource;
}

/**
 * Taux figé pour une opération : EUR = 1 ; taux manuel saisi (signalé MANUAL) ;
 * sinon dernier taux de référence à la date de l'opération. Les opérations passées
 * ne sont jamais recalculées avec le taux courant.
 */
export async function resolveFx(
  db: Db,
  currency: Currency,
  isoDate: string,
  manualRate?: string | null,
): Promise<FxSnapshot> {
  const date = parseDateOnly(isoDate);
  if (currency === "EUR") return { unitsPerEur: new Decimal(1), rateDate: date, source: "IDENTITY" };
  if (manualRate && manualRate.trim() !== "") {
    const rate = parseDecimalInput(manualRate);
    if (!rate || rate.lte(0)) throw new DomainError("Taux de change manuel invalide.");
    return { unitsPerEur: rate, rateDate: date, source: "MANUAL" };
  }
  const ref = await db.exchangeRate.findFirst({
    where: { currency, date: { lte: date } },
    orderBy: { date: "desc" },
  });
  if (!ref) {
    throw new DomainError(
      `Aucun taux ${currency} → EUR disponible à cette date : saisissez un taux manuel ou ajoutez-le dans Réglages › Taux de change.`,
    );
  }
  return { unitsPerEur: dec(ref.unitsPerEur), rateDate: ref.date, source: "REFERENCE_TABLE" };
}

export function convert(amount: Decimal, fx: FxSnapshot): Decimal {
  return roundCents(amount.div(fx.unitsPerEur));
}

export function fxData(fx: FxSnapshot) {
  return { fxUnitsPerEur: fx.unitsPerEur.toFixed(), fxRateDate: fx.rateDate, fxSource: fx.source };
}
