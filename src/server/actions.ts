import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ConflictError, DomainError, ForbiddenError, NotFoundError, UnauthenticatedError } from "./errors";
import { getLocale } from "@/lib/i18n/server";
import { translateMessage } from "@/lib/i18n/translate";

import type { ActionResult } from "@/lib/action-result";
export type { ActionResult };

/**
 * Enveloppe commune des Server Actions : traduit les erreurs en messages clairs,
 * sans exposer de détail technique ni de secret au navigateur.
 */
export async function safeAction<T>(handler: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await handler();
    return localize({ ok: true, data, message: successMessage });
  } catch (error) {
    unstable_rethrow(error);
    return localize(toActionError(error));
  }
}

/** Messages (succès, erreurs métier, erreurs de champ) dans la langue de l'utilisateur. */
async function localize<R extends ActionResult<unknown> | ReturnType<typeof toActionError>>(result: R): Promise<R> {
  const locale = await getLocale();
  if (locale === "fr") return result;
  if (result.ok) return { ...result, message: result.message ? translateMessage(locale, result.message) : result.message };
  const fieldErrors = result.fieldErrors
    ? Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k, v?.map((m) => translateMessage(locale, m))]))
    : undefined;
  return { ...result, error: translateMessage(locale, result.error), fieldErrors };
}

export function toActionError(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> } {
  if (error instanceof z.ZodError) {
    const flat = z.flattenError(error);
    const first = flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Formulaire invalide.", fieldErrors: flat.fieldErrors as Record<string, string[] | undefined> };
  }
  if (
    error instanceof DomainError ||
    error instanceof ForbiddenError ||
    error instanceof UnauthenticatedError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return { ok: false, error: error.message };
  }
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return { ok: false, error: "Cette valeur existe déjà (doublon refusé)." };
  if (code === "P2025") return { ok: false, error: "Élément introuvable ou déjà modifié." };
  if (code === "P2003") return { ok: false, error: "Opération impossible : élément lié manquant ou encore utilisé." };
  const message = String((error as Error)?.message ?? "");
  if (/check constraint|violates check/i.test(message)) {
    return { ok: false, error: "Opération refusée par une règle de cohérence (montant ou valeur hors limites)." };
  }
  console.error("[action] erreur inattendue", error);
  return { ok: false, error: "Erreur inattendue : l'opération n'a pas été enregistrée." };
}

/** Lit un FormData en objet simple (les cases à cocher absentes valent undefined). */
export function formToObject(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
