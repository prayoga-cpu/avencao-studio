import "server-only";

/** En-têtes CORS des points d'accès publics OAuth/MCP (aucun cookie : jetons uniquement). */
export const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version",
};

export function publicJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status: init.status ?? 200, headers: { ...PUBLIC_CORS, "Cache-Control": "no-store", ...init.headers } });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_CORS });
}

/** Lit un corps de requête OAuth (formulaire ou JSON) en paramètres. */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") params.set(k, v);
    return params;
  }
  return new URLSearchParams(await request.text());
}
