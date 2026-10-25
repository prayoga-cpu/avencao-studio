/**
 * Crédits de production d'un forfait récurrent. Les crédits sont distincts des
 * encaissements : consommer un crédit ne crée ni facture ni paiement.
 * Les crédits reportés sont consommés en premier.
 */
import type { CarryOverPolicy, VideoType } from "@/generated/prisma/enums";

export type CreditMap = Partial<Record<VideoType, number>>;

export interface PeriodCredits {
  base: CreditMap;
  carried: CreditMap;
}

export function computePeriodCredits(
  quotas: { videoType: VideoType; quantity: number }[],
  previous: { credits: PeriodCredits; used: CreditMap } | null,
  policy: CarryOverPolicy,
): PeriodCredits {
  const base: CreditMap = {};
  for (const q of quotas) base[q.videoType] = q.quantity;
  const carried: CreditMap = {};
  if (previous && policy !== "NONE") {
    const types = new Set<VideoType>([
      ...(Object.keys(previous.credits.base) as VideoType[]),
      ...(Object.keys(previous.credits.carried) as VideoType[]),
    ]);
    for (const type of types) {
      const prevBase = previous.credits.base[type] ?? 0;
      const prevCarried = previous.credits.carried[type] ?? 0;
      const used = previous.used[type] ?? 0;
      const usedFromBase = Math.max(0, used - prevCarried);
      const unusedBase = Math.max(0, prevBase - usedFromBase);
      const unusedCarried = Math.max(0, prevCarried - used);
      const carry = policy === "NEXT_PERIOD" ? unusedBase : unusedBase + unusedCarried;
      if (carry > 0) carried[type] = carry;
    }
  }
  return { base, carried };
}

export function remainingCredits(credits: PeriodCredits, used: CreditMap): CreditMap {
  const result: CreditMap = {};
  const types = new Set<VideoType>([
    ...(Object.keys(credits.base) as VideoType[]),
    ...(Object.keys(credits.carried) as VideoType[]),
  ]);
  for (const type of types) {
    result[type] = (credits.base[type] ?? 0) + (credits.carried[type] ?? 0) - (used[type] ?? 0);
  }
  return result;
}
