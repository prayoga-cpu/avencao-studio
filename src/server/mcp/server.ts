import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool, toolsFor } from "../ai/tools";
import type { McpAuth } from "./oauth";

const BASE = `Avencao CRM: a video-editing agency CRM (clients, sales pipeline, projects, videos, freelance editors, planning, invoices, costs, reports).
Amounts are decimal strings; *_Eur fields are in euros. Dates are YYYY-MM-DD in the agency timezone (call get_context for today's date).
Search tools return ids: use them with the get_* tools. Every record includes a url to open it in the CRM; cite it when relevant.
Results only contain what the connected user may see: if a field says "not available for your role", do not guess it.`;

const READ_ONLY = `${BASE}
All tools are read-only and return JSON. This connection cannot create or change data: the user can allow it on the CRM page /claude (« Lecture + écriture »).`;

const READ_WRITE = `${BASE}
Write access is enabled: you can turn documents the user gives you (PDF invoices, receipts, quotes, purchase orders, briefs, emails) or what they type ("new mission for X: 3 reels at 450 € each, delivery on…") into CRM records.
1. Call get_context, then identify what it is: client invoice → record_client_invoice; money received → record_client_payment; editor invoice → search_costs, then set_cost_amount (existing missions) or record_direct_cost; payment made to an editor → record_supplier_payment; overhead receipt (software, storage, ads…) → record_expense with a category from get_reference_data; signed quote or purchase order → create_sales_order or set_project_price; new job → create_mission; brief, feedback or notes → update_video, add_video_feedback, add_note, log_activity.
2. Find the existing client, project, video or editor with the search tools first. Never create a record that already exists.
3. Before any write, show the user a short table of the values you extracted and the records you will create or change, then wait for their confirmation. Never invent an amount, a date or a VAT rate: ask.
4. When a tool returns possible_duplicates, nothing was saved: show them, and call again with confirm_duplicate=true only if the user confirms it is a different record.
5. After saving, give the CRM links. When the result contains attach.url, offer it so the user can store the original document on the record (Claude Code can upload it directly: curl -T <file> <attach.upload_url>).
Guardrails: invoices are saved as drafts (a person marks them as issued in the CRM), costs are never validated, and nothing is deleted, voided, cancelled or archived through Claude: those actions stay in the CRM.`;

/**
 * Serveur MCP d'un utilisateur : les outils de son rôle ; les outils d'écriture seulement si
 * la connexion a reçu la portée crm:write (indications `readOnlyHint` / `destructiveHint` pour
 * que Claude demande l'accord de l'utilisateur avant chaque écriture).
 */
export function buildMcpServer(auth: Pick<McpAuth, "actor" | "tokenId" | "write">): McpServer {
  const server = new McpServer({ name: "avencao-crm", title: "Avencao CRM", version: "1.1.0" }, { instructions: auth.write ? READ_WRITE : READ_ONLY });
  for (const tool of toolsFor(auth.actor, { write: auth.write })) {
    const write = tool.kind === "write";
    server.registerTool(
      tool.name,
      {
        title: tool.label,
        description: tool.about,
        inputSchema: tool.input,
        annotations: { readOnlyHint: !write, destructiveHint: write && tool.destructive, idempotentHint: !write, openWorldHint: false },
      },
      async (args: unknown) => {
        const outcome = await runTool(auth.actor, tool.name, args, { write: auth.write, tokenId: auth.tokenId });
        return { content: [{ type: "text" as const, text: outcome.text }], isError: !outcome.ok };
      },
    );
  }
  return server;
}
