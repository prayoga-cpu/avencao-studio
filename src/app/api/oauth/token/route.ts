import { OAuthError, exchangeToken } from "@/server/mcp/oauth";
import { preflight, publicJson, readForm } from "@/server/mcp/http";

/** Point d'accès des jetons OAuth (code d'autorisation + PKCE, rafraîchissement à rotation). */
export async function POST(request: Request) {
  try {
    const form = await readForm(request);
    return publicJson(await exchangeToken(form, request.headers.get("authorization")), { headers: { Pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof OAuthError) {
      const headers: Record<string, string> = error.status === 401 ? { "WWW-Authenticate": 'Basic realm="avencao"' } : {};
      return publicJson({ error: error.code, error_description: error.description }, { status: error.status, headers });
    }
    console.error("[oauth] jeton", error);
    return publicJson({ error: "server_error" }, { status: 500 });
  }
}

export const OPTIONS = preflight;
