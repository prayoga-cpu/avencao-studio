"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS } from "@/lib/labels";
import { allocateEqually, parseDecimalInput, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import { setProjectPriceAction } from "./actions";
import { projectPriceSchema, type ProjectPriceInput } from "./schemas";
import { useT } from "#i18n";

/**
 * Prix d'un projet entier, enregistré comme une vente acceptée :
 * forfait global (réparti automatiquement sur les vidéos, y compris celles ajoutées ensuite)
 * ou prix par vidéo (quantité = vidéos actives).
 */
export function ProjectPriceDialog({
  projectId,
  projectTitle,
  today,
  activeVideos,
  existingSales,
  variant = "default",
}: {
  projectId: string;
  projectTitle: string;
  today: string;
  activeVideos: number;
  existingSales: number;
  variant?: "default" | "outline";
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          <Tag aria-hidden /> {" "}{tr("Prix du projet")}</Button>
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{tr("Prix du projet")}</DialogTitle>
          <DialogDescription>{tr("Enregistré comme une vente acceptée (prix figé) et réparti sur les vidéos pour le revenu et la marge de chacune. N'émet aucune facture.")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <PriceForm
            projectId={projectId}
            projectTitle={projectTitle}
            today={today}
            activeVideos={activeVideos}
            existingSales={existingSales}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({
  projectId,
  projectTitle,
  today,
  activeVideos,
  existingSales,
  onDone,
}: {
  projectId: string;
  projectTitle: string;
  today: string;
  activeVideos: number;
  existingSales: number;
  onDone: () => void;
}) {
  const tr = useT();
  const defaults: ProjectPriceInput = {
    projectId, mode: "FLAT", amount: "", acceptedOn: today, currency: "EUR", manualFxRate: "", title: projectTitle, includedRevisions: "", notes: "",
  };
  const { form, onSubmit, pending, err } = useServerForm({ schema: projectPriceSchema, defaultValues: defaults, action: setProjectPriceAction, onSuccess: onDone });
  const { register, watch } = form;
  const mode = watch("mode");
  const currency = watch("currency") as CurrencyCode;
  const amount = parseDecimalInput(watch("amount") ?? "");
  const perVideo = mode === "FLAT" && amount && activeVideos > 0 ? allocateEqually(amount, activeVideos, currency) : null;
  const total = mode === "PER_VIDEO" && amount ? amount.mul(activeVideos) : null;

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4" noValidate>
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold text-subtle">{tr("Type de prix")}</legend>
        {(
          [
            ["FLAT", tr("Forfait global"), tr("Un montant pour tout le projet, réparti à parts égales — y compris sur les vidéos ajoutées plus tard.")],
            ["PER_VIDEO", tr("Prix par vidéo"), tr("Prix unitaire × {0} vidéo(s) actuelle(s). Une vidéo ajoutée ensuite fera l'objet d'une nouvelle vente.", [activeVideos])],
          ] as const
        ).map(([value, label, help]) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors",
              mode === value ? "border-brand bg-brand-soft/50" : "border-border hover:border-brand-border",
            )}
          >
            <input type="radio" value={value} {...register("mode")} className="mt-1 accent-[var(--av-accent)]" />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-subtle">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormGrid>
        <Field label={mode === "FLAT" ? tr("Montant HT du forfait") : tr("Prix HT par vidéo")} htmlFor="pp-amount" required error={err("amount")}>
          <Input inputMode="decimal" placeholder="0,00" {...register("amount")} />
        </Field>
        <Field label={tr("Devise")} htmlFor="pp-currency">
          <NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
        </Field>
        {currency !== "EUR" ? (
          <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="pp-fx" error={err("manualFxRate")} hint={tr("Sinon : dernier taux de référence à la date d'acceptation.")}>
            <Input inputMode="decimal" {...register("manualFxRate")} />
          </Field>
        ) : null}
        <Field label={tr("Date d'acceptation")} htmlFor="pp-date" required error={err("acceptedOn")}><Input type="date" {...register("acceptedOn")} /></Field>
        <Field label={tr("Intitulé de la vente")} htmlFor="pp-title" required error={err("title")}><Input {...register("title")} /></Field>
        <Field label={tr("Retouches incluses")} htmlFor="pp-rev" error={err("includedRevisions")} hint={tr("Vide : celles du projet.")}><Input inputMode="numeric" {...register("includedRevisions")} /></Field>
        <Field label={tr("Notes")} htmlFor="pp-notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
      </FormGrid>

      <div className="rounded-xl border border-brand-border bg-surface-2/60 p-3 text-sm" aria-live="polite">
        {mode === "FLAT" ? (
          activeVideos === 0 ? (
            <p className="text-subtle">{tr("Aucune vidéo pour l'instant : le forfait sera réparti dès l'ajout des vidéos.")}</p>
          ) : perVideo ? (
            <p>
              {tr("{0} vidéo(s) active(s) :", [activeVideos])}{" "}
              <span className="font-semibold">≈ <Money value={perVideo[perVideo.length - 1].toFixed(2)} currency={currency} /></span>{" "}
              {tr("par vidéo (répartition automatique, somme exacte au centime).")}
            </p>
          ) : (
            <p className="text-subtle">{tr("Saisissez le montant : la part de chaque vidéo s'affiche ici.")}</p>
          )
        ) : total ? (
          <p>
            {activeVideos} × <Money value={amount!.toFixed(2)} currency={currency} /> = <span className="font-semibold"><Money value={total.toFixed(2)} currency={currency} /></span>
          </p>
        ) : (
          <p className="text-subtle">{tr("Saisissez le prix unitaire : le total s'affiche ici.")}</p>
        )}
      </div>
      {existingSales > 0 ? (
        <Notice tone="info">{tr("Ce projet a déjà {0} vente(s) : ce prix s'y ajoute. Pour remplacer un prix, annulez d'abord l'ancienne vente (fiche de la vente).", [existingSales])}</Notice>
      ) : null}
      <FormActions pending={pending} submitLabel={tr("Enregistrer le prix")} onCancel={onDone} />
    </form>
  );
}
