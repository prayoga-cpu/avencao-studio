"use client";

import { useEffect, type ReactNode } from "react";
import { LocaleContext } from "./runtime.client";
import type { Locale } from "./locales";

/** Fournit la langue aux composants client et met à jour <html lang>. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
