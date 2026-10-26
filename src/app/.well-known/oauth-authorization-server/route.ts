import { connection } from "next/server";
import { authorizationServerMetadata } from "@/server/mcp/oauth";
import { preflight, publicJson } from "@/server/mcp/http";

/** Métadonnées du serveur d'autorisation (RFC 8414) utilisées par Claude pour se connecter. */
export async function GET() {
  await connection();
  return publicJson(authorizationServerMetadata());
}

export const OPTIONS = preflight;
