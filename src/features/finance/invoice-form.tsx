"use client";

import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS, INVOICE_KIND_LABELS } from "@/lib/labels";
import { createInvoiceAction, updateDraftInvoiceAction } from "./actions";
import { invoiceSchema, type InvoiceInput } from "./schemas";
import { useT } from "#i18n";

export interface DepositChoice {
  id: string;
  number: string;
  clientId: string;
  currency: string;
  remainingNet: string;
}

export interface OrderLineChoice {
  id: string;
  label: string;
  clientId: string;
  projectId: string | null;
  salesOrderId: string;
  netRemaining: string;
}

export function InvoiceForm({
  invoiceId,
  defaults,
  clients,
  projects,
  deposits,
  orderLines,
}: {
  invoiceId?: string;
  defaults: InvoiceInput;
  clients: { value: string; label: string }[];
  projects: { value: string; label: string; clientId: string }[];
  deposits: DepositChoice[];
  orderLines: OrderLineChoice[];
}) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: invoiceSchema,
    defaultValues: defaults,
    action: (v) => (invoiceId ? updateDraftInvoiceAction(invoiceId, v) : createInvoiceAction(v)),
    refresh: false,
    onSuccess: (data) => {
      router.push(`/finances/factures/${data.id}`);
      router.refresh();
    },
  });
  const { register, watch, control, setValue } = form;
  const lines = useFieldArray({ control, name: "lines" });
  const clientId = watch("clientId");
  const kind = watch("kind");
  const status = watch("status");
  const currency = watch("currency");
  const clientDeposits = deposits.filter((d) => d.clientId === clientId && d.currency === currency);
  const clientOrderLines = orderLines.filter((l) => l.clientId === clientId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Notice tone="info">
        {tr("Enregistrement d'une facture émise par votre outil de facturation habituel (numéro, date, montants, PDF). Le CRM ne revendique aucune conformité de facturation électronique.")}</Notice>
      <FormSection title={tr("Document")}>
        <FormGrid>
          <Field label={tr("Client")} htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId", { onChange: () => setValue("projectId", "") })}>
              <option value="">{tr("— Choisir —")}</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Projet")} htmlFor="projectId">
            <NativeSelect {...register("projectId")}>
              <option value="">—</option>
              {projects.filter((p) => !clientId || p.clientId === clientId).map((p) => <option key={p.value} value={p.value}>{tr(p.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Nature")} htmlFor="kind" hint={tr("Acompte puis facture finale : la finale déduit l'acompte pour ne pas compter deux fois le revenu.")}>
            <NativeSelect {...register("kind")}>{Object.entries(INVOICE_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("État du document")} htmlFor="status">
            <NativeSelect {...register("status")}>
              <option value="ISSUED">{tr("Émise (numéro attribué)")}</option>
              <option value="DRAFT">{tr("Brouillon (exclu du CA facturé)")}</option>
            </NativeSelect>
          </Field>
          <Field label={tr("Numéro de facture")} htmlFor="number" required={status === "ISSUED"} error={err("number")}><Input {...register("number")} /></Field>
          <Field label={tr("Référence externe")} htmlFor="externalRef" hint={tr("Identifiant dans l'outil de facturation")}><Input {...register("externalRef")} /></Field>
          <Field label={tr("Date d'émission")} htmlFor="issueDate" required={status === "ISSUED"} error={err("issueDate")}><Input type="date" {...register("issueDate")} /></Field>
          <Field label={tr("Échéance")} htmlFor="dueDate" error={err("dueDate")} hint={tr("Vide : conditions du client ou de l'agence.")}><Input type="date" {...register("dueDate")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency">
            <NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          {currency !== "EUR" ? (
            <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field>
          ) : null}
          <Field label={tr("Notes")} htmlFor="notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Lignes")} description={tr("HT, taux de TVA saisi par ligne (aucun régime fiscal présumé : 0 si non applicable).")}>
        <div className="flex flex-col gap-3">
          {lines.fields.map((field, index) => {
            const deduction = !!watch(`lines.${index}.deductsInvoiceId`);
            return (
              <div key={field.id} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[3fr_1fr_1fr_1fr_auto] md:items-end ${deduction ? "border-warning/40 bg-[#ffc10708]" : "border-border"}`}>
                {deduction ? (
                  <Field label={tr("Acompte déduit")} htmlFor={`il${index}-dep`} error={err(`lines.${index}.deductsInvoiceId`)}>
                    <NativeSelect {...register(`lines.${index}.deductsInvoiceId`, {
                      onChange: (e) => {
                        const dep = deposits.find((d) => d.id === e.target.value);
                        if (dep) {
                          setValue(`lines.${index}.description`, `Déduction acompte ${dep.number}`);
                          setValue(`lines.${index}.unitPrice`, dep.remainingNet);
                        }
                      },
                    })}>
                      {clientDeposits.map((d) => <option key={d.id} value={d.id}>{d.number} {" "}{tr("— reste")}{" "}{d.remainingNet} {" "}{tr("HT")}</option>)}
                    </NativeSelect>
                  </Field>
                ) : (
                  <Field label={tr("Description")} htmlFor={`il${index}-desc`} required error={err(`lines.${index}.description`)}>
                    <Input {...register(`lines.${index}.description`)} />
                  </Field>
                )}
                <Field label={tr("Quantité")} htmlFor={`il${index}-q`} error={err(`lines.${index}.quantity`)}><Input inputMode="decimal" {...register(`lines.${index}.quantity`)} disabled={deduction} /></Field>
                <Field label={deduction ? tr("Montant déduit HT") : tr("PU HT")} htmlFor={`il${index}-p`} error={err(`lines.${index}.unitPrice`)}><Input inputMode="decimal" {...register(`lines.${index}.unitPrice`)} /></Field>
                <Field label={tr("TVA %")} htmlFor={`il${index}-v`} error={err(`lines.${index}.vatRate`)}><Input inputMode="decimal" {...register(`lines.${index}.vatRate`)} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={tr("Retirer la ligne")} onClick={() => lines.remove(index)} disabled={lines.fields.length === 1}>
                  <Trash2 aria-hidden />
                </Button>
                {!deduction && clientOrderLines.length ? (
                  <Field label={tr("Ligne de vente liée (suivi du reste à facturer)")} htmlFor={`il${index}-sol`} className="md:col-span-5">
                    <NativeSelect {...register(`lines.${index}.salesOrderLineId`)}>
                      <option value="">—</option>
                      {clientOrderLines.map((l) => <option key={l.id} value={l.id}>{tr(l.label)} {" "}{tr("(net")}{" "}{l.netRemaining})</option>)}
                    </NativeSelect>
                  </Field>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => lines.append({ description: "", quantity: "1", unitPrice: "", vatRate: lines.fields.length ? (watch(`lines.0.vatRate`) ?? "") : "", salesOrderLineId: "", deductsInvoiceId: "" })}>
            <Plus aria-hidden /> {" "}{tr("Ligne")}</Button>
          {kind === "FINAL" && clientDeposits.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const dep = clientDeposits[0];
                lines.append({ description: tr("Déduction acompte {0}", [dep.number]), quantity: "1", unitPrice: dep.remainingNet, vatRate: watch(`lines.0.vatRate`) ?? "", salesOrderLineId: "", deductsInvoiceId: dep.id });
              }}
            >
              <Minus aria-hidden /> {" "}{tr("Déduire un acompte")}</Button>
          ) : null}
        </div>
      </FormSection>
      <FormActions pending={pending} submitLabel={invoiceId ? tr("Enregistrer le brouillon") : tr("Enregistrer la facture")} cancelHref={invoiceId ? `/finances/factures/${invoiceId}` : "/finances?onglet=factures"} />
    </form>
  );
}
