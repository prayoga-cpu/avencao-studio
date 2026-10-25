import { describe, expect, it } from "vitest";
import { dec } from "@/lib/money";
import { agingBucket, computeInvoiceState } from "@/server/domain/invoice-state";

const base = { status: "ISSUED" as const, totalGross: dec("360"), creditedGross: dec("0"), allocated: dec("0"), dueDate: "2026-10-30", today: "2026-10-24" };

describe("état calculé d'une facture", () => {
  it("émise non réglée → partiellement réglée → réglée", () => {
    expect(computeInvoiceState(base).state).toBe("ISSUED_UNPAID");
    const partial = computeInvoiceState({ ...base, allocated: dec("150") });
    expect(partial.state).toBe("PARTIALLY_PAID");
    expect(partial.balance.toFixed(2)).toBe("210.00");
    expect(computeInvoiceState({ ...base, allocated: dec("360") }).state).toBe("PAID");
  });

  it("en retard = échéance dépassée et solde positif", () => {
    const r = computeInvoiceState({ ...base, dueDate: "2026-09-20" });
    expect(r.overdue).toBe(true);
    expect(r.daysOverdue).toBe(34);
    expect(agingBucket(r.daysOverdue)).toBe("D31_60");
    expect(computeInvoiceState({ ...base, dueDate: "2026-09-20", allocated: dec("360") }).overdue).toBe(false);
  });

  it("un avoir réduit le solde une seule fois", () => {
    const r = computeInvoiceState({ ...base, totalGross: dec("120"), creditedGross: dec("120") });
    expect(r.balance.toFixed(2)).toBe("0.00");
    expect(r.state).toBe("PAID");
  });

  it("brouillon et annulée", () => {
    expect(computeInvoiceState({ ...base, status: "DRAFT" }).state).toBe("DRAFT");
    expect(computeInvoiceState({ ...base, status: "CANCELLED" }).state).toBe("CANCELLED");
  });
});
