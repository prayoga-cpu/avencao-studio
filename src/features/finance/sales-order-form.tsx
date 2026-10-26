"use client";

import { emptyLine } from "@/features/finance/schemas";

import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { createSalesOrderAction } from "./actions";
import { salesOrderSchema, type SalesLineInput, type SalesOrderInput } from "./schemas";
import { useT } from "#i18n";

export interface VideoChoice {
  id: string;
  reference: string;
  title: string;
  projectId: string;
}

export interface CatalogChoice {
  id: string;
  name: string;
  unitPrice: string;
  currency: string;
  videoType: string | null;
  includedRevisions: number | null;
}


export function SalesOrderForm({
  defaults,
  clients,
  projects,
  videos,
  catalog,
}: {
  defaults: SalesOrderInput;
  clients: { value: string; label: string }[];
  projects: { value: string; label: string; clientId: string }[];
  videos: VideoChoice[];
  catalog: CatalogChoice[];
}) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: salesOrderSchema,
    defaultValues: defaults,
    action: createSalesOrderAction,
    refresh: false,
    onSuccess: (data) => {
      router.push(`/finances/ventes/${data.id}`);
      router.refresh();
    },
  });
  const { register, watch, setValue, control } = form;
  const lines = useFieldArray({ control, name: "lines" });
  const clientId = watch("clientId");
  const projectId = watch("projectId");
  const availableVideos = videos.filter((v) => !projectId || v.projectId === projectId);
  /** Projet choisi : toutes ses vidéos sont cochées d'emblée (une vente « parts égales » sans vidéo n'est répartie sur rien). */
  const projectAllocations = (pid: string) => videos.filter((v) => v.projectId === pid).map((v) => ({ videoId: v.id, value: "" }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title={tr("Vente acceptée")} description={tr("Les prix sont figés à l'acceptation. Les devis non acceptés restent dans la prospection (prévisionnel).")}>
        <FormGrid>
          <Field label={tr("Client")} htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect
              {...register("clientId", {
                onChange: () => {
                  setValue("projectId", "");
                  lines.fields.forEach((_, i) => {
                    setValue(`lines.${i}.allocations`, []);
                    setValue(`lines.${i}.autoAllocate`, false);
                  });
                },
              })}
            >
              <option value="">{tr("— Choisir —")}</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Projet")} htmlFor="projectId" hint={tr("Permet de répartir la vente entre ses vidéos.")}>
            <NativeSelect
              {...register("projectId", {
                onChange: (e) => {
                  const pid = e.target.value as string;
                  lines.fields.forEach((_, i) => {
                    setValue(`lines.${i}.allocations`, pid ? projectAllocations(pid) : []);
                    if (!pid) setValue(`lines.${i}.autoAllocate`, false);
                  });
                },
              })}
            >
              <option value="">{tr("Aucun")}</option>
              {projects.filter((p) => !clientId || p.clientId === clientId).map((p) => <option key={p.value} value={p.value}>{tr(p.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Intitulé")} htmlFor="title" required error={err("title")}><Input {...register("title")} /></Field>
          <Field label={tr("Date d'acceptation")} htmlFor="acceptedOn" required error={err("acceptedOn")}><Input type="date" {...register("acceptedOn")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency">
            <NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          {watch("currency") !== "EUR" ? (
            <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")} hint={tr("Sinon : dernier taux de référence à la date d'acceptation.")}>
              <Input inputMode="decimal" {...register("manualFxRate")} />
            </Field>
          ) : null}
          <Field label={tr("Notes")} htmlFor="notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>

      {lines.fields.map((field, index) => {
        const method = watch(`lines.${index}.allocationMethod`);
        const auto = !!projectId && method === "EQUAL" && !!watch(`lines.${index}.autoAllocate`);
        const allocations = watch(`lines.${index}.allocations`) ?? [];
        const setAlloc = (next: { videoId: string; value: string }[]) => setValue(`lines.${index}.allocations`, next, { shouldDirty: true });
        return (
          <FormSection key={field.id} title={tr("Ligne {0}", [index + 1])}>
            <FormGrid className="md:grid-cols-4">
              {catalog.length ? (
                <Field label={tr("Prestation du catalogue")} htmlFor={`l${index}-cat`} className="md:col-span-2">
                  <NativeSelect
                    {...register(`lines.${index}.catalogItemId`, {
                      onChange: (e) => {
                        const c = catalog.find((x) => x.id === e.target.value);
                        if (c) {
                          setValue(`lines.${index}.description`, c.name);
                          setValue(`lines.${index}.unitPrice`, c.unitPrice);
                          setValue(`lines.${index}.videoType`, (c.videoType ?? "") as SalesLineInput["videoType"]);
                          setValue(`lines.${index}.includedRevisions`, c.includedRevisions?.toString() ?? "");
                        }
                      },
                    })}
                  >
                    <option value="">{tr("Saisie libre")}</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.unitPrice} {c.currency}</option>)}
                  </NativeSelect>
                </Field>
              ) : null}
              <Field label={tr("Description")} htmlFor={`l${index}-desc`} required error={err(`lines.${index}.description`)} className="md:col-span-2"><Input {...register(`lines.${index}.description`)} /></Field>
              <Field label={tr("Type")} htmlFor={`l${index}-type`}>
                <NativeSelect {...register(`lines.${index}.videoType`)}>
                  <option value="">—</option>
                  {Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
                </NativeSelect>
              </Field>
              <Field label={tr("Quantité")} htmlFor={`l${index}-qty`} error={err(`lines.${index}.quantity`)}><Input inputMode="decimal" {...register(`lines.${index}.quantity`)} /></Field>
              <Field label={tr("Prix unitaire HT négocié")} htmlFor={`l${index}-price`} required error={err(`lines.${index}.unitPrice`)}><Input inputMode="decimal" {...register(`lines.${index}.unitPrice`)} /></Field>
              <Field label={tr("Remise HT")} htmlFor={`l${index}-disc`} error={err(`lines.${index}.discount`)}><Input inputMode="decimal" {...register(`lines.${index}.discount`)} /></Field>
              <Field label={tr("Retouches incluses")} htmlFor={`l${index}-rev`}><Input inputMode="numeric" {...register(`lines.${index}.includedRevisions`)} /></Field>
            </FormGrid>
            <div className="mt-4 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold">{tr("Répartition analytique entre livrables")}</p>
                <NativeSelect aria-label={tr("Méthode de répartition")} className="w-auto" {...register(`lines.${index}.allocationMethod`)}>
                  <option value="NONE">{tr("Plus tard")}</option>
                  <option value="EQUAL">{tr("Parts égales")}</option>
                  <option value="WEIGHTED">{tr("Pondération")}</option>
                  <option value="MANUAL">{tr("Montants manuels")}</option>
                </NativeSelect>
              </div>
              <p className="mt-1 text-xs text-faint">{tr("Interne : la somme est exactement égale au net de la ligne (centimes résiduels attribués de façon stable). Jamais ajoutée au prix du pack.")}</p>
              {projectId && method === "EQUAL" ? (
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input type="checkbox" {...register(`lines.${index}.autoAllocate`)} className="mt-1 accent-[var(--av-accent)]" />
                  <span>
                    {tr("Forfait : répartir automatiquement sur toutes les vidéos actives du projet")}
                    <span className="block text-xs text-subtle">{tr("Les vidéos ajoutées ou annulées plus tard sont prises en compte (parts égales recalculées).")}</span>
                  </span>
                </label>
              ) : null}
              {auto ? null : method !== "NONE" ? (
                availableVideos.length === 0 ? (
                  <p className="mt-2 text-sm text-warning">{tr("Choisissez un projet contenant des vidéos pour répartir la vente.")}</p>
                ) : (
                  <>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="xs" variant="outline" onClick={() => setAlloc(availableVideos.map((v) => ({ videoId: v.id, value: allocations.find((a) => a.videoId === v.id)?.value ?? "" })))}>{tr("Tout cocher")}</Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setAlloc([])}>{tr("Tout décocher")}</Button>
                    </div>
                    <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {availableVideos.map((v) => {
                        const current = allocations.find((a) => a.videoId === v.id);
                        return (
                          <li key={v.id} className="flex min-w-0 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              aria-label={tr("Inclure {0}", [v.reference])}
                              className="accent-[var(--av-accent)]"
                              checked={!!current}
                              onChange={(e) => setAlloc(e.target.checked ? [...allocations, { videoId: v.id, value: "" }] : allocations.filter((a) => a.videoId !== v.id))}
                            />
                            <span className="min-w-0 flex-1 truncate">{v.reference} — {v.title}</span>
                            {current && method !== "EQUAL" ? (
                              <Input
                                aria-label={method === "WEIGHTED" ? tr("Poids {0}", [v.reference]) : tr("Montant {0}", [v.reference])}
                                className="h-7 w-24"
                                inputMode="decimal"
                                placeholder={method === "WEIGHTED" ? tr("poids") : tr("montant")}
                                value={current.value}
                                onChange={(e) => setAlloc(allocations.map((a) => (a.videoId === v.id ? { ...a, value: e.target.value } : a)))}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )
              ) : null}
            </div>
            {lines.fields.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => lines.remove(index)}>
                <Trash2 aria-hidden /> {" "}{tr("Retirer la ligne")}</Button>
            ) : null}
          </FormSection>
        );
      })}
      <Button type="button" variant="outline" className="self-start" onClick={() => lines.append({ ...emptyLine(), allocations: projectId ? projectAllocations(projectId) : [] })}>
        <Plus aria-hidden /> {" "}{tr("Ajouter une ligne")}</Button>
      <FormActions pending={pending} submitLabel={tr("Enregistrer la vente")} cancelHref="/finances?onglet=ventes" />
    </form>
  );
}

