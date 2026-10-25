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
