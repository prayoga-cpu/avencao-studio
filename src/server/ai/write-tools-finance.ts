import "server-only";
/**
 * Outils d'écriture « finances » de Claude : une facture, un justificatif, une facture de monteur
 * ou un devis signé (PDF lu par Claude, ou détails tapés dans la conversation) deviennent un
 * élément du CRM. Garde-fous en plus de ceux des services :
 * - facture toujours en BROUILLON (l'émission reste un clic humain, numéro et dates repris) ;
 * - coût direct au plus ENGAGÉ (la validation reste humaine), coût validé jamais corrigé ;
 * - doublons probables signalés sans rien enregistrer, sauf confirmation explicite.
 */
import { z } from "zod";
import { PAYMENT_METHODS, type InvoiceInput } from "@/features/finance/schemas";
import type { AttachmentOwner } from "@/generated/prisma/enums";
import { parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { Decimal, dec, parseDecimalInput, sum } from "@/lib/money";
import { prisma } from "../db";
import { createUploadTicket } from "../mcp/uploads";
import type { Actor } from "../policies";
import { setCostAmount } from "../services/assignments";
import { createInvoice, recordClientPayment, recordSupplierPayment, updateDraftInvoice } from "../services/billing";
import { agencyToday } from "../services/common";
import { createDirectCost, createExpense } from "../services/costs";
import { createSalesOrder, setProjectPrice } from "../services/sales";
import {
  ToolError, amount, confirmDuplicate, currency, duplicatesFound, id, isoDate, manualFxRate, optionalAmount, optionalId, possible, ref,
  requiredDate, text, v, writeTool, type CrmTool, type PossibleDuplicate, type WriteResult,
} from "./tool-kit";

const DRAFT_INVOICE_NEXT = [
  "Saved as a DRAFT invoice: it is not counted in revenue or receivables yet.",
  "Tell the user to open it in the CRM and click « Marquer émise » (number and dates are pre-filled) once it matches the document.",
  "Offer attach.url so the user can drop the original PDF on the invoice.",
].join(" ");
const ATTACH_NEXT = "Offer attach.url so the user can drop the original document (PDF or image) on this record; Claude Code can upload it with: curl -T <file> <attach.upload_url>.";
const COST_NEXT = "Recorded as not validated: a person validates costs in the CRM before they can be paid. " + ATTACH_NEXT;

const num = (value: string | number | undefined | null): Decimal | null => (value === undefined || value === null ? null : parseDecimalInput(String(value)));
/** Montant affiché dans un libellé (« 59,99 » → « 59.99 ») ; tel quel s'il n'est pas lisible. */
const shown = (value: string | number | undefined) => num(value)?.toFixed(2) ?? v(value);
/** Montant Prisma ou décimal : seul l'affichage arrondi est utilisé. */
type Fixed = { toFixed(dp: number): string };

/** Lien de dépôt de la pièce d'origine ; l'élément est déjà enregistré, le lien reste facultatif. */
async function attachTo(actor: Actor, type: AttachmentOwner, recordId: string, label: string) {
  try {
    return await createUploadTicket(actor, { type, id: recordId, label });
  } catch {
    return undefined;
  }
}

async function clientName(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
  if (!client) throw new ToolError("Client not found: use search_clients to get its id, or create it first with create_client.");
  return client.displayName;
}

// ───────────────────────────── Factures clients ─────────────────────────────

const invoiceLine = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: optionalAmount("Quantity (default 1)"),
  unit_price: amount("Unit price excluding VAT, as printed"),
  vat_rate: amount("VAT rate in %, e.g. 20; 0 when the invoice has no VAT"),
  deducts_invoice_id: optionalId("FINAL invoice only: id of the DEPOSIT invoice this line deducts (unit price = deducted amount excl. VAT, positive)"),
});
type InvoiceLineArg = z.infer<typeof invoiceLine>;

const invoiceLines = (lines: InvoiceLineArg[]) =>
  lines.map((l) => ({
    description: l.description,
    quantity: v(l.quantity) || "1",
    unitPrice: v(l.unit_price),
    vatRate: v(l.vat_rate),
    salesOrderLineId: "",
    deductsInvoiceId: v(l.deducts_invoice_id),
  }));

