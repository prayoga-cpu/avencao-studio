import "server-only";
import type { Db } from "./db";

type CounterKind = "VIDEO" | "PROJECT" | "SALES";

/** Incrément atomique (INSERT … ON CONFLICT … RETURNING) : pas de doublon même en concurrence. */
async function next(db: Db, key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "ReferenceCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "ReferenceCounter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export async function nextReference(db: Db, kind: CounterKind, year: number, videoPrefix = "AV"): Promise<string> {
  const n = await next(db, `${kind}-${year}`);
  switch (kind) {
    case "VIDEO":
      return `${videoPrefix}-${year}-${String(n).padStart(4, "0")}`;
    case "PROJECT":
      return `PRJ-${year}-${String(n).padStart(3, "0")}`;
    case "SALES":
      return `VTE-${year}-${String(n).padStart(3, "0")}`;
  }
}
