import { describe, expect, it } from "vitest";
import { billableMinutes, computeAssignmentCost } from "@/server/domain/costing";

describe("coût d'une mission (tarif figé)", () => {
  it("forfait par vidéo : indépendant de la durée finale", () => {
    const r1 = computeAssignmentCost(
      { mode: "PER_VIDEO", unitPrice: "30", currency: "EUR", quantity: "1" },
      { finalDurationSec: 30 },
    );
    const r2 = computeAssignmentCost(
      { mode: "PER_VIDEO", unitPrice: "30", currency: "EUR", quantity: "1" },
      { finalDurationSec: 600 },
    );
    expect(r1.amount?.toFixed(2)).toBe("30.00");
    expect(r2.amount?.toFixed(2)).toBe("30.00");
  });

  it("minute finale : arrondi explicite configuré", () => {
    expect(billableMinutes(125, "CEIL_MINUTE").toString()).toBe("3");
    expect(billableMinutes(125, "CEIL_HALF_MINUTE").toString()).toBe("2.5");
    expect(billableMinutes(125, "EXACT_SECOND").toFixed(4)).toBe("2.0833");
    const r = computeAssignmentCost(
      { mode: "PER_FINAL_MINUTE", unitPrice: "12", currency: "EUR", quantity: "1", minuteRounding: "CEIL_MINUTE" },
      { finalDurationSec: 125 },
    );
    expect(r.amount?.toFixed(2)).toBe("36.00");
    expect(r.status).toBe("OK");
  });

  it("minute finale sans durée → coût à renseigner (null), jamais 0", () => {
    const r = computeAssignmentCost(
      { mode: "PER_FINAL_MINUTE", unitPrice: "12", currency: "EUR", quantity: "1" },
      {},
    );
    expect(r.amount).toBeNull();
    expect(r.status).toBe("MISSING_DURATION");
  });

  it("minute finale estimée sur la durée attendue tant que la durée réelle est inconnue", () => {
    const r = computeAssignmentCost(
      { mode: "PER_FINAL_MINUTE", unitPrice: "10", currency: "EUR", quantity: "1", minuteRounding: "CEIL_MINUTE" },
      { expectedDurationSec: 90 },
    );
    expect(r.amount?.toFixed(2)).toBe("20.00");
    expect(r.status).toBe("ESTIMATED_FROM_EXPECTED");
  });

  it("heure et journée : prix × quantité", () => {
    expect(
      computeAssignmentCost({ mode: "HOURLY", unitPrice: "25", currency: "EUR", quantity: "3.5" }).amount?.toFixed(2),
    ).toBe("87.50");
    expect(
      computeAssignmentCost({ mode: "DAILY", unitPrice: "1800000", currency: "IDR", quantity: "1" }).amount?.toFixed(0),
    ).toBe("1800000");
  });

  it("enveloppe mensuelle : pas de coût par mission (évite le double comptage)", () => {
    const r = computeAssignmentCost({ mode: "MONTHLY_ENVELOPE", unitPrice: "800", currency: "EUR", quantity: "1" });
    expect(r.amount).toBeNull();
    expect(r.status).toBe("ENVELOPE");
  });

  it("tarif absent → à renseigner", () => {
    expect(computeAssignmentCost(null).status).toBe("MISSING_RATE");
  });
});
