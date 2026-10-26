import "server-only";
/**
 * Accès asynchrone à la langue pour le code serveur hors composants : Server Actions,
 * route handlers, generateMetadata, exports CSV.
 */
import { requestLocale } from "./runtime.server";
import { makeT, translateMessage, type T } from "./translate";
import type { Locale } from "./locales";

export async function getLocale(): Promise<Locale> {
  try {
    return await requestLocale();
  } catch {
    // Hors requête (scripts, jobs) : langue de référence.
    return "fr";
  }
}

export async function getT(): Promise<T> {
  return makeT(await getLocale());
}

export async function translateServerMessage(message: string): Promise<string> {
  return translateMessage(await getLocale(), message);
}