const invoiceNet = (lines: InvoiceLineArg[]) =>
  sum(lines.map((l) => (num(l.quantity) ?? new Decimal(1)).times(num(l.unit_price) ?? 0))).toDecimalPlaces(2);

async function invoiceDuplicates(clientId: string, input: { number?: string; external_ref?: string; issue_date?: string; lines: InvoiceLineArg[] }, excludeId?: string) {
  const found: PossibleDuplicate[] = [];
  const not = excludeId ? { id: { not: excludeId } } : {};
  const label = (i: { number: string | null; client: { displayName: string } }) => `${i.number ?? "—"} · ${i.client.displayName}`;
  const select = { id: true, number: true, client: { select: { displayName: true } } } as const;
  if (input.number) {
    const same = await prisma.invoice.findFirst({ where: { ...not, number: { equals: input.number, mode: "insensitive" } }, select });
    if (same) found.push(possible("INVOICE", same.id, label(same), "same invoice number"));
  }
  if (input.external_ref) {
    const same = await prisma.invoice.findFirst({ where: { ...not, clientId, externalRef: { equals: input.external_ref, mode: "insensitive" } }, select });
    if (same && !found.some((f) => f.id === same.id)) found.push(possible("INVOICE", same.id, label(same), "same external reference"));
  }
  if (!input.number && input.issue_date) {
    const sameDay = await prisma.invoice.findMany({ where: { ...not, clientId, issueDate: parseDateOnly(input.issue_date), status: { not: "CANCELLED" } }, select: { ...select, totalNet: true } });
    const net = invoiceNet(input.lines);
    for (const i of sameDay) if (dec(i.totalNet).eq(net)) found.push(possible("INVOICE", i.id, label(i), "same client, issue date and net total"));
  }
  return found;
}

