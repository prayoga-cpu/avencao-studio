"use client";

import { useRouter } from "next/navigation";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS, EDITOR_LEVEL_LABELS, EDITOR_STATUS, SKILL_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { createEditorAction, updateEditorAction } from "./actions";
import { editorSchema, SKILLS, VIDEO_TYPES, type EditorInput } from "./schemas";
import { useT } from "#i18n";

export function EditorForm({ editorId, defaults, canAppraise }: { editorId?: string; defaults: EditorInput; canAppraise: boolean }) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: editorSchema,
    defaultValues: defaults,
    action: (v) => (editorId ? updateEditorAction(editorId, v) : createEditorAction(v)),
    refresh: false,
    onSuccess: (data) => {
      router.push(`/monteurs/${data.id}`);
      router.refresh();
    },
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title={tr("Identité")} description={tr("La fiche prestataire est indépendante du compte de connexion (invitation possible ensuite).")}>
        <FormGrid>
          <Field label={tr("Nom ou pseudonyme")} htmlFor="displayName" required error={err("displayName")}><Input {...register("displayName")} /></Field>
          <Field label={tr("Statut")} htmlFor="status">
            <NativeSelect {...register("status")}>
              {Object.entries(EDITOR_STATUS).map(([v, s]) => <option key={v} value={v}>{tr(s.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Email")} htmlFor="email" error={err("email")}><Input type="email" {...register("email")} /></Field>
          <Field label={tr("WhatsApp")} htmlFor="whatsapp"><Input type="tel" {...register("whatsapp")} /></Field>
          <Field label={tr("Pays")} htmlFor="country"><Input {...register("country")} /></Field>
          <Field label={tr("Fuseau horaire")} htmlFor="timezone" hint={tr("Ex. Asia/Makassar, Europe/Paris")}><Input {...register("timezone")} /></Field>
          <Field label={tr("Langues")} htmlFor="languages" hint={tr("Séparées par des virgules")}><Input {...register("languages")} /></Field>
          <Field label={tr("Niveau")} htmlFor="level">
            <NativeSelect {...register("level")}>
              <option value="">—</option>
              {Object.entries(EDITOR_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Avatar (URL)")} htmlFor="avatarUrl" error={err("avatarUrl")}><Input type="url" {...register("avatarUrl")} /></Field>
          <Field label={tr("Portfolio")} htmlFor="portfolioUrl" error={err("portfolioUrl")}><Input type="url" {...register("portfolioUrl")} /></Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Compétences et formats")}>
        <fieldset className="mb-4 min-w-0">
          <legend className="mb-2 text-xs font-semibold text-subtle">{tr("Logiciels et compétences")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {SKILLS.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" value={s} {...register("skills")} className="accent-[var(--av-accent)]" />
                {tr(SKILL_LABELS[s])}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-semibold text-subtle">{tr("Formats maîtrisés")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {VIDEO_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" value={t} {...register("formats")} className="accent-[var(--av-accent)]" />
                {tr(VIDEO_TYPE_LABELS[t])}
              </label>
            ))}
          </div>
        </fieldset>
      </FormSection>

      <FormSection title={tr("Disponibilité et rémunération")}>
        <FormGrid>
          <Field label={tr("Capacité hebdomadaire indicative (heures)")} htmlFor="weeklyCapacityHours" error={err("weeklyCapacityHours")} hint={tr("Sert à détecter les surcharges.")}>
            <Input inputMode="decimal" {...register("weeklyCapacityHours")} />
          </Field>
          <Field label={tr("Disponibilité")} htmlFor="availabilityNote"><Input {...register("availabilityNote")} placeholder={tr("Ex. semaine uniquement")} /></Field>
          <Field label={tr("Devise de rémunération")} htmlFor="payCurrency">
            <NativeSelect {...register("payCurrency")}>
              {Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Conditions de paiement")} htmlFor="paymentTerms"><Input {...register("paymentTerms")} placeholder={tr("Ex. Wise, fin de mois")} /></Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Notes internes")} description={tr("Jamais visibles du prestataire.")}>
        <div className="grid gap-4">
          <Field label={tr("Notes internes")} htmlFor="internalNotes"><Textarea rows={3} {...register("internalNotes")} /></Field>
          {canAppraise ? (
            <Field label={tr("Appréciation privée (administrateurs)")} htmlFor="privateAppraisal" hint={tr("Saisie humaine : aucune notation automatique.")}>
              <Textarea rows={3} {...register("privateAppraisal")} />
            </Field>
          ) : null}
        </div>
      </FormSection>
      <FormActions pending={pending} submitLabel={editorId ? tr("Enregistrer") : tr("Créer le prestataire")} cancelHref={editorId ? `/monteurs/${editorId}` : "/monteurs"} />
    </form>
  );
}

