import "server-only";
/**
 * Actions groupées : chaque élément est traité (et contrôlé) individuellement ; les refus sont
 * regroupés par motif pour un retour lisible (« 7 vidéos : Transition non autorisée… »).
 */
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "./errors";

export interface BulkRefusal {
  message: string;
  /** Références des éléments refusés pour ce motif. */
  refs: string[];
}

/** Regroupe les refus par motif, dans l'ordre de première apparition. */
export function groupRefusals(items: { ref: string; message: string }[]): BulkRefusal[] {
  const groups = new Map<string, string[]>();
  for (const { ref, message } of items) groups.set(message, [...(groups.get(message) ?? []), ref]);
  return [...groups.entries()].map(([message, refs]) => ({ message, refs }));
}

/** Message affichable d'un refus ; une erreur technique n'est jamais exposée telle quelle. */
export function refusalMessage(error: unknown): string {
  if (
    error instanceof DomainError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return error.message;
  }
  console.error("[bulk] erreur inattendue", error);
  return "Erreur inattendue : l'opération n'a pas été enregistrée.";
}