const recordClientInvoiceTool = writeTool({
  name: "record_client_invoice",
  label: "Facture client",
  about:
    "Record an invoice issued to a client (the CRM does not generate invoices: they come from the agency's billing tool, PDF included). Always saved as a DRAFT with its number and dates: a person marks it as issued in the CRM. Use search_clients first (create_client if the client is new), and search_invoices to avoid duplicates. Amounts excl. VAT per line with the VAT rate. Returns the draft and an upload link for the PDF.",
  anyOf: ["invoices.write"],
  input: z.object({
    client_id: id("Client"),
    number: text(60, "Invoice number printed on the document"),
    external_ref: text(120, "Reference in the billing tool, if different from the number"),
    kind: z.enum(["STANDARD", "DEPOSIT", "FINAL"]).optional().describe("STANDARD (default), DEPOSIT (down payment) or FINAL (balance invoice that deducts deposits)"),
    issue_date: isoDate("Issue date printed on the invoice (YYYY-MM-DD)"),
    due_date: isoDate("Due date (YYYY-MM-DD); empty = the client's payment terms"),
    currency,
    manual_fx_rate: manualFxRate,
    project_id: optionalId("Project invoiced (must belong to the client)"),
    sales_order_id: optionalId("Sales order invoiced (must belong to the client)"),
    notes: text(2000, "Internal notes"),
    lines: z.array(invoiceLine).min(1).max(100),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const client = await clientName(input.client_id);
    if (!input.confirm_duplicate) {
      const found = await invoiceDuplicates(input.client_id, input);
      if (found.length) return duplicatesFound(found);
    }
    const data: InvoiceInput = {
      clientId: input.client_id,
      projectId: v(input.project_id),
      salesOrderId: v(input.sales_order_id),
      kind: input.kind ?? "STANDARD",
      status: "DRAFT",
      number: v(input.number),
      externalRef: v(input.external_ref),
      issueDate: v(input.issue_date),
      dueDate: v(input.due_date),
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      notes: v(input.notes),
      lines: invoiceLines(input.lines),
    };
    const { id: invoiceId } = await createInvoice(actor, data);
    const label = `${input.number || "—"} · ${client}`;
    return { done: "created", records: [ref("INVOICE", invoiceId, label, input.number ?? null)], attach: await attachTo(actor, "INVOICE", invoiceId, label), next: DRAFT_INVOICE_NEXT };
  },
});

const updateDraftInvoiceTool = writeTool({
  name: "update_draft_invoice",
  label: "Brouillon de facture",
  about: "Change a DRAFT invoice (issued invoices are only corrected by a credit note, in the CRM). Only the fields given are changed; lines, when given, replace all existing lines.",
  anyOf: ["invoices.write"],
  destructive: true,
  input: z.object({
    invoice_id: id("Invoice"),
    number: text(60, "Invoice number"),
    external_ref: text(120, "Reference in the billing tool"),
    kind: z.enum(["STANDARD", "DEPOSIT", "FINAL"]).optional(),
    issue_date: isoDate("Issue date (YYYY-MM-DD)"),
    due_date: isoDate("Due date (YYYY-MM-DD)"),
    currency,
    manual_fx_rate: manualFxRate,
    project_id: optionalId("Project (same client)"),
    sales_order_id: optionalId("Sales order (same client)"),
    notes: text(2000, "Internal notes"),
    lines: z.array(invoiceLine).min(1).max(100).optional().describe("All lines of the invoice (replaces the current lines)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const current = await prisma.invoice.findUnique({ where: { id: input.invoice_id }, include: { lines: { orderBy: { position: "asc" } }, client: { select: { displayName: true } } } });
    if (!current) throw new ToolError("Invoice not found: use search_invoices to get its id.");
    if (current.status !== "DRAFT") throw new ToolError("Only a DRAFT invoice can be changed. An issued invoice is corrected with a credit note, by a person in the CRM.");
    const date = (value: Date | null) => (value ? toDateOnlyString(value) : "");
    if (input.number && input.number !== current.number) {
      const taken = await prisma.invoice.findFirst({ where: { id: { not: current.id }, number: { equals: input.number, mode: "insensitive" } }, select: { id: true } });
      if (taken) throw new ToolError(`Invoice number ${input.number} is already used by another invoice.`);
    }
    await updateDraftInvoice(actor, current.id, {
      clientId: current.clientId,
      projectId: input.project_id ?? current.projectId ?? "",
      salesOrderId: input.sales_order_id ?? current.salesOrderId ?? "",
      kind: input.kind ?? current.kind,
      status: "DRAFT",
      number: input.number ?? current.number ?? "",
      externalRef: input.external_ref ?? current.externalRef ?? "",
      issueDate: input.issue_date ?? date(current.issueDate),
      dueDate: input.due_date ?? date(current.dueDate),
      currency: input.currency ?? current.currency,
      manualFxRate: v(input.manual_fx_rate) || (current.fxSource === "MANUAL" ? current.fxUnitsPerEur.toString() : ""),
      notes: input.notes ?? current.notes ?? "",
      lines: input.lines
        ? invoiceLines(input.lines)
        : current.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.abs().toFixed(2),
            vatRate: l.vatRate.toString(),
            salesOrderLineId: l.salesOrderLineId ?? "",
            deductsInvoiceId: l.deductsInvoiceId ?? "",
          })),
    });
    const number = input.number ?? current.number;
    return { done: "updated", records: [ref("INVOICE", current.id, `${number ?? "—"} · ${current.client.displayName}`, number)], next: DRAFT_INVOICE_NEXT };
  },
});

// ───────────────────────────── Encaissements ─────────────────────────────

