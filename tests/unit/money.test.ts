import { describe, expect, it } from "vitest";
import {
  Decimal,
  allocateByWeights,
  allocateEqually,
  dec,
  lineNet,
  lineVat,
  marginRate,
  parseDecimalInput,
  roundMoney,
  sum,
  toEur,
} from "@/lib/money";

describe("arithmétique monétaire exacte", () => {
  it("évite les erreurs de float (0,1 + 0,2)", () => {
    expect(dec("0.1").plus(dec("0.2")).toFixed(2)).toBe("0.30");
    expect(dec("0.1").plus(dec("0.2")).eq(dec("0.3"))).toBe(true);
  });

  it("arrondit au demi supérieur selon la devise (IDR sans décimale)", () => {
    expect(roundMoney(dec("10.005"), "EUR").toFixed(2)).toBe("10.01");
    expect(roundMoney(dec("10.004"), "EUR").toFixed(2)).toBe("10.00");
    expect(roundMoney(dec("1800000.5"), "IDR").toFixed(0)).toBe("1800001");
  });

  it("convertit 1 800 000 IDR au taux manuel de 18 000 IDR/EUR = 100 €", () => {
    expect(toEur(dec("1800000"), "18000").toFixed(2)).toBe("100.00");
  });

  it("un nouveau taux ne réécrit pas l'engagement : la conversion dépend du taux figé passé", () => {
    const frozen = toEur(dec("1800000"), "18000");
    const current = toEur(dec("1800000"), "17500");
    expect(frozen.toFixed(2)).toBe("100.00");
    expect(current.toFixed(2)).toBe("102.86");
  });

  it("lit les saisies françaises", () => {
    expect(parseDecimalInput("1 200,50")?.toFixed(2)).toBe("1200.50");
    expect(parseDecimalInput("1.234,56")?.toFixed(2)).toBe("1234.56");
    expect(parseDecimalInput("1,234.56")?.toFixed(2)).toBe("1234.56");
    expect(parseDecimalInput("1 800 000")?.toFixed(0)).toBe("1800000");
    expect(parseDecimalInput("300 €")?.toFixed(2)).toBe("300.00");
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });

  it("calcule HT et TVA d'une ligne", () => {
    const net = lineNet("3", "99.99", "0.97", "EUR");
    expect(net.toFixed(2)).toBe("299.00");
    expect(lineVat(net, "20", "EUR").toFixed(2)).toBe("59.80");
  });
});

describe("répartition de pack (plus fort reste, déterministe)", () => {
  it("1 200 € sur 12 Reels identiques = 100 € chacun", () => {
    const parts = allocateEqually(dec("1200"), 12, "EUR");
    expect(parts.every((p) => p.toFixed(2) === "100.00")).toBe(true);
    expect(sum(parts).toFixed(2)).toBe("1200.00");
  });

  it("1 000 € sur 3 livrables : centimes résiduels attribués de façon stable", () => {
    const parts = allocateEqually(dec("1000"), 3, "EUR").map((p) => p.toFixed(2));
    expect(parts).toEqual(["333.34", "333.33", "333.33"]);
    // Même entrée → même sortie.
    expect(allocateEqually(dec("1000"), 3, "EUR").map((p) => p.toFixed(2))).toEqual(parts);
  });

  it("pondération explicite avec somme exacte", () => {
    const parts = allocateByWeights(dec("1000"), [dec("2"), dec("1"), dec("1")], "EUR");
    expect(parts.map((p) => p.toFixed(2))).toEqual(["500.00", "250.00", "250.00"]);
    const odd = allocateByWeights(dec("100"), [dec("1"), dec("1"), dec("1"), dec("1"), dec("1"), dec("1"), dec("1")], "EUR");
    expect(sum(odd).toFixed(2)).toBe("100.00");
  });

  it("poids tous nuls → répartition égale ; IDR sans centimes", () => {
    const parts = allocateByWeights(dec("1000000"), [dec(0), dec(0), dec(0)], "IDR");
    expect(parts.map((p) => p.toFixed(0))).toEqual(["333334", "333333", "333333"]);
  });

  it("refuse un total négatif", () => {
    expect(() => allocateEqually(dec("-10"), 2, "EUR")).toThrow();
  });
});

describe("taux de marge sur CA", () => {
  it("revenu nul → non calculable (null), jamais 0 % ni division par zéro", () => {
    expect(marginRate(new Decimal(0), dec("-50"))).toBeNull();
  });
  it("170 / 300 = 56,67 %", () => {
    expect(marginRate(dec("300"), dec("170"))?.toFixed(2)).toBe("56.67");
  });
});
