import { connection } from "next/server";
import { protectedResourceMetadata } from "@/server/mcp/oauth";
import { preflight, publicJson } from "@/server/mcp/http";

/** Métadonnées de ressource protégée (RFC 9728) : où obtenir un jeton pour le serveur MCP. */
export async function GET() {
  await connection();
  return publicJson(protectedResourceMetadata());
}

export const OPTIONS = preflight;