const recordClientPaymentTool = writeTool({
  name: "record_client_payment",
  label: "Encaissement client",
  about:
    "Record money received from a client (bank statement, transfer notice, remittance advice), optionally allocated to its ISSUED invoices in the same currency. Amount = what was received, VAT included. Check open invoices with get_receivables or search_invoices first.",
  anyOf: ["payments.write"],
  input: z.object({
    client_id: id("Client"),
    received_on: requiredDate("Date the money was received (YYYY-MM-DD)"),
    amount: amount("Amount received, VAT included"),
    currency,
    manual_fx_rate: manualFxRate,
    fees: optionalAmount("Bank or platform fees deducted, if any"),
    method: z.enum(PAYMENT_METHODS).optional().describe("Default BANK_TRANSFER"),
    reference: text(120, "Bank or transfer reference"),
    notes: text(500, "Internal notes"),
    allocations: z
      .array(z.object({ invoice_id: id("Invoice"), amount: amount("Amount applied to this invoice") }))
      .max(50)
      .optional()
      .describe("Invoices paid by this payment (ISSUED, same client and currency)"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const client = await clientName(input.client_id);
    if (!input.confirm_duplicate) {
      const received = num(input.amount);
      const sameDay = await prisma.clientPayment.findMany({
        where: { clientId: input.client_id, receivedOn: parseDateOnly(input.received_on), status: "RECORDED" },
        select: { id: true, amount: true, currency: true, reference: true },
      });
      const found = sameDay
        .filter((p) => (received && dec(p.amount).eq(received)) || (input.reference && p.reference?.toLowerCase() === input.reference.toLowerCase()))
        .map((p) => possible("CLIENT_PAYMENT", p.id, `${p.amount.toFixed(2)} ${p.currency} · ${client}`, "same client, date and amount or reference"));
      if (found.length) return duplicatesFound(found);
    }
    const { id: paymentId } = await recordClientPayment(actor, {
      clientId: input.client_id,
      receivedOn: input.received_on,
      amount: v(input.amount),
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      fees: v(input.fees),
      method: input.method ?? "BANK_TRANSFER",
      reference: v(input.reference),
      notes: v(input.notes),
      allocations: (input.allocations ?? []).map((a) => ({ invoiceId: a.invoice_id, amount: v(a.amount) })),
    });
    const label = `${shown(input.amount)} ${input.currency ?? "EUR"} · ${client}`;
    return { done: "created", records: [ref("CLIENT_PAYMENT", paymentId, label, input.reference ?? null)], attach: await attachTo(actor, "CLIENT_PAYMENT", paymentId, label), next: ATTACH_NEXT };
  },
});

// ───────────────────────────── Ventes ─────────────────────────────

const createSalesOrderTool = writeTool({
  name: "create_sales_order",
  label: "Vente acceptée",
  about:
    "Record a signed quote or purchase order as an accepted sale (counted in signed sales). With project_id, each line's revenue is spread equally over the project's videos, including videos added later. For a simple project price prefer set_project_price; for a brand-new job (project + videos + price) prefer create_mission.",
  anyOf: ["sales.write"],
  input: z.object({
    client_id: id("Client"),
    title: z.string().trim().min(1).max(200).describe("Short title, e.g. the quote number and subject"),
    accepted_on: requiredDate("Date the quote/order was accepted or signed (YYYY-MM-DD)"),
    currency,
    manual_fx_rate: manualFxRate,
    project_id: optionalId("Project of the sale (same client)"),
    opportunity_id: optionalId("Pipeline opportunity won by this sale"),
    notes: text(2000, "Internal notes"),
    lines: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(300),
          quantity: optionalAmount("Quantity (default 1)"),
          unit_price: amount("Unit price excluding VAT"),
          discount: optionalAmount("Discount amount on the line, excluding VAT"),
          video_type: z.enum(["REEL", "SHORT", "YOUTUBE", "VLOG", "PODCAST", "VSL", "AD", "INTRO", "MOTION_DESIGN", "OTHER"]).optional(),
          catalog_item_id: optionalId("Service catalog item (get_reference_data)"),
          included_revisions: z.number().int().min(0).max(20).optional(),
        }),
      )
      .min(1)
      .max(50),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const client = await clientName(input.client_id);
    if (!input.confirm_duplicate) {
      const acceptedOn = parseDateOnly(input.accepted_on);
      const candidates = await prisma.salesOrder.findMany({
        where: { clientId: input.client_id, status: "ACCEPTED", OR: [{ acceptedOn }, ...(input.project_id ? [{ projectId: input.project_id }] : [])] },
        select: { id: true, reference: true, title: true, projectId: true, acceptedOn: true },
      });
      const title = input.title.trim().toLowerCase();
      const found = candidates
        .filter((o) => (input.project_id && o.projectId === input.project_id) || (o.acceptedOn.getTime() === acceptedOn.getTime() && o.title.trim().toLowerCase() === title))
        .map((o) => possible("SALES_ORDER", o.id, `${o.reference} · ${o.title}`, o.projectId === input.project_id ? "the project already has an accepted sale" : "same client, date and title"));
      if (found.length) return duplicatesFound(found);
    }
    const auto = !!input.project_id;
    const { id: orderId, reference } = await createSalesOrder(actor, {
      clientId: input.client_id,
      projectId: v(input.project_id),
      opportunityId: v(input.opportunity_id),
      title: input.title,
      acceptedOn: input.accepted_on,
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      notes: v(input.notes),
      lines: input.lines.map((l) => ({
        description: l.description,
        videoType: l.video_type ?? "",
        catalogItemId: v(l.catalog_item_id),
        quantity: v(l.quantity) || "1",
        unitPrice: v(l.unit_price),
        discount: v(l.discount),
        includedRevisions: v(l.included_revisions),
        allocationMethod: auto ? "EQUAL" : "NONE",
        allocations: [],
        autoAllocate: auto,
      })),
    });
    return { done: "created", records: [ref("SALES_ORDER", orderId, `${reference} · ${input.title} · ${client}`, reference)] };
  },
});

