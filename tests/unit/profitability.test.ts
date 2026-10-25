import { describe, expect, it } from "vitest";
import { dec, sum, allocateEqually } from "@/lib/money";
import { computeMargin } from "@/server/domain/profitability";

describe("scénarios financiers obligatoires — marge directe", () => {
  it("vidéo 300 € HT, monteur 90 €, motion 30 €, achat 10 € → coûts 130, marge 170, taux 56,67 %", () => {
    const r = computeMargin(
      dec("300"),
      [
        { amountEur: dec("90"), stage: "VALIDATED" },
        { amountEur: dec("30"), stage: "VALIDATED" },
        { amountEur: dec("10"), stage: "VALIDATED" },
      ],
      { delivered: true },
    );
    expect(r.costsEur.toFixed(2)).toBe("130.00");
    expect(r.marginEur.toFixed(2)).toBe("170.00");
    expect(r.ratePct?.toFixed(2)).toBe("56.67");
    expect(r.status).toBe("FINAL");
  });

  it("pack 12 Reels à 1 200 € HT, 30 € par Reel → coût 360, marge 840, taux 70 %", () => {
    const allocations = allocateEqually(dec("1200"), 12, "EUR");
    const revenue = sum(allocations);
    const costs = Array.from({ length: 12 }, () => ({ amountEur: dec("30"), stage: "COMMITTED" as const }));
    const r = computeMargin(revenue, costs);
    expect(r.revenueEur.toFixed(2)).toBe("1200.00");
    expect(r.costsEur.toFixed(2)).toBe("360.00");
    expect(r.marginEur.toFixed(2)).toBe("840.00");
    expect(r.ratePct?.toFixed(2)).toBe("70.00");
    expect(r.status).toBe("FORECAST");
  });

  it("mission engagée non réglée : le coût est dans la marge", () => {
    const r = computeMargin(dec("200"), [{ amountEur: dec("60"), stage: "COMMITTED" }]);
    expect(r.marginEur.toFixed(2)).toBe("140.00");
  });

  it("coût absent et revenu nul → marge provisoire, taux non calculable", () => {
    const r = computeMargin(dec("0"), [{ amountEur: null, stage: "ESTIMATED" }]);
    expect(r.status).toBe("INCOMPLETE");
    expect(r.missingCostCount).toBe(1);
    expect(r.ratePct).toBeNull();
  });

  it("les coûts annulés sont exclus, les coûts dus d'une vidéo annulée restent", () => {
    const r = computeMargin(dec("0"), [
      { amountEur: dec("40"), stage: "VALIDATED" },
      { amountEur: dec("25"), stage: "CANCELLED" },
    ]);
    expect(r.costsEur.toFixed(2)).toBe("40.00");
    expect(r.marginEur.toFixed(2)).toBe("-40.00");
  });

  it("une mission sans coût compte comme incomplète même sans ligne de coût", () => {
    const r = computeMargin(dec("100"), [], { uncostedAssignments: 2 });
    expect(r.status).toBe("INCOMPLETE");
    expect(r.missingCostCount).toBe(2);
  });
});
