import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n/provider";
import { requestLocale } from "@/lib/i18n/runtime.server";

/** Lit la langue (cookie) côté serveur et la transmet aux composants client. */
export async function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = await requestLocale();
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
}
