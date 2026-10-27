import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Après une mutation, invalide les vues concernées. Aucune donnée privée n'étant en
 * cache partagé, il s'agit d'invalider le cache du routeur côté navigateur (App Shells
 * préchargés par session). Pour les données financières, toute l'application est
 * rafraîchie afin que dashboard, finances, rapports et fiches restent cohérents.
 */
export function revalidateApp(): void {
  revalidatePath("/", "layout");
}

/**
 * Pour les écritures hors Server Action (Claude via MCP, dépôt par lien) : l'écriture est déjà
 * faite, un échec d'invalidation (hors contexte de requête Next, ex. tests) ne doit pas l'annuler.
 */
export function revalidateAppQuietly(): void {
  try {
    revalidateApp();
  } catch {
    // Hors requête Next : rien à invalider.
  }
}