const setProjectPriceTool = writeTool({
  name: "set_project_price",
  label: "Prix du projet",
  about:
    "Set the client price of an existing project, recorded as an accepted sale: FLAT = one global amount spread over the project's videos; PER_VIDEO = unit price × the project's current active videos. Refused as a possible duplicate when the project already has an accepted sale.",
  anyOf: ["sales.write"],
  input: z.object({
    project_id: id("Project"),
    mode: z.enum(["FLAT", "PER_VIDEO"]),
    amount: amount("FLAT: total excl. VAT; PER_VIDEO: price per video excl. VAT"),
    accepted_on: isoDate("Date the price was agreed (YYYY-MM-DD, default today)"),
    currency,
    manual_fx_rate: manualFxRate,
    title: text(200, "Title of the sale (default: the project title)"),
    included_revisions: z.number().int().min(0).max(20).optional(),
    notes: text(2000, "Internal notes"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const project = await prisma.project.findUnique({ where: { id: input.project_id }, select: { id: true, title: true, reference: true } });
    if (!project) throw new ToolError("Project not found: use search_projects to get its id.");
    if (!input.confirm_duplicate) {
      const existing = await prisma.salesOrder.findMany({ where: { projectId: project.id, status: "ACCEPTED" }, select: { id: true, reference: true, title: true } });
      if (existing.length) return duplicatesFound(existing.map((o) => possible("SALES_ORDER", o.id, `${o.reference} · ${o.title}`, "the project already has an accepted sale")));
    }
    const { id: orderId, reference } = await setProjectPrice(actor, {
      projectId: project.id,
      mode: input.mode,
      amount: v(input.amount),
      acceptedOn: input.accepted_on ?? (await agencyToday()),
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      title: input.title || project.title,
      includedRevisions: v(input.included_revisions),
      notes: v(input.notes),
    });
    return { done: "created", records: [ref("SALES_ORDER", orderId, `${reference} · ${project.reference} ${project.title}`, reference), ref("PROJECT", project.id, `${project.reference} · ${project.title}`, project.reference)] };
  },
});

// ───────────────────────────── Coûts et règlements des monteurs ─────────────────────────────

async function costDuplicates(input: { document_ref?: string; editor_id?: string; supplier_name?: string; incurred_on: string; amount?: string | number }) {
  const select = { id: true, label: true, documentRef: true, amount: true, currency: true } as const;
  const label = (c: { label: string; amount: Fixed | null; currency: string }) => `${c.label} · ${c.amount?.toFixed(2) ?? "?"} ${c.currency}`;
  if (input.document_ref) {
    const same = await prisma.directCost.findMany({ where: { documentRef: { equals: input.document_ref, mode: "insensitive" }, stage: { not: "CANCELLED" } }, select });
    if (same.length) return same.map((c) => possible("DIRECT_COST", c.id, label(c), "same supplier document number"));
  }
  const value = num(input.amount);
  if (!value || (!input.editor_id && !input.supplier_name)) return [];
  const sameDay = await prisma.directCost.findMany({
    where: {
      incurredOn: parseDateOnly(input.incurred_on),
      stage: { not: "CANCELLED" },
      ...(input.editor_id ? { editorId: input.editor_id } : { supplierName: { equals: input.supplier_name, mode: "insensitive" } }),
    },
    select,
  });
  return sameDay.filter((c) => c.amount && dec(c.amount).eq(value)).map((c) => possible("DIRECT_COST", c.id, label(c), "same supplier, date and amount"));
}

const recordDirectCostTool = writeTool({
  name: "record_direct_cost",
  label: "Coût direct",
  about:
    "Record a production cost tied to a project or video (purchase such as music or stock footage, additional editor work, or an editor's monthly envelope). Not for an editor's regular missions: those costs already exist (find them with search_costs and fill a missing amount with set_cost_amount). Never validated here: stage ESTIMATED or COMMITTED. General overheads go to record_expense.",
  anyOf: ["costs.write"],
  input: z.object({
    kind: z.enum(["PURCHASE", "ADDITIONAL", "ENVELOPE"]).optional().describe("PURCHASE (default), ADDITIONAL (extra work) or ENVELOPE (monthly editor envelope, needs editor_id and period_month, no project)"),
    label: z.string().trim().min(1).max(200),
    editor_id: optionalId("Editor concerned (ADDITIONAL, ENVELOPE)"),
    supplier_name: text(120, "Supplier name (purchases)"),
    project_id: optionalId("Project (a project-level purchase is split equally over its videos)"),
    video_id: optionalId("Video"),
    amount: optionalAmount("Amount excluding recoverable VAT; empty = « to fill in »"),
    currency,
    manual_fx_rate: manualFxRate,
    incurred_on: requiredDate("Date of the document or commitment (YYYY-MM-DD)"),
    stage: z.enum(["ESTIMATED", "COMMITTED"]).optional().describe("Default COMMITTED (validation is done by a person in the CRM)"),
    period_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("ENVELOPE: month covered (YYYY-MM)"),
    non_recoverable_vat: optionalAmount("Non-recoverable VAT included in the cost, if any"),
    document_ref: text(120, "Supplier or editor invoice number"),
    notes: text(500, "Internal notes"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.confirm_duplicate) {
      const found = await costDuplicates(input);
      if (found.length) return duplicatesFound(found);
    }
    const { id: costId } = await createDirectCost(actor, {
      kind: input.kind ?? "PURCHASE",
      label: input.label,
      editorId: v(input.editor_id),
      supplierName: v(input.supplier_name),
      projectId: v(input.project_id),
      videoId: v(input.video_id),
      amount: v(input.amount),
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      incurredOn: input.incurred_on,
      stage: input.stage ?? "COMMITTED",
      periodMonth: v(input.period_month),
      nonRecoverableVat: v(input.non_recoverable_vat),
      notes: v(input.notes),
      documentRef: v(input.document_ref),
    });
    const label = `${input.label}${input.amount !== undefined ? ` · ${shown(input.amount)} ${input.currency ?? "EUR"}` : ""}`;
    return { done: "created", records: [ref("DIRECT_COST", costId, label, input.document_ref ?? null)], attach: await attachTo(actor, "DIRECT_COST", costId, label), next: COST_NEXT };
  },
});

const setCostAmountTool = writeTool({
  name: "set_cost_amount",
  label: "Montant d'un coût",
  about:
    "Fill in the amount of an existing cost « to fill in » (typically an editor's mission, from the editor's invoice), or correct a cost that is not validated nor paid. Records the editor's invoice number for duplicate detection. A validated cost is corrected by a person in the CRM.",
  anyOf: ["costs.write"],
  destructive: true,
  input: z.object({
    cost_id: id("Cost"),
    amount: amount("Amount in the cost's own currency"),
    manual_fx_rate: manualFxRate,
    document_ref: text(120, "Editor or supplier invoice number"),
    reason: text(300, "Why the amount changes (when correcting an existing amount)"),
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const cost = await prisma.directCost.findUnique({ where: { id: input.cost_id }, select: { id: true, label: true, stage: true, currency: true } });
    if (!cost) throw new ToolError("Cost not found: use search_costs to get its id.");
    if (cost.stage === "VALIDATED") throw new ToolError("This cost is already validated: only a person can correct it in the CRM.");
    await setCostAmount(actor, { costId: cost.id, amount: v(input.amount), manualFxRate: v(input.manual_fx_rate), reason: v(input.reason), documentRef: input.document_ref });
    const label = `${cost.label} · ${shown(input.amount)} ${cost.currency}`;
    return { done: "updated", records: [ref("DIRECT_COST", cost.id, label, input.document_ref ?? null)], attach: await attachTo(actor, "DIRECT_COST", cost.id, label), next: COST_NEXT };
  },
});

const recordSupplierPaymentTool = writeTool({
  name: "record_supplier_payment",
  label: "Règlement monteur",
  about:
    "Record a payment made to an editor (transfer receipt, Wise/PayPal confirmation), allocated to that editor's VALIDATED costs in the same currency (find them with search_costs stage=VALIDATED; their remaining amount must cover the allocation). Costs not validated yet cannot be paid: ask a person to validate them in the CRM.",
  anyOf: ["supplierPayments.write"],
  input: z.object({
    editor_id: id("Editor"),
    paid_on: requiredDate("Payment date (YYYY-MM-DD)"),
    currency,
    manual_fx_rate: manualFxRate,
    fees: optionalAmount("Transfer fees paid by the agency, if any"),
    method: z.enum(PAYMENT_METHODS).optional().describe("Default BANK_TRANSFER"),
    reference: text(120, "Transfer reference"),
    notes: text(500, "Internal notes"),
    allocations: z.array(z.object({ direct_cost_id: id("Cost"), amount: amount("Amount paid for this cost") })).min(1).max(100),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    const editor = await prisma.editorProfile.findUnique({ where: { id: input.editor_id }, select: { id: true, displayName: true } });
    if (!editor) throw new ToolError("Editor not found: use list_editors to get the id.");
    const total = sum(input.allocations.map((a) => num(a.amount) ?? new Decimal(0))).toDecimalPlaces(2);
    if (!input.confirm_duplicate) {
      const sameDay = await prisma.supplierPayment.findMany({ where: { editorId: editor.id, paidOn: parseDateOnly(input.paid_on), status: "RECORDED" }, select: { id: true, amount: true, currency: true } });
      const found = sameDay.filter((p) => dec(p.amount).eq(total)).map((p) => possible("SUPPLIER_PAYMENT", p.id, `${p.amount.toFixed(2)} ${p.currency} · ${editor.displayName}`, "same editor, date and amount"));
      if (found.length) return duplicatesFound(found);
    }
    const { id: paymentId } = await recordSupplierPayment(actor, {
      editorId: editor.id,
      paidOn: input.paid_on,
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      fees: v(input.fees),
      method: input.method ?? "BANK_TRANSFER",
      reference: v(input.reference),
      notes: v(input.notes),
      allocations: input.allocations.map((a) => ({ directCostId: a.direct_cost_id, amount: v(a.amount) })),
    });
    const label = `${total.toFixed(2)} ${input.currency ?? "EUR"} · ${editor.displayName}`;
    return { done: "created", records: [ref("SUPPLIER_PAYMENT", paymentId, label, input.reference ?? null)], attach: await attachTo(actor, "SUPPLIER_PAYMENT", paymentId, label), next: ATTACH_NEXT };
  },
});

// ───────────────────────────── Charges de structure ─────────────────────────────

const recordExpenseTool = writeTool({
  name: "record_expense",
  label: "Charge de structure",
  about:
    "Record an overhead expense from a receipt or supplier invoice not tied to a production (software subscription, storage, music subscription, ads, bank fees, accounting…). category_id comes from get_reference_data. Amount excluding VAT plus the VAT amount. A cost for a specific project or video goes to record_direct_cost instead.",
  anyOf: ["expenses.write"],
  input: z.object({
    category_id: id("Expense category"),
    label: z.string().trim().min(1).max(200).describe("What was bought, e.g. « Adobe Creative Cloud — octobre »"),
    supplier: text(120, "Supplier name"),
    expense_date: requiredDate("Date of the receipt or invoice (YYYY-MM-DD)"),
    period_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Month the expense belongs to (YYYY-MM, default: month of expense_date)"),
    amount_net: amount("Amount excluding VAT"),
    vat_amount: optionalAmount("VAT amount (0 if none)"),
    vat_recoverable: z.boolean().optional().describe("Default true; false when the agency cannot recover this VAT"),
    currency,
    manual_fx_rate: manualFxRate,
    recurrence: z.enum(["NONE", "MONTHLY", "QUARTERLY", "YEARLY"]).optional().describe("Default NONE"),
    is_paid: z.boolean().optional().describe("Default true for a receipt (already paid)"),
    paid_on: isoDate("Payment date (default: expense_date when paid)"),
    document_ref: text(120, "Receipt or invoice number"),
    notes: text(500, "Internal notes"),
    confirm_duplicate: confirmDuplicate,
  }),
  run: async (actor, input): Promise<WriteResult> => {
    if (!input.confirm_duplicate) {
      const select = { id: true, label: true, amountNet: true, currency: true } as const;
      const label = (e: { label: string; amountNet: Fixed; currency: string }) => `${e.label} · ${e.amountNet.toFixed(2)} ${e.currency}`;
      let found: PossibleDuplicate[] = [];
      if (input.document_ref) {
        const same = await prisma.expense.findMany({ where: { documentRef: { equals: input.document_ref, mode: "insensitive" }, status: "RECORDED" }, select });
        found = same.map((e) => possible("EXPENSE", e.id, label(e), "same supplier document number"));
      }
      if (!found.length && input.supplier) {
        const net = num(input.amount_net);
        const sameDay = await prisma.expense.findMany({ where: { expenseDate: parseDateOnly(input.expense_date), supplier: { equals: input.supplier, mode: "insensitive" }, status: "RECORDED" }, select });
        found = sameDay.filter((e) => net && dec(e.amountNet).eq(net)).map((e) => possible("EXPENSE", e.id, label(e), "same supplier, date and amount"));
      }
      if (found.length) return duplicatesFound(found);
    }
    const paid = input.is_paid ?? true;
    const { id: expenseId } = await createExpense(actor, {
      categoryId: input.category_id,
      label: input.label,
      supplier: v(input.supplier),
      expenseDate: input.expense_date,
      periodMonth: input.period_month ?? input.expense_date.slice(0, 7),
      amountNet: v(input.amount_net),
      vatAmount: v(input.vat_amount),
      vatRecoverable: input.vat_recoverable ?? true,
      currency: input.currency ?? "EUR",
      manualFxRate: v(input.manual_fx_rate),
      recurrence: input.recurrence ?? "NONE",
      isPaid: paid,
      paidOn: paid ? input.paid_on ?? input.expense_date : "",
      notes: v(input.notes),
      documentRef: v(input.document_ref),
    });
    const label = `${input.label} · ${shown(input.amount_net)} ${input.currency ?? "EUR"}`;
    return { done: "created", records: [ref("EXPENSE", expenseId, label, input.document_ref ?? null)], attach: await attachTo(actor, "EXPENSE", expenseId, label), next: ATTACH_NEXT };
  },
});

export const FINANCE_WRITE_TOOLS: CrmTool[] = [
  recordClientInvoiceTool,
  updateDraftInvoiceTool,
  recordClientPaymentTool,
  createSalesOrderTool,
  setProjectPriceTool,
  recordDirectCostTool,
  setCostAmountTool,
  recordSupplierPaymentTool,
  recordExpenseTool,
];
