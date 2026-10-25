/**
 * Conversion des objets Prisma en données sérialisables pour les Client Components :
 * Decimal → chaîne décimale exacte, BigInt → chaîne. Les Date restent des Date
 * (prises en charge par le protocole RSC).
 */

type DecimalLikeObject = { toFixed: (dp?: number) => string; d: number[]; e: number; s: number };

function isDecimalObject(value: unknown): value is DecimalLikeObject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DecimalLikeObject).toFixed === "function" &&
    Array.isArray((value as DecimalLikeObject).d) &&
    typeof (value as DecimalLikeObject).e === "number"
  );
}

export type Plain<T> = T extends { toFixed: (dp?: number) => string; d: number[] }
  ? string
  : T extends bigint
    ? string
    : T extends Date
      ? Date
      : T extends Array<infer U>
        ? Plain<U>[]
        : T extends object
          ? { [K in keyof T]: Plain<T[K]> }
          : T;

export function plain<T>(value: T): Plain<T> {
  if (value === null || value === undefined) return value as Plain<T>;
  if (isDecimalObject(value)) return value.toFixed() as Plain<T>;
  if (typeof value === "bigint") return value.toString() as Plain<T>;
  if (value instanceof Date) return value as Plain<T>;
  if (Array.isArray(value)) return value.map((v) => plain(v)) as Plain<T>;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = plain(v);
    return out as Plain<T>;
  }
  return value as Plain<T>;
}

/** Variante JSON (audit) : les Date deviennent des chaînes ISO. */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (isDecimalObject(value)) return value.toFixed();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}
