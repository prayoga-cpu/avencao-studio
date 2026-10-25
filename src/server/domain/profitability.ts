/**
 * Marge directe : revenu contractuel alloué net − coûts directs du même périmètre.
 * - « Prévisionnelle » tant que tous les coûts ne sont pas validés et le livrable livré.
 * - « Incomplète » si au moins un coût est inconnu : jamais de faux résultat rassurant.
 * - Taux de marge sur CA : null (« non calculable ») si le revenu est nul.
 */
import type { CostStage } from "@/generated/prisma/enums";
import { Decimal, marginRate, sum } from "@/lib/money";

export interface CostItem {
  amountEur: Decimal | null;
  stage: CostStage;
}

export type MarginStatus = "FINAL" | "FORECAST" | "INCOMPLETE";

export interface MarginResult {
  revenueEur: Decimal;
  costsEur: Decimal;
  missingCostCount: number;
  marginEur: Decimal;
  ratePct: Decimal | null;
  status: MarginStatus;
}

export function computeMargin(
  revenueEur: Decimal,
  costs: CostItem[],
  options: { delivered?: boolean; uncostedAssignments?: number } = {},
): MarginResult {
  const active = costs.filter((c) => c.stage !== "CANCELLED");
  const known = active.filter((c) => c.amountEur !== null).map((c) => c.amountEur as Decimal);
  const missingCostCount = active.filter((c) => c.amountEur === null).length + (options.uncostedAssignments ?? 0);
  const costsEur = sum(known);
  const marginEur = revenueEur.minus(costsEur);
  const allValidated = active.every((c) => c.stage === "VALIDATED");
  const status: MarginStatus =
    missingCostCount > 0 ? "INCOMPLETE" : allValidated && options.delivered ? "FINAL" : "FORECAST";
  return {
    revenueEur,
    costsEur,
    missingCostCount,
    marginEur,
    ratePct: marginRate(revenueEur, marginEur),
    status,
  };
}

export const MARGIN_STATUS_LABELS: Record<MarginStatus, string> = {
  FINAL: "Marge finale",
  FORECAST: "Marge prévisionnelle",
  INCOMPLETE: "Marge provisoire (coûts incomplets)",
};

export function isBelowThreshold(ratePct: Decimal | null, thresholdPct: Decimal): boolean {
  return ratePct !== null && ratePct.lt(thresholdPct);
}
