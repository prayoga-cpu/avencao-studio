-- Forfait projet : une ligne de vente peut être répartie automatiquement, à parts égales,
-- sur toutes les vidéos actives de son projet (recalcul à chaque ajout, annulation ou
-- réouverture de vidéo). Idempotent : rejouable sans erreur.
ALTER TABLE "SalesOrderLine" ADD COLUMN IF NOT EXISTS "autoAllocate" BOOLEAN NOT NULL DEFAULT false;

-- Missions créées sans échéance (vidéo sans deadline interne) : elles prennent l'échéance de
-- la vidéo — deadline interne, sinon deadline client — et apparaissent au planning du monteur.
UPDATE "Assignment" AS a
SET "dueOn" = COALESCE(v."internalDeadline", v."clientDeadline")
FROM "Video" AS v
WHERE a."videoId" = v."id"
  AND a."dueOn" IS NULL
  AND a."status" <> 'CANCELLED'
  AND COALESCE(v."internalDeadline", v."clientDeadline") IS NOT NULL;
