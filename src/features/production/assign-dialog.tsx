"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Calculator, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Money, Percent } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ASSIGNMENT_ROLE_LABELS, CURRENCY_LABELS, MINUTE_ROUNDING_LABELS, RATE_MODE_LABELS, SKILL_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import type { AssignmentPreview } from "@/server/services/assignments";
import { assignEditorAction, previewAssignmentAction } from "./actions";
import { assignmentSchema, type AssignmentInput } from "./schemas";
import { useT } from "#i18n";

export interface EditorChoice {
  id: string;
  name: string;
  skills: string[];
  formats: string[];
  payCurrency: string;
  rateCards: { id: string; label: string; mode: string; unitPrice: string | null; currency: string; videoType: string | null }[];
}

export function AssignDialog({
  videoId,
  internalDeadline,
  estimatedHours,
  editors,
  canSetPrice,
}: {
  videoId: string;
  internalDeadline: string;
  estimatedHours: string;
  editors: EditorChoice[];
  canSetPrice: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus aria-hidden /> {" "}{tr("Affecter un prestataire")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Affecter un prestataire")}</DialogTitle>
          <DialogDescription>{tr("Le tarif est copié dans la mission : une modification ultérieure du catalogue ne la change pas. Les indications sont explicables (compétences, charge, coût) — pas d'IA de matching.")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <AssignForm videoId={videoId} internalDeadline={internalDeadline} estimatedHours={estimatedHours} editors={editors} canSetPrice={canSetPrice} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({
  videoId,
  internalDeadline,
  estimatedHours,
  editors,
  canSetPrice,
  onDone,
}: {
  videoId: string;
  internalDeadline: string;
  estimatedHours: string;
  editors: EditorChoice[];
  canSetPrice: boolean;
  onDone: () => void;
}) {
  const tr = useT();
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const defaults: AssignmentInput = {
    videoId, editorId: "", role: "EDIT", isPrimary: true, scope: "", rateCardId: "", rateMode: "", unitPrice: "", currency: "",
    quantity: "", minuteRounding: "", includedRevisions: "", estimatedHours, startOn: "", dueOn: internalDeadline, manualFxRate: "",
  };
  const { form, onSubmit, pending, err } = useServerForm({
    schema: assignmentSchema,
    defaultValues: defaults,
    action: assignEditorAction,
    onSuccess: (data) => {
      for (const w of data.warnings) toast.warning(w);
      onDone();
    },
  });
  const { register, watch, getValues } = form;
  const editor = editors.find((e) => e.id === watch("editorId"));
  const mode = watch("rateMode");

  function runPreview() {
    if (!getValues("editorId")) {
      toast.error(tr("Choisissez d'abord un prestataire."));
      return;
    }
    startPreview(async () => {
      const r = await previewAssignmentAction(getValues());
      if (r.ok) setPreview(r.data);
      else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label={tr("Prestataire")} htmlFor="editorId" required error={err("editorId")}>
          <NativeSelect {...register("editorId", { onChange: () => setPreview(null) })}>
            <option value="">{tr("— Choisir —")}</option>
            {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Rôle de production")} htmlFor="role">
          <NativeSelect {...register("role", { onChange: () => setPreview(null) })}>
            {Object.entries(ASSIGNMENT_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
          </NativeSelect>
        </Field>
      </FormGrid>
      {editor ? (
        <p className="text-xs text-subtle">
          {tr("Compétences :")}{" "}{editor.skills.map((s) => tr(SKILL_LABELS[s as keyof typeof SKILL_LABELS])).join(", ") || "—"} {" "}{tr("· Formats :")}{" "}{editor.formats.map((f) => tr(VIDEO_TYPE_LABELS[f as keyof typeof VIDEO_TYPE_LABELS])).join(", ") || "—"}
        </p>
      ) : null}
      <FormGrid>
        <Field label={tr("Tarif du catalogue")} htmlFor="rateCardId" hint={editor && editor.rateCards.length === 0 ? tr("Aucun tarif : coût « à renseigner ».") : undefined}>
          <NativeSelect {...register("rateCardId", { onChange: () => setPreview(null) })} disabled={!editor}>
            <option value="">{tr("Aucun")}</option>
            {editor?.rateCards.map((r) => (
              <option key={r.id} value={r.id}>
                {tr(r.label)} — {tr(RATE_MODE_LABELS[r.mode as keyof typeof RATE_MODE_LABELS])}{r.unitPrice ? ` · ${r.unitPrice} ${r.currency}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={tr("Quantité")} htmlFor="quantity" hint={tr("Vidéos, heures ou jours selon le mode")} error={err("quantity")}>
          <Input inputMode="decimal" {...register("quantity")} placeholder="1" />
        </Field>
      </FormGrid>
      {canSetPrice ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">{tr("Prix négocié pour cette mission (facultatif)")}</summary>
          <FormGrid className="mt-3">
            <Field label={tr("Mode")} htmlFor="rateMode">
              <NativeSelect {...register("rateMode", { onChange: () => setPreview(null) })}>
                <option value="">{tr("Celui du tarif")}</option>
                {Object.entries(RATE_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
              </NativeSelect>
            </Field>
            <Field label={tr("Prix unitaire")} htmlFor="unitPrice" error={err("unitPrice")}><Input inputMode="decimal" {...register("unitPrice", { onChange: () => setPreview(null) })} /></Field>
            <Field label={tr("Devise")} htmlFor="currency">
              <NativeSelect {...register("currency")}>
                <option value="">{tr("Celle du tarif / du prestataire")}</option>
                {Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
              </NativeSelect>
            </Field>
            {mode === "PER_FINAL_MINUTE" ? (
              <Field label={tr("Arrondi")} htmlFor="minuteRounding">
                <NativeSelect {...register("minuteRounding")}>
                  <option value="">{tr("Réglage par défaut")}</option>
                  {Object.entries(MINUTE_ROUNDING_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label={tr("Taux de change manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")} hint={tr("Requis pour IDR/USD sans taux de référence.")}>
              <Input inputMode="decimal" {...register("manualFxRate")} />
            </Field>
          </FormGrid>
        </details>
      ) : null}
      <FormGrid className="md:grid-cols-3">
        <Field label={tr("Heures estimées")} htmlFor="estimatedHours" error={err("estimatedHours")}><Input inputMode="decimal" {...register("estimatedHours")} /></Field>
        <Field label={tr("Début")} htmlFor="startOn" error={err("startOn")}><Input type="date" {...register("startOn")} /></Field>
        <Field label={tr("Échéance de la mission")} htmlFor="dueOn" error={err("dueOn")}><Input type="date" {...register("dueOn")} /></Field>
        <Field label={tr("Périmètre")} htmlFor="scope" className="md:col-span-3"><Input {...register("scope")} placeholder={tr("Ex. montage + sous-titres, hors miniature")} /></Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("isPrimary")} className="accent-[var(--av-accent)]" />
        {tr("Affectation principale (les contributions secondaires restent possibles)")}</label>

      <div className="rounded-xl border border-brand-border bg-surface-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{tr("Coût, marge et charge")}</p>
          <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={previewing}>
            {previewing ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />} {" "}{tr("Calculer l'impact")}</Button>
        </div>
        {preview ? (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            {preview.cost ? (
              <div>
                <p className="text-xs text-subtle">{tr("Coût prévu")}</p>
                <p className="font-semibold"><Money value={preview.cost.amount} currency={preview.cost.currency as CurrencyCode} /></p>
                {preview.cost.currency !== "EUR" && preview.cost.amountEur ? <p className="text-xs text-subtle">≈ <Money value={preview.cost.amountEur} /></p> : null}
                <p className="text-xs text-faint">{preview.cost.basis}</p>
                {preview.cost.fxMissing ? <p className="text-xs text-warning">{tr("Taux de change manquant : saisissez un taux manuel.")}</p> : null}
              </div>
            ) : (
              <p className="text-xs text-subtle">{tr("Montants masqués (accès financier non activé).")}</p>
            )}
            {preview.margin ? (
              <div>
                <p className="text-xs text-subtle">{tr("Marge de la vidéo")}</p>
                <p className="font-semibold"><Money value={preview.margin.beforeEur} /> → <Money value={preview.margin.afterEur} colorize /></p>
                <p className="text-xs text-subtle"><Percent value={preview.margin.ratePctBefore} /> → <Percent value={preview.margin.ratePctAfter} /> {" "}{tr("(revenu alloué")}{" "}<Money value={preview.margin.revenueEur} />)</p>
                {preview.margin.belowThreshold ? <p className="text-xs font-semibold text-danger">{tr("Sous le seuil de")}{" "}{preview.margin.thresholdPct} %</p> : null}
                {preview.margin.incompleteAfter ? <p className="text-xs text-warning">{tr("Marge provisoire : coût(s) à renseigner.")}</p> : null}
              </div>
            ) : null}
            <div>
              <p className="text-xs text-subtle">{tr("Charge sur 7 jours")}</p>
              <p className={preview.load.overloaded ? "font-semibold text-danger" : "font-semibold"}>
                {preview.load.plannedHours} h{preview.load.capacityHours ? ` / ${preview.load.capacityHours} h` : ""}
              </p>
              <p className="text-xs text-subtle">{preview.load.activeMissions} {" "}{tr("mission(s) active(s)")}</p>
            </div>
            {preview.fit.notes.length ? (
              <Notice tone="warning" className="sm:col-span-3">
                <ul className="list-disc pl-4">{preview.fit.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </Notice>
            ) : (
              <p className="flex items-center gap-1 text-xs text-success sm:col-span-3"><AlertTriangle className="hidden" aria-hidden />{tr("Compétences et formats correspondants, pas de surcharge détectée.")}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-faint">{tr("Calculez l'impact avant de confirmer (coût, marge avant/après, surcharge).")}</p>
        )}
      </div>
      <FormActions pending={pending} submitLabel={tr("Affecter")} onCancel={onDone} />
    </form>
  );
}
