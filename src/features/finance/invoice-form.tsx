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
        Enregistrement d&apos;une facture émise par votre outil de facturation habituel (numéro, date, montants, PDF). Le CRM ne revendique aucune conformité de facturation électronique.
      </Notice>
      <FormSection title="Document">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId", { onChange: () => setValue("projectId", "") })}>
              <option value="">— Choisir —</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Projet" htmlFor="projectId">
            <NativeSelect {...register("projectId")}>
              <option value="">—</option>
              {projects.filter((p) => !clientId || p.clientId === clientId).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Nature" htmlFor="kind" hint="Acompte puis facture finale : la finale déduit l'acompte pour ne pas compter deux fois le revenu.">
            <NativeSelect {...register("kind")}>{Object.entries(INVOICE_KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
          </Field>
          <Field label="État du document" htmlFor="status">
            <NativeSelect {...register("status")}>
              <option value="ISSUED">Émise (numéro attribué)</option>
              <option value="DRAFT">Brouillon (exclu du CA facturé)</option>
            </NativeSelect>
          </Field>
          <Field label="Numéro de facture" htmlFor="number" required={status === "ISSUED"} error={err("number")}><Input {...register("number")} /></Field>
          <Field label="Référence externe" htmlFor="externalRef" hint="Identifiant dans l'outil de facturation"><Input {...register("externalRef")} /></Field>
          <Field label="Date d'émission" htmlFor="issueDate" required={status === "ISSUED"} error={err("issueDate")}><Input type="date" {...register("issueDate")} /></Field>
          <Field label="Échéance" htmlFor="dueDate" error={err("dueDate")} hint="Vide : conditions du client ou de l'agence."><Input type="date" {...register("dueDate")} /></Field>
          <Field label="Devise" htmlFor="currency">
            <NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
          </Field>
          {currency !== "EUR" ? (
            <Field label="Taux manuel (unités pour 1 €)" htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field>
          ) : null}
          <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Lignes" description="HT, taux de TVA saisi par ligne (aucun régime fiscal présumé : 0 si non applicable).">
        <div className="flex flex-col gap-3">
          {lines.fields.map((field, index) => {
            const deduction = !!watch(`lines.${index}.deductsInvoiceId`);
            return (
              <div key={field.id} className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[3fr_1fr_1fr_1fr_auto] md:items-end ${deduction ? "border-warning/40 bg-[#ffc10708]" : "border-border"}`}>
                {deduction ? (
                  <Field label="Acompte déduit" htmlFor={`il${index}-dep`} error={err(`lines.${index}.deductsInvoiceId`)}>
                    <NativeSelect {...register(`lines.${index}.deductsInvoiceId`, {
                      onChange: (e) => {
                        const dep = deposits.find((d) => d.id === e.target.value);
                        if (dep) {
                          setValue(`lines.${index}.description`, `Déduction acompte ${dep.number}`);
                          setValue(`lines.${index}.unitPrice`, dep.remainingNet);
                        }
                      },
                    })}>
                      {clientDeposits.map((d) => <option key={d.id} value={d.id}>{d.number} — reste {d.remainingNet} HT</option>)}
                    </NativeSelect>
                  </Field>
                ) : (
                  <Field label="Description" htmlFor={`il${index}-desc`} required error={err(`lines.${index}.description`)}>
                    <Input {...register(`lines.${index}.description`)} />
                  </Field>
                )}
                <Field label="Quantité" htmlFor={`il${index}-q`} error={err(`lines.${index}.quantity`)}><Input inputMode="decimal" {...register(`lines.${index}.quantity`)} disabled={deduction} /></Field>
                <Field label={deduction ? "Montant déduit HT" : "PU HT"} htmlFor={`il${index}-p`} error={err(`lines.${index}.unitPrice`)}><Input inputMode="decimal" {...register(`lines.${index}.unitPrice`)} /></Field>
                <Field label="TVA %" htmlFor={`il${index}-v`} error={err(`lines.${index}.vatRate`)}><Input inputMode="decimal" {...register(`lines.${index}.vatRate`)} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Retirer la ligne" onClick={() => lines.remove(index)} disabled={lines.fields.length === 1}>
                  <Trash2 aria-hidden />
                </Button>
                {!deduction && clientOrderLines.length ? (
                  <Field label="Ligne de vente liée (suivi du reste à facturer)" htmlFor={`il${index}-sol`} className="md:col-span-5">
                    <NativeSelect {...register(`lines.${index}.salesOrderLineId`)}>
                      <option value="">—</option>
                      {clientOrderLines.map((l) => <option key={l.id} value={l.id}>{l.label} (net {l.netRemaining})</option>)}
                    </NativeSelect>
                  </Field>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => lines.append({ description: "", quantity: "1", unitPrice: "", vatRate: lines.fields.length ? (watch(`lines.0.vatRate`) ?? "") : "", salesOrderLineId: "", deductsInvoiceId: "" })}>
            <Plus aria-hidden /> Ligne
          </Button>
          {kind === "FINAL" && clientDeposits.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const dep = clientDeposits[0];
                lines.append({ description: `Déduction acompte ${dep.number}`, quantity: "1", unitPrice: dep.remainingNet, vatRate: watch(`lines.0.vatRate`) ?? "", salesOrderLineId: "", deductsInvoiceId: dep.id });
              }}
            >
              <Minus aria-hidden /> Déduire un acompte
            </Button>
          ) : null}
        </div>
      </FormSection>
      <FormActions pending={pending} submitLabel={invoiceId ? "Enregistrer le brouillon" : "Enregistrer la facture"} cancelHref={invoiceId ? `/finances/factures/${invoiceId}` : "/finances?onglet=factures"} />
    </form>
  );
}
