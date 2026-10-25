import "server-only";
import { prisma } from "../db";

/** Réglages lus hors requête (worker) : sans cache React. */
export async function getSettingsUncached() {
  return prisma.agencySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
