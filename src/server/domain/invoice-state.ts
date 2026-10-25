/**
 * État calculé d'une facture. « En retard » est un indicateur calculé (échéance
 * dépassée et solde positif), pas un statut saisi.
 * Solde = TTC − avoirs émis (TTC) − affectations d'encaissements actives.
 */
import type { InvoiceStatus } from "@/generated/prisma/enums";
import type { InvoicePaymentState } from "@/lib/labels";
import { Decimal } from "@/lib/money";

export interface InvoiceStateInput {
  status: InvoiceStatus;
  totalGross: Decimal;
  creditedGross: Decimal;
  allocated: Decimal;
  dueDate: string | null;
  today: string;
}

export interface InvoiceStateResult {
  state: InvoicePaymentState;
  balance: Decimal;
  overdue: boolean;
  daysOverdue: number;
}

export function computeInvoiceState(input: InvoiceStateInput): InvoiceStateResult {
  const balance = input.totalGross.minus(input.creditedGross).minus(input.allocated);
  if (input.status === "DRAFT") return { state: "DRAFT", balance, overdue: false, daysOverdue: 0 };
  if (input.status === "CANCELLED") return { state: "CANCELLED", balance: new Decimal(0), overdue: false, daysOverdue: 0 };
  const state: InvoicePaymentState = balance.lte(0)
    ? "PAID"
    : input.allocated.gt(0)
      ? "PARTIALLY_PAID"
      : "ISSUED_UNPAID";
  const overdue = balance.gt(0) && !!input.dueDate && input.dueDate < input.today;
  const daysOverdue = overdue && input.dueDate
    ? Math.round((Date.parse(`${input.today}T00:00:00Z`) - Date.parse(`${input.dueDate}T00:00:00Z`)) / 86_400_000)
    : 0;
  return { state, balance, overdue, daysOverdue };
}

/** Tranche d'ancienneté d'une créance (rapport « impayés et ancienneté »). */
export function agingBucket(daysOverdue: number): "NOT_DUE" | "D0_30" | "D31_60" | "D61_90" | "D90_PLUS" {
  if (daysOverdue <= 0) return "NOT_DUE";
  if (daysOverdue <= 30) return "D0_30";
  if (daysOverdue <= 60) return "D31_60";
  if (daysOverdue <= 90) return "D61_90";
  return "D90_PLUS";
}

export const AGING_LABELS = {
  NOT_DUE: "Non échue",
  D0_30: "1–30 jours",
  D31_60: "31–60 jours",
  D61_90: "61–90 jours",
  D90_PLUS: "+ de 90 jours",
} as const;
