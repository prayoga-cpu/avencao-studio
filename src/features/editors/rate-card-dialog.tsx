"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ASSIGNMENT_ROLE_LABELS, CURRENCY_LABELS, MINUTE_ROUNDING_LABELS, RATE_MODE_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { saveRateCardAction } from "./actions";
import { rateCardSchema, type RateCardInput } from "./schemas";

export function RateCardDialog({ editorId, defaults, today, trigger }: { editorId: string; defaults?: Partial<RateCardInput>; today: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus aria-hidden /> Nouveau tarif
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tarif négocié</DialogTitle>
          <DialogDescription>Le tarif est copié dans chaque mission au moment de l&apos;affectation : le modifier ne change pas les missions existantes.</DialogDescription>
        </DialogHeader>
        {open ? <RateCardForm editorId={editorId} defaults={defaults} today={today} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RateCardForm({ editorId, defaults, today, onDone }: { editorId: string; defaults?: Partial<RateCardInput>; today: string; onDone: () => void }) {
  const { form, onSubmit, pending, err } = useServerForm({
    schema: rateCardSchema,
    defaultValues: {
      editorId, id: "", label: "", videoType: "", productionRole: "EDIT", mode: "PER_VIDEO", unitPrice: "", currency: "EUR",
      unitLabel: "", defaultQuantity: "", minuteRounding: "", includedRevisions: "", validFrom: today, validTo: "", notes: "",
      ...defaults,
    },
    action: saveRateCardAction,
    onSuccess: onDone,
  });
  const { register, watch } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label="Libellé" htmlFor="rc-label" required error={err("label")}><Input {...register("label")} placeholder="Ex. Montage Reel 30–60 s" /></Field>
        <Field label="Mode" htmlFor="rc-mode">
          <NativeSelect {...register("mode")}>
            {Object.entries(RATE_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Format concerné" htmlFor="rc-videoType">
          <NativeSelect {...register("videoType")}>
            <option value="">Tous formats</option>
            {Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Rôle de production" htmlFor="rc-role">
          <NativeSelect {...register("productionRole")}>
            <option value="">Tous rôles</option>
            {Object.entries(ASSIGNMENT_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Prix unitaire" htmlFor="rc-price" required error={err("unitPrice")}><Input inputMode="decimal" {...register("unitPrice")} /></Field>
        <Field label="Devise" htmlFor="rc-currency">
          <NativeSelect {...register("currency")}>
            {Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        {watch("mode") === "PER_FINAL_MINUTE" ? (
          <Field label="Arrondi de la durée finale" htmlFor="rc-rounding" required error={err("minuteRounding")} hint="Règle explicite appliquée au calcul.">
            <NativeSelect {...register("minuteRounding")}>
              <option value="">— Choisir —</option>
              {Object.entries(MINUTE_ROUNDING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
        <Field label="Quantité par défaut" htmlFor="rc-qty" hint="Heures, jours ou nombre de vidéos" error={err("defaultQuantity")}><Input inputMode="decimal" {...register("defaultQuantity")} /></Field>
        <Field label="Unité (libellé)" htmlFor="rc-unit"><Input {...register("unitLabel")} placeholder="vidéo, heure, jour…" /></Field>
        <Field label="Retouches incluses" htmlFor="rc-rev" error={err("includedRevisions")}><Input inputMode="numeric" {...register("includedRevisions")} /></Field>
        <Field label="Valide du" htmlFor="rc-from" required error={err("validFrom")}><Input type="date" {...register("validFrom")} /></Field>
        <Field label="Valide jusqu'au" htmlFor="rc-to" error={err("validTo")}><Input type="date" {...register("validTo")} /></Field>
        <Field label="Notes" htmlFor="rc-notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
      </FormGrid>
      <FormActions pending={pending} onCancel={onDone} />
    </form>
  );
}
