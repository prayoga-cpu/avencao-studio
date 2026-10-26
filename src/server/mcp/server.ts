import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool, toolsFor } from "../ai/tools";
import type { Actor } from "../policies";

const INSTRUCTIONS = `Avencao CRM: a video-editing agency CRM (clients, sales pipeline, projects, videos, freelance editors, planning, invoices, reports).
All tools are read-only and return JSON. Amounts are decimal strings; *_Eur fields are in euros. Dates are YYYY-MM-DD in the agency timezone (call get_context for today's date).
Search tools return ids: use them with the get_* tools. Every record includes a url to open it in the CRM; cite it when relevant.
Results only contain what the connected user may see: if a field says "not available for your role", do not guess it.`;

/** Serveur MCP d'un utilisateur : uniquement les outils autorisés pour son rôle (lecture seule). */
export function buildMcpServer(actor: Actor): McpServer {
  const server = new McpServer({ name: "avencao-crm", title: "Avencao CRM", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  for (const tool of toolsFor(actor)) {
    server.registerTool(
      tool.name,
      {
        title: tool.label,
        description: tool.about,
        inputSchema: tool.input,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args: unknown) => {
        const outcome = await runTool(actor, tool.name, args);
        return { content: [{ type: "text" as const, text: outcome.text }], isError: !outcome.ok };
      },
    );
  }
  return server;
}
