import type { AssignmentInput } from "@/features/production/schemas";
import type { InvoiceInput, SalesOrderInput } from "@/features/finance/schemas";

export const assignment = (o: Partial<AssignmentInput> & { videoId: string; editorId: string }): AssignmentInput => ({
  role: "EDIT",
  isPrimary: true,
  scope: "",
  rateCardId: "",
  rateMode: "PER_VIDEO",
  unitPrice: "",
  currency: "EUR",
  quantity: "1",
  minuteRounding: "",
  includedRevisions: "",
  estimatedHours: "",
  startOn: "",
  dueOn: "",
  manualFxRate: "",
  ...o,
});

export const salesOrder = (o: Partial<SalesOrderInput> & { clientId: string; lines: SalesOrderInput["lines"] }): SalesOrderInput => ({
  projectId: "",
  opportunityId: "",
  title: "Vente test",
  acceptedOn: "2026-10-01",
  currency: "EUR",
  manualFxRate: "",
  notes: "",
  ...o,
});

export const line = (o: Partial<SalesOrderInput["lines"][number]> & { unitPrice: string }): SalesOrderInput["lines"][number] => ({
  description: "Prestation",
  videoType: "",
  catalogItemId: "",
  quantity: "1",
  discount: "",
  includedRevisions: "",
  allocationMethod: "NONE",
  allocations: [],
  ...o,
});

export const invoice = (o: Partial<InvoiceInput> & { clientId: string; lines: InvoiceInput["lines"] }): InvoiceInput => ({
  projectId: "",
  salesOrderId: "",
  kind: "STANDARD",
  status: "ISSUED",
  number: `F-${Math.random().toString(36).slice(2, 8)}`,
  externalRef: "",
  issueDate: "2026-10-05",
  dueDate: "",
  currency: "EUR",
  manualFxRate: "",
  notes: "",
  ...o,
});

export const invLine = (unitPrice: string, vatRate = "20", extra: Partial<InvoiceInput["lines"][number]> = {}): InvoiceInput["lines"][number] => ({
  description: "Ligne",
  quantity: "1",
  unitPrice,
  vatRate,
  salesOrderLineId: "",
  deductsInvoiceId: "",
  ...extra,
});
