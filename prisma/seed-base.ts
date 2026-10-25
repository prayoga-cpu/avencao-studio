/**
 * Données de référence (idempotentes, valables dans tous les environnements) :
 * réglages, catégories de charges, checklist qualité, modèles de projets.
 */
import type { PrismaClient } from "../src/generated/prisma/client";

export const EXPENSE_CATEGORIES = [
  "Abonnements logiciels",
  "Stockage",
  "Musique et licences",
  "Publicité",
  "Services administratifs",
  "Frais bancaires",
  "Autres charges",
];

export const CHECKLIST = [
  "Respect du brief",
  "Orthographe",
  "Sous-titres",
  "Musique",
  "Licences renseignées (si pertinent)",
  "Son et niveaux audio",
  "Cadrage et zones de sécurité",
  "Format et résolution",
  "Durée",
  "Export final",
];

export const TEMPLATES = [
  { name: "Pack Reels", videoType: "REEL", defaultVideoCount: 12, defaultRatio: "9:16", defaultFormat: "1080x1920", defaultExpectedSec: 45, defaultIncludedRevisions: 2, defaultEstimatedHours: "2", titlePattern: "Reel {n}" },
  { name: "Vlog YouTube", videoType: "VLOG", defaultVideoCount: 1, defaultRatio: "16:9", defaultFormat: "3840x2160", defaultExpectedSec: 900, defaultIncludedRevisions: 2, defaultEstimatedHours: "10", titlePattern: "Vlog {n}" },
  { name: "VSL", videoType: "VSL", defaultVideoCount: 1, defaultRatio: "16:9", defaultFormat: "1920x1080", defaultExpectedSec: 600, defaultIncludedRevisions: 3, defaultEstimatedHours: "12", titlePattern: "VSL {n}" },
  { name: "Podcast + extraits", videoType: "PODCAST", defaultVideoCount: 5, defaultRatio: "16:9", defaultFormat: "1920x1080", defaultExpectedSec: 3600, defaultIncludedRevisions: 1, defaultEstimatedHours: "6", titlePattern: "Épisode / extrait {n}" },
  { name: "Publicité + variantes", videoType: "AD", defaultVideoCount: 3, defaultRatio: "9:16", defaultFormat: "1080x1920", defaultExpectedSec: 30, defaultIncludedRevisions: 2, defaultEstimatedHours: "4", titlePattern: "Variante {n}" },
] as const;

export async function seedBase(prisma: PrismaClient): Promise<void> {
  await prisma.agencySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  const existing = await prisma.checklistTemplateItem.count();
  if (existing === 0) {
    await prisma.checklistTemplateItem.createMany({
      data: CHECKLIST.map((label, position) => ({ label, position })),
    });
  }
  for (const t of TEMPLATES) {
    await prisma.projectTemplate.upsert({ where: { name: t.name }, update: {}, create: { ...t } });
  }
}
