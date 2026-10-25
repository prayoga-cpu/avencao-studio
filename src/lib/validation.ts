/**
 * Schémas Zod partagés navigateur/serveur. Les valeurs restent des chaînes (pas de
 * transformation) : le serveur revalide puis convertit avec les helpers de server/convert.ts.
 */
import { z } from "zod";
import { isIsoDate } from "./dates";
import { parseDecimalInput } from "./money";

export function isSafeUrl(value: string): boolean {
  if (value.length > 2000) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export const zText = (max = 200) => z.string().trim().max(max, `${max} caractères maximum`);
export const zLongText = (max = 10_000) => z.string().trim().max(max, `${max} caractères maximum`);
export const zRequired = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} : champ obligatoire`).max(max, `${max} caractères maximum`);
export const zId = z.string().trim().min(1).max(64);
export const zOptionalId = z.string().trim().max(64);

export const zMoney = z
  .string()
  .trim()
  .refine((v) => v === "" || (parseDecimalInput(v)?.gte(0) ?? false), "Montant invalide (nombre positif attendu)");
export const zMoneyRequired = z
  .string()
  .trim()
  .min(1, "Montant obligatoire")
  .refine((v) => parseDecimalInput(v)?.gte(0) ?? false, "Montant invalide (nombre positif attendu)");
export const zPositiveMoney = z
  .string()
  .trim()
  .min(1, "Montant obligatoire")
  .refine((v) => parseDecimalInput(v)?.gt(0) ?? false, "Le montant doit être supérieur à 0");
export const zDecimal = z
  .string()
  .trim()
  .refine((v) => v === "" || parseDecimalInput(v) !== null, "Nombre invalide");
export const zPercent = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const d = parseDecimalInput(v);
    return !!d && d.gte(0) && d.lte(100);
  }, "Pourcentage entre 0 et 100");
export const zRate = z
  .string()
  .trim()
  .refine((v) => v === "" || (parseDecimalInput(v)?.gt(0) ?? false), "Taux invalide");

export const zDate = z.string().trim().refine((v) => v === "" || isIsoDate(v), "Date invalide");
export const zDateRequired = z.string().trim().refine((v) => isIsoDate(v), "Date obligatoire");
export const zInt = z.string().trim().refine((v) => v === "" || /^\d{1,7}$/.test(v), "Nombre entier attendu");
export const zEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Email invalide");
export const zUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || isSafeUrl(v), "Lien invalide (adresse complète en https:// attendue)");
export const zUrlRequired = z
  .string()
  .trim()
  .refine((v) => isSafeUrl(v), "Lien invalide (adresse complète en https:// attendue)");

export const zCurrency = z.enum(["EUR", "IDR", "USD"]);
export const zBool = z.boolean();
