import { OAuthError, registerClient } from "@/server/mcp/oauth";
import { preflight, publicJson } from "@/server/mcp/http";

/** Enregistrement dynamique d'une application Claude (RFC 7591). */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
    return publicJson({ error: "invalid_client_metadata", error_description: "Body too large." }, { status: 413 });
  }
  try {
    const body = await request.json().catch(() => null);
    return publicJson(await registerClient(body), { status: 201 });
  } catch (error) {
    if (error instanceof OAuthError) return publicJson({ error: error.code, error_description: error.description }, { status: error.status });
    console.error("[oauth] enregistrement", error);
    return publicJson({ error: "server_error" }, { status: 500 });
  }
}

export const OPTIONS = preflight;
