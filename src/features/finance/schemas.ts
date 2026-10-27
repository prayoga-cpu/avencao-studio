import { z } from "zod";
import { VIDEO_TYPES } from "@/features/editors/schemas";
import {
  zCurrency, zDate, zDateRequired, zDecimal, zInt, zLongText, zMoney, zMoneyRequired, zPercent, zPositiveMoney, zRate,
  zRequired, zText,
} from "@/lib/validation";

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CARD", "PAYPAL", "WISE", "CASH", "OTHER"] as const;

export const salesLineSchema = z.object({
  description: zRequired("Description", 300),
  videoType: z.enum(["", ...VIDEO_TYPES]),
  catalogItemId: zText(64),
  quantity: z.string().trim().refine((v) => /^\d+([.,]\d{1,3})?$/.test(v) && Number(v.replace(",", ".")) > 0, "Quantité > 0"),
  unitPrice: zMoneyRequired,
  discount: zMoney,
  includedRevisions: zInt,
  allocationMethod: z.enum(["NONE", "EQUAL", "WEIGHTED", "MANUAL"]),
  allocations: z.array(z.object({ videoId: zRequired("Vidéo", 64), value: zDecimal })),
  /** Forfait : parts égales sur toutes les vidéos actives du projet, y compris celles ajoutées plus tard. */
  autoAllocate: z.boolean().optional(),
});
export type SalesLineInput = z.input<typeof salesLineSchema>;

export const salesOrderSchema = z.object({
  clientId: zRequired("Client", 64),
  projectId: zText(64),
  opportunityId: zText(64),
  title: zRequired("Intitulé", 200),
  acceptedOn: zDateRequired,
  currency: zCurrency,
  manualFxRate: zRate,
  notes: zLongText(2000),
  lines: z.array(salesLineSchema).min(1, "Au moins une ligne"),
});
export type SalesOrderInput = z.input<typeof salesOrderSchema>;

export const reallocateSchema = z.object({
  lineId: zRequired("Ligne", 64),
  allocationMethod: z.enum(["NONE", "EQUAL", "WEIGHTED", "MANUAL"]),
  allocations: z.array(z.object({ videoId: zRequired("Vidéo", 64), value: zDecimal })),
  autoAllocate: z.boolean().optional(),
});
export type ReallocateInput = z.input<typeof reallocateSchema>;

/**
 * Prix d'un projet entier, enregistré comme une vente acceptée (source unique des ventes) :
 * - FLAT : forfait global réparti à parts égales, automatiquement, sur les vidéos actives ;
 * - PER_VIDEO : prix unitaire × nombre de vidéos actives, réparti sur ces vidéos.
 */
export const projectPriceSchema = z.object({
  projectId: zRequired("Projet", 64),
  mode: z.enum(["FLAT", "PER_VIDEO"]),
  amount: zMoneyRequired,
  acceptedOn: zDateRequired,
  currency: zCurrency,
  manualFxRate: zRate,
  title: zRequired("Intitulé", 200),
  includedRevisions: zInt,
  notes: zLongText(2000),
});
export type ProjectPriceInput = z.input<typeof projectPriceSchema>;

export const cancelLineSchema = z.object({
  lineId: zRequired("Ligne", 64),
  amount: zPositiveMoney,
  cancelledOn: zDateRequired,
  reason: zRequired("Motif", 300),
});

export const invoiceLineSchema = z.object({
  description: zRequired("Description", 300),
  quantity: z.string().trim().refine((v) => /^\d+([.,]\d{1,3})?$/.test(v) && Number(v.replace(",", ".")) > 0, "Quantité > 0"),
  unitPrice: zMoneyRequired,
  vatRate: zPercent.refine((v) => v !== "", "Taux de TVA obligatoire (0 si non applicable)"),
  salesOrderLineId: zText(64),
  /** Ligne de déduction d'un acompte : montant HT positif saisi, enregistré en négatif. */
  deductsInvoiceId: zText(64),
});
export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;

