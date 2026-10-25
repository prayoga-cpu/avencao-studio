import "server-only";
import { parseDateOnly } from "@/lib/dates";
import { parseDecimalInput, type Decimal } from "@/lib/money";

export function str(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function decOrNull(v: string | null | undefined): Decimal | null {
  const s = str(v);
  return s === null ? null : parseDecimalInput(s);
}

export function decRequired(v: string): Decimal {
  const d = parseDecimalInput(v);
  if (!d) throw new Error("Nombre invalide");
  return d;
}

export function dateOrNull(v: string | null | undefined): Date | null {
  const s = str(v);
  return s === null ? null : parseDateOnly(s);
}

export function intOrNull(v: string | null | undefined): number | null {
  const s = str(v);
  return s === null ? null : Number.parseInt(s, 10);
}
