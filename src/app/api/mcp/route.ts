import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/server/mcp/server";
import { authenticateBearer, protectedResourceMetadataUrl } from "@/server/mcp/oauth";

/**
 * Serveur MCP du CRM (transport « Streamable HTTP », sans état : un serveur par requête).
 * Authentification : jeton OAuth délivré à une application Claude ou jeton personnel.
 * Sans jeton valide : 401 + adresse des métadonnées OAuth (découverte automatique par Claude).
 */
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function unauthorized(hadToken: boolean): Response {
  const params = [`resource_metadata="${protectedResourceMetadataUrl()}"`, `scope="crm:read"`];
  if (hadToken) params.unshift(`error="invalid_token"`, `error_description="Token missing, expired or revoked"`);
  return withCors(
    Response.json(
      { error: hadToken ? "invalid_token" : "unauthorized", error_description: "Connect Claude to Avencao CRM (OAuth) or send a personal token." },
      { status: 401, headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` } },
    ),
  );
}

async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization");
  const auth = await authenticateBearer(header);
  if (!auth) return unauthorized(!!header);
  // Mode sans état : pas de flux SSE ouvert en GET ni de session à fermer.
  if (request.method !== "POST") {
    return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { status: 405, headers: { Allow: "POST" } }));
  }
  const server = buildMcpServer(auth.actor);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } finally {
    await server.close().catch(() => undefined);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