export const invoiceSchema = z.object({
  clientId: zRequired("Client", 64),
  projectId: zText(64),
  salesOrderId: zText(64),
  kind: z.enum(["STANDARD", "DEPOSIT", "FINAL"]),
  status: z.enum(["DRAFT", "ISSUED"]),
  number: zText(60),
  externalRef: zText(120),
  issueDate: zDate,
  dueDate: zDate,
  currency: zCurrency,
  manualFxRate: zRate,
  notes: zLongText(2000),
  lines: z.array(invoiceLineSchema).min(1, "Au moins une ligne"),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const issueInvoiceSchema = z.object({
  invoiceId: zRequired("Facture", 64),
  number: zRequired("Numéro de facture", 60),
  issueDate: zDateRequired,
  dueDate: zDate,
  manualFxRate: zRate,
});

export const creditNoteSchema = z.object({
  invoiceId: zRequired("Facture d'origine", 64),
  number: zText(60),
  issueDate: zDateRequired,
  net: zPositiveMoney,
  vatRate: zPercent.refine((v) => v !== "", "Taux de TVA obligatoire"),
  reason: zRequired("Motif", 300),
  manualFxRate: zRate,
});
export type CreditNoteInput = z.input<typeof creditNoteSchema>;

export const clientPaymentSchema = z.object({
  clientId: zRequired("Client", 64),
  receivedOn: zDateRequired,
  amount: zPositiveMoney,
  currency: zCurrency,
  manualFxRate: zRate,
  fees: zMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: zText(120),
  notes: zText(500),
  allocations: z.array(z.object({ invoiceId: zRequired("Facture", 64), amount: zPositiveMoney })),
});
export type ClientPaymentInput = z.input<typeof clientPaymentSchema>;

export const allocatePaymentSchema = z.object({
  paymentId: zRequired("Encaissement", 64),
  invoiceId: zRequired("Facture", 64),
  amount: zPositiveMoney,
});

export const refundSchema = z.object({
  paymentId: zText(64),
  creditNoteId: zText(64),
  refundedOn: zDateRequired,
  amount: zPositiveMoney,
  manualFxRate: zRate,
  method: z.enum(PAYMENT_METHODS),
  reference: zText(120),
  reason: zRequired("Motif", 300),
});
export type RefundInput = z.input<typeof refundSchema>;

export const supplierPaymentSchema = z.object({
  editorId: zRequired("Prestataire", 64),
  paidOn: zDateRequired,
  currency: zCurrency,
  manualFxRate: zRate,
  fees: zMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: zText(120),
  notes: zText(500),
  allocations: z.array(z.object({ directCostId: zRequired("Coût", 64), amount: zPositiveMoney })).min(1, "Sélectionnez au moins un coût validé"),
});
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>;

export const directCostSchema = z.object({
  kind: z.enum(["PURCHASE", "ADDITIONAL", "ENVELOPE"]),
  label: zRequired("Libellé", 200),
  editorId: zText(64),
  supplierName: zText(120),
  projectId: zText(64),
  videoId: zText(64),
  amount: zMoney,
  currency: zCurrency,
  manualFxRate: zRate,
  incurredOn: zDateRequired,
  stage: z.enum(["ESTIMATED", "COMMITTED", "VALIDATED"]),
  periodMonth: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}$/.test(v), "Mois « AAAA-MM »"),
  nonRecoverableVat: zMoney,
  notes: zText(500),
  /** Numéro de la facture du fournisseur ou du monteur (détection des doublons). */
  documentRef: zText(120).default(""),
});
export type DirectCostInput = z.input<typeof directCostSchema>;

export const costAllocationSchema = z.object({
  costId: zRequired("Coût", 64),
  allocations: z.array(z.object({ videoId: zRequired("Vidéo", 64), amount: zMoneyRequired })),
});
export type CostAllocationInput = z.input<typeof costAllocationSchema>;

export const costStageSchema = z.object({
  costId: zRequired("Coût", 64),
  stage: z.enum(["ESTIMATED", "COMMITTED", "VALIDATED", "CANCELLED"]),
  reason: zText(300),
});

export const expenseSchema = z.object({
  categoryId: zRequired("Catégorie", 64),
  label: zRequired("Libellé", 200),
  supplier: zText(120),
  expenseDate: zDateRequired,
  periodMonth: z.string().trim().refine((v) => /^\d{4}-\d{2}$/.test(v), "Mois de rattachement « AAAA-MM »"),
  amountNet: zMoneyRequired,
  vatAmount: zMoney,
  vatRecoverable: z.boolean(),
  currency: zCurrency,
  manualFxRate: zRate,
  recurrence: z.enum(["NONE", "MONTHLY", "QUARTERLY", "YEARLY"]),
  isPaid: z.boolean(),
  paidOn: zDate,
  notes: zText(500),
  /** Numéro de la facture ou du reçu du fournisseur (détection des doublons). */
  documentRef: zText(120).default(""),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export const retainerSchema = z.object({
  clientId: zRequired("Client", 64),
  title: zRequired("Intitulé", 200),
  startsOn: zDateRequired,
  endsOn: zDate,
  amount: zMoneyRequired,
  currency: zCurrency,
  carryOver: z.enum(["NONE", "NEXT_PERIOD", "UNLIMITED"]),
  createDraftInvoice: z.boolean(),
  vatRate: zPercent,
  notes: zText(500),
  quotas: z.array(z.object({ videoType: z.enum(VIDEO_TYPES), quantity: zInt })).min(1, "Au moins un quota"),
});
export type RetainerInput = z.input<typeof retainerSchema>;

export const exchangeRateSchema = z.object({
  date: zDateRequired,
  currency: z.enum(["IDR", "USD"]),
  unitsPerEur: zRate.refine((v) => v !== "", "Taux obligatoire"),
  note: zText(200),
});
export type ExchangeRateInput = z.input<typeof exchangeRateSchema>;

export const catalogItemSchema = z.object({
  id: zText(64),
  name: zRequired("Nom", 160),
  description: zText(500),
  videoType: z.enum(["", ...VIDEO_TYPES]),
  unit: zRequired("Unité", 40),
  unitPrice: zMoneyRequired,
  currency: zCurrency,
  includedRevisions: zInt,
  turnaroundDays: zInt,
  targetCost: zMoney,
  active: z.boolean(),
});
export type CatalogItemInput = z.input<typeof catalogItemSchema>;

export const emptyLine = (): SalesLineInput => ({
  description: "", videoType: "", catalogItemId: "", quantity: "1", unitPrice: "", discount: "", includedRevisions: "", allocationMethod: "EQUAL", allocations: [],
});

