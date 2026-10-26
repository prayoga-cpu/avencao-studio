/**
 * Chemin de retour après connexion (`?suite=`) : uniquement un chemin relatif de l'application,
 * jamais une URL externe (évite les redirections ouvertes).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || typeof value !== "string" || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\r\n\t]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://interne.invalid");
    if (url.origin !== "http://interne.invalid") return fallback;
    if (url.pathname === "/connexion" || url.pathname.startsWith("/api/")) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
