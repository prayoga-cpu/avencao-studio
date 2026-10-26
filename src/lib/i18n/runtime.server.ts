/**
 * Couche serveur (React Server Components) : la langue vient du cookie de la requête.
 * `use()` suspend le composant jusqu'à la lecture du cookie (instantanée) ; mémorisé par requête.
 */
import { cookies } from "next/headers";
import { cache, use } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locales";
import { makeT, type T } from "./translate";

export const requestLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export function useLocale(): Locale {
  return use(requestLocale());
}

export function useT(): T {
  return makeT(useLocale());
}
