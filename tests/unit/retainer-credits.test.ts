import { describe, expect, it } from "vitest";
import { computePeriodCredits, remainingCredits } from "@/server/domain/retainer-credits";

describe("crédits de forfait récurrent", () => {
  const quotas = [{ videoType: "REEL" as const, quantity: 10 }];

  it("sans report : quota seul", () => {
    const c = computePeriodCredits(quotas, { credits: { base: { REEL: 10 }, carried: {} }, used: { REEL: 6 } }, "NONE");
    expect(c).toEqual({ base: { REEL: 10 }, carried: {} });
  });

  it("report sur la période suivante uniquement : le reliquat reporté ne se reporte pas deux fois", () => {
    const c = computePeriodCredits(quotas, { credits: { base: { REEL: 10 }, carried: { REEL: 3 } }, used: { REEL: 5 } }, "NEXT_PERIOD");
    // 5 utilisés : 3 reportés consommés d'abord, puis 2 sur la base → 8 de base inutilisés.
    expect(c.carried).toEqual({ REEL: 8 });
  });

  it("report illimité", () => {
    const c = computePeriodCredits(quotas, { credits: { base: { REEL: 10 }, carried: { REEL: 3 } }, used: { REEL: 1 } }, "UNLIMITED");
    expect(c.carried).toEqual({ REEL: 12 });
  });

  it("reliquat", () => {
    expect(remainingCredits({ base: { REEL: 10 }, carried: { REEL: 2 } }, { REEL: 4 })).toEqual({ REEL: 8 });
  });
});
