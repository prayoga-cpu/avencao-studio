"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "./locales";

/** Change la langue de l'interface (cookie d'un an, propre au navigateur). */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}
