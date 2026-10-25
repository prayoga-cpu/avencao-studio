import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Redirection optimiste vers la connexion quand aucun cookie de session n'est présent.
 * Ce n'est PAS un contrôle d'autorisation : chaque page, Server Action et Route Handler
 * revérifie la session et les droits côté serveur.
 * Les routes /api sont exclues : elles répondent 401/403 en JSON au lieu d'une redirection.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/connexion", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|connexion|mot-de-passe|reinitialisation|acces-refuse|_next/static|_next/image|brand|icon.png|favicon.ico|robots.txt).*)",
  ],
};
