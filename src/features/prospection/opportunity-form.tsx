"use client";

import { useRouter } from "next/navigation";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS, OPPORTUNITY_STAGE, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { VIDEO_TYPES } from "@/features/editors/schemas";
import { createOpportunityAction, updateOpportunityAction } from "./actions";
import { opportunitySchema, type OpportunityInput } from "./schemas";
import { useT } from "#i18n";

export function OpportunityForm({ id, defaults, clients, owners }: { id?: string; defaults: OpportunityInput; clients: { value: string; label: string }[]; owners: { value: string; label: string }[] }) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: opportunitySchema,
    defaultValues: defaults,
    action: (v) => (id ? updateOpportunityAction(id, v) : createOpportunityAction(v)),
    refresh: false,
    onSuccess: (data) => {
      router.push(`/prospection/${data.id}`);
      router.refresh();
    },
  });
  const { register, watch } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label={tr("Client ou prospect")} htmlFor="clientId" required error={err("clientId")}>
          <NativeSelect {...register("clientId")}>
            <option value="">{tr("— Choisir —")}</option>
            {clients.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Intitulé")} htmlFor="title" required error={err("title")}><Input {...register("title")} /></Field>
        <Field label={tr("Étape")} htmlFor="stage">
          <NativeSelect {...register("stage")}>
            {Object.entries(OPPORTUNITY_STAGE).map(([v, s]) => <option key={v} value={v}>{tr(s.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Responsable")} htmlFor="ownerId">
          <NativeSelect {...register("ownerId")}>
            <option value="">—</option>
            {owners.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Montant estimé HT")} htmlFor="estimatedAmount" error={err("estimatedAmount")} hint={tr("Prévisionnel : jamais compté comme CA réalisé.")}><Input inputMode="decimal" {...register("estimatedAmount")} /></Field>
        <Field label={tr("Devise")} htmlFor="currency">
          <NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
        </Field>
        <Field label={tr("Probabilité (%)")} htmlFor="probability" error={err("probability")}><Input inputMode="decimal" {...register("probability")} /></Field>
        <Field label={tr("Clôture prévue")} htmlFor="expectedCloseOn" error={err("expectedCloseOn")}><Input type="date" {...register("expectedCloseOn")} /></Field>
        <Field label={tr("Prochaine action")} htmlFor="nextAction"><Input {...register("nextAction")} /></Field>
        <Field label={tr("Échéance de relance")} htmlFor="followUpOn" error={err("followUpOn")}><Input type="date" {...register("followUpOn")} /></Field>
      </FormGrid>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-semibold text-subtle">{tr("Prestations envisagées")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {VIDEO_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" value={t} {...register("services")} className="accent-[var(--av-accent)]" />
              {tr(VIDEO_TYPE_LABELS[t])}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={tr("Détail des prestations")} htmlFor="servicesNote"><Textarea rows={2} {...register("servicesNote")} /></Field>
      {watch("stage") === "LOST" ? (
        <Field label={tr("Motif de perte")} htmlFor="lostReason" required error={err("lostReason")}><Input {...register("lostReason")} /></Field>
      ) : null}
      <FormActions pending={pending} submitLabel={id ? tr("Enregistrer") : tr("Créer l'opportunité")} cancelHref={id ? `/prospection/${id}` : "/prospection"} />
    </form>
  );
}
