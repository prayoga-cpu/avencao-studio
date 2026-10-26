"use client";

import { useState, useTransition } from "react";
import { Calculator, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ASSIGNMENT_ROLE_LABELS, CURRENCY_LABELS, RATE_MODE_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import type { BulkRefusal } from "@/server/bulk";
import type { BulkAssignmentPreview } from "@/server/services/assignments";
import { assignEditorBulkAction, previewBulkAssignmentAction } from "./actions";
import type { EditorChoice } from "./assign-dialog";
import { bulkAssignmentSchema, type BulkAssignmentInput } from "./schemas";
import { useT } from "#i18n";

export interface BulkAssignVideo {
  id: string;
  reference: string;
  title: string;
}

/**
 * Affectation groupée : un prestataire pour plusieurs vidéos, une mission (et un coût) par
 * vidéo au même tarif figé. Échéance : celle de chaque vidéo ou une date fixe.
 */
export function BulkAssignDialog({
  videos,
  editors,
  canSetPrice,
  onDone,
  triggerClassName,
}: {
  videos: BulkAssignVideo[];
  editors: EditorChoice[];
  canSetPrice: boolean;
  /** Refus par motif (la sélection peut garder les vidéos concernées). */
  onDone?: (refusals: BulkRefusal[]) => void;
  triggerClassName?: string;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={triggerClassName} disabled={videos.length === 0}>
          <UserPlus aria-hidden /> {" "}{tr("Attribuer à…")}</Button>
      </DialogTrigger>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{tr("Attribuer {0} vidéo(s) à un prestataire", [videos.length])}</DialogTitle>
          <DialogDescription>{tr("Une mission par vidéo, au même tarif figé ; le coût est calculé vidéo par vidéo. Les vidéos clôturées ou déjà confiées à ce prestataire pour ce rôle sont ignorées.")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <BulkAssignForm
            videos={videos}
            editors={editors}
            canSetPrice={canSetPrice}
            onDone={(refusals) => {
              setOpen(false);
              onDone?.(refusals);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BulkAssignForm({
  videos,
  editors,
  canSetPrice,
  onDone,
  onCancel,
}: {
  videos: BulkAssignVideo[];
  editors: EditorChoice[];
  canSetPrice: boolean;
  onDone: (refusals: BulkRefusal[]) => void;
  onCancel: () => void;
}) {
  const tr = useT();
  const [preview, setPreview] = useState<BulkAssignmentPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const defaults: BulkAssignmentInput = {
    videoIds: videos.map((v) => v.id),
    editorId: "", role: "EDIT", isPrimary: true, scope: "", rateCardId: "", rateMode: "", unitPrice: "", currency: "",
    quantity: "", minuteRounding: "", includedRevisions: "", estimatedHours: "", startOn: "", dueMode: "VIDEO", dueOn: "", manualFxRate: "",
  };
  const { form, onSubmit, pending, err } = useServerForm({
    schema: bulkAssignmentSchema,
    defaultValues: defaults,
    action: assignEditorBulkAction,
    onSuccess: (r) => {
      const refusedCount = r.refusals.reduce((n, g) => n + g.refs.length, 0);
      const description = r.refusals.map((g) => `${g.message} (${g.refs.join(", ")})`).join(" · ");
      if (r.created > 0 && refusedCount === 0) toast.success(tr("{0} mission(s) créée(s).", [r.created]));
      else if (r.created > 0) toast.warning(tr("{0} mission(s) créée(s), {1} vidéo(s) ignorée(s).", [r.created, refusedCount]), { description, duration: 12000 });
      else toast.error(tr("Aucune mission créée."), { description, duration: 12000 });
      for (const w of r.warnings) toast.info(w);
      onDone(r.refusals);
    },
  });
  const { register, watch, getValues } = form;
  const editor = editors.find((e) => e.id === watch("editorId"));
  const dueMode = watch("dueMode");
  const reset = () => setPreview(null);

  function runPreview() {
    if (!getValues("editorId")) {
      toast.error(tr("Choisissez d'abord un prestataire."));
      return;
    }
    startPreview(async () => {
      const r = await previewBulkAssignmentAction(getValues());
      if (r.ok) setPreview(r.data);
      else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4" noValidate>
      <details className="rounded-lg border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold">{tr("{0} vidéo(s) sélectionnée(s)", [videos.length])}</summary>
        <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-subtle av-scroll">
          {videos.map((v) => <li key={v.id} className="truncate"><span className="num whitespace-nowrap text-faint">{v.reference}</span> — {v.title}</li>)}
        </ul>
      </details>
      <FormGrid>
        <Field label={tr("Prestataire")} htmlFor="b-editorId" required error={err("editorId")}>
          <NativeSelect {...register("editorId", { onChange: reset })}>
            <option value="">{tr("— Choisir —")}</option>
            {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Rôle de production")} htmlFor="b-role">
          <NativeSelect {...register("role", { onChange: reset })}>
            {Object.entries(ASSIGNMENT_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Tarif du catalogue")} htmlFor="b-rateCardId" hint={editor && editor.rateCards.length === 0 ? tr("Aucun tarif : coût « à renseigner ».") : undefined}>
          <NativeSelect {...register("rateCardId", { onChange: reset })} disabled={!editor}>
            <option value="">{tr("Aucun")}</option>
            {editor?.rateCards.map((r) => (
              <option key={r.id} value={r.id}>
                {tr(r.label)} — {tr(RATE_MODE_LABELS[r.mode as keyof typeof RATE_MODE_LABELS])}{r.unitPrice ? ` · ${r.unitPrice} ${r.currency}` : ""}{r.videoType ? ` · ${tr(VIDEO_TYPE_LABELS[r.videoType as keyof typeof VIDEO_TYPE_LABELS])}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={tr("Quantité par vidéo")} htmlFor="b-quantity" hint={tr("Vidéos, heures ou jours selon le mode")} error={err("quantity")}>
          <Input inputMode="decimal" placeholder="1" {...register("quantity", { onChange: reset })} />
        </Field>
      </FormGrid>
      {canSetPrice ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">{tr("Prix négocié pour ces missions (facultatif)")}</summary>
          <FormGrid className="mt-3">
            <Field label={tr("Mode")} htmlFor="b-rateMode">
              <NativeSelect {...register("rateMode", { onChange: reset })}>
                <option value="">{tr("Celui du tarif")}</option>
                {Object.entries(RATE_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
              </NativeSelect>
            </Field>
            <Field label={tr("Prix unitaire")} htmlFor="b-unitPrice" error={err("unitPrice")}><Input inputMode="decimal" {...register("unitPrice", { onChange: reset })} /></Field>
            <Field label={tr("Devise")} htmlFor="b-currency">
              <NativeSelect {...register("currency", { onChange: reset })}>
                <option value="">{tr("Celle du tarif / du prestataire")}</option>
                {Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
              </NativeSelect>
            </Field>
            <Field label={tr("Taux de change manuel (unités pour 1 €)")} htmlFor="b-manualFxRate" error={err("manualFxRate")} hint={tr("Requis pour IDR/USD sans taux de référence.")}>
              <Input inputMode="decimal" {...register("manualFxRate")} />
            </Field>
          </FormGrid>
        </details>
      ) : null}

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">{tr("Échéance des missions")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="VIDEO" {...register("dueMode", { onChange: reset })} className="mt-1 accent-[var(--av-accent)]" />
          <span>{tr("Celle de chaque vidéo")}<span className="block text-xs text-subtle">{tr("Deadline interne, sinon deadline client : visible au planning du monteur.")}</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" value="FIXED" {...register("dueMode", { onChange: reset })} className="mt-1 accent-[var(--av-accent)]" />
          <span>{tr("Une date commune")}</span>
        </label>
        {dueMode === "FIXED" ? (
          <Field label={tr("Échéance commune")} htmlFor="b-dueOn" required error={err("dueOn")} className="sm:max-w-xs">
            <Input type="date" {...register("dueOn", { onChange: reset })} />
          </Field>
        ) : null}
      </fieldset>

      <FormGrid className="md:grid-cols-3">
        <Field label={tr("Heures estimées / vidéo")} htmlFor="b-estimatedHours" error={err("estimatedHours")}>
          <Input inputMode="decimal" placeholder={tr("Celles de la vidéo")} {...register("estimatedHours", { onChange: reset })} />
        </Field>
        <Field label={tr("Début")} htmlFor="b-startOn" error={err("startOn")}><Input type="date" {...register("startOn")} /></Field>
        <Field label={tr("Périmètre")} htmlFor="b-scope"><Input {...register("scope")} placeholder={tr("Ex. montage + sous-titres")} /></Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("isPrimary")} className="accent-[var(--av-accent)]" />
        {tr("Affectation principale (les contributions secondaires restent possibles)")}</label>

      <div className="rounded-xl border border-brand-border bg-surface-2/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{tr("Coût total, charge et adéquation")}</p>
          <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={previewing}>
            {previewing ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />} {" "}{tr("Calculer l'impact")}</Button>
        </div>
        {preview ? <PreviewPanel preview={preview} /> : <p className="mt-2 text-xs text-faint">{tr("Calculez l'impact avant de confirmer (coût total, charge sur 7 jours).")}</p>}
      </div>
      <FormActions pending={pending} submitLabel={tr("Créer les missions")} onCancel={onCancel} />
    </form>
  );
}

function PreviewPanel({ preview }: { preview: BulkAssignmentPreview }) {
  const tr = useT();
  return (
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs text-subtle">{tr("Missions à créer")}</p>
        <p className="text-lg font-bold">{preview.eligible}</p>
        {preview.skipped.map((g) => (
          <p key={g.message} className="text-xs text-warning">{g.message} ({g.refs.length})</p>
        ))}
      </div>
      {preview.cost ? (
        <div>
          <p className="text-xs text-subtle">{tr("Coût total prévu")}</p>
          <p className="font-semibold">{preview.eligible === 0 ? "—" : <Money value={preview.cost.amount} currency={preview.cost.currency as CurrencyCode} />}</p>
          {preview.cost.currency !== "EUR" && preview.cost.amountEur ? <p className="text-xs text-subtle">≈ <Money value={preview.cost.amountEur} /></p> : null}
          {preview.cost.missing ? <p className="text-xs text-warning">{tr("{0} coût(s) à renseigner", [preview.cost.missing])}</p> : null}
          {preview.cost.envelope ? <p className="text-xs text-subtle">{tr("{0} mission(s) sous enveloppe mensuelle", [preview.cost.envelope])}</p> : null}
          {preview.cost.fxMissing ? <p className="text-xs text-warning">{tr("Taux de change manquant : saisissez un taux manuel.")}</p> : null}
          {preview.cost.basis ? <p className="text-xs text-faint">{preview.cost.basis}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-subtle">{tr("Montants masqués (accès financier non activé).")}</p>
      )}
      <div>
        <p className="text-xs text-subtle">{tr("Charge sur 7 jours")}</p>
        <p className={preview.load.overloaded ? "font-semibold text-danger" : "font-semibold"}>
          {preview.load.plannedHours} h → {(Number(preview.load.plannedHours) + Number(preview.load.addedHours)).toFixed(1)} h{preview.load.capacityHours ? ` / ${preview.load.capacityHours} h` : ""}
        </p>
        {preview.load.missingEstimates ? <p className="text-xs text-warning">{tr("{0} mission(s) sans estimation d'heures", [preview.load.missingEstimates])}</p> : null}
      </div>
      {preview.notes.length ? (
        <Notice tone="warning" className="sm:col-span-3">
          <ul className="list-disc pl-4">{preview.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Notice>
      ) : null}
    </div>
  );
}
