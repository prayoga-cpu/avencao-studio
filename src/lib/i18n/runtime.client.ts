/**
 * Couche client : la langue est fournie par <LocaleProvider> (valeur lue côté serveur).
 */
import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { makeT, type T } from "./translate";

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): T {
  return makeT(useLocale());
}
