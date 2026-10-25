import "server-only";
import { todayInTimezone } from "@/lib/dates";
import { prisma, type Db } from "../db";
import { ConflictError } from "../errors";
import { getSettings } from "../settings";

/** Date du jour dans le fuseau de l'agence (« YYYY-MM-DD »). */
export async function agencyToday(): Promise<string> {
  const s = await getSettings();
  return todayInTimezone(s.timezone);
}

export async function agencyTimezone(): Promise<string> {
  return (await getSettings()).timezone;
}

/** Verrou de ligne (SELECT … FOR UPDATE) dans une transaction, contre les doubles affectations. */
export async function lockRow(db: Db, table: string, id: string): Promise<void> {
  const allowed = ["ClientPayment", "Invoice", "DirectCost", "SupplierPayment", "CreditNote", "SalesOrderLine", "RetainerPeriod", "Retainer"];
  if (!allowed.includes(table)) throw new Error("Table non verrouillable");
  await db.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id);
}

/** Contrôle de concurrence optimiste : échoue si la version a changé. */
export function assertVersion(current: number, expected: number | undefined | null): void {
  if (expected !== undefined && expected !== null && current !== expected) throw new ConflictError();
}

export { prisma };
