import { revokeToken } from "@/server/mcp/oauth";
import { preflight, readForm } from "@/server/mcp/http";

/** Révocation d'un jeton (RFC 7009) : réponse 200 dans tous les cas. */
export async function POST(request: Request) {
  const form = await readForm(request);
  await revokeToken(form.get("token")).catch((error) => console.error("[oauth] révocation", error));
  return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}

export const OPTIONS = preflight;
