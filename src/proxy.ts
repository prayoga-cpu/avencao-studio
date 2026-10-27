import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Redirection optimiste vers la connexion quand aucun cookie de session n'est présent.
 * Ce n'est PAS un contrôle d'autorisation : chaque page, Server Action et Route Handler
 * revérifie la session et les droits côté serveur.
 * Les routes /api sont exclues : elles répondent 401/403 en JSON au lieu d'une redirection.
 * /depot/… est public : le lien de dépôt remis par Claude est lui-même le justificatif.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/connexion", request.url);
    const { pathname, search } = request.nextUrl;
    // Retour à la page demandée après connexion (ex. autorisation d'une application Claude).
    if (pathname !== "/" && pathname !== "/dashboard") url.searchParams.set("suite", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|\\.well-known/|connexion|mot-de-passe|reinitialisation|acces-refuse|depot/|_next/static|_next/image|brand|icon.png|favicon.ico|robots.txt).*)",
  ],
};
