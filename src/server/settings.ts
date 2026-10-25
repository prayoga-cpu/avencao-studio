import "server-only";
import { cache } from "react";
import { prisma } from "./db";

/** Réglages de l'agence (singleton). Lu par requête, jamais mis en cache partagé. */
export const getSettings = cache(async () => {
  return prisma.agencySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
});
