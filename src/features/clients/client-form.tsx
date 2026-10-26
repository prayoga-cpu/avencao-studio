"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_KIND_LABELS, CLIENT_STATUS, CURRENCY_LABELS } from "@/lib/labels";
import { createClientAction, updateClientAction } from "./actions";
import { clientSchema, type ClientInput } from "./schemas";
import { useT } from "#i18n";

type Dup = { id: string; displayName: string; reason: string };

export function ClientForm({
  clientId,
  defaults,
  owners,
  canArchive,
}: {
  clientId?: string;
  defaults: ClientInput;
  owners: { value: string; label: string }[];
  canArchive: boolean;
}) {
  const tr = useT();
  const router = useRouter();
  const [duplicates, setDuplicates] = useState<Dup[] | null>(null);
  const { form, onSubmit, pending, err } = useServerForm({
    schema: clientSchema,
    defaultValues: defaults,
    action: (values) => (clientId ? updateClientAction(clientId, values) : createClientAction(values)),
    refresh: false,
    onSuccess: (data) => {
      if ("duplicates" in data) {
        setDuplicates(data.duplicates);
        return;
      }
      router.push(`/clients/${data.id}`);
      router.refresh();
    },
  });
  const { register } = form;
  const isNew = !clientId;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {duplicates ? (
        <Notice tone="warning" title={tr("Client possiblement déjà enregistré")}>
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/clients/${d.id}`} className="underline" target="_blank">
                  {d.displayName}
                </Link>{" "}
                — {d.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2">{tr("Aucune fusion n'est faite automatiquement. Vérifiez, puis confirmez si c'est bien un autre client.")}</p>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => {
              form.setValue("confirmDuplicate", true);
              setDuplicates(null);
              void onSubmit();
            }}
          >
            {tr("Enregistrer quand même")}</Button>
        </Notice>
      ) : null}

      <FormSection title={tr("Identité")}>
        <FormGrid>
          <Field label={tr("Nom commercial")} htmlFor="displayName" required error={err("displayName")}>
            <Input {...register("displayName")} autoComplete="organization" />
          </Field>
          <Field label={tr("Type")} htmlFor="kind">
            <NativeSelect {...register("kind")}>
              {Object.entries(CLIENT_KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{tr(l)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={tr("Statut")} htmlFor="status" hint={tr("Distinct de l'avancement des opportunités commerciales.")}>
            <NativeSelect {...register("status")}>
              {Object.entries(CLIENT_STATUS)
                .filter(([v]) => canArchive || v !== "ARCHIVED" || defaults.status === "ARCHIVED")
                .map(([v, s]) => (
                  <option key={v} value={v} disabled={!canArchive && v === "ARCHIVED"}>{tr(s.label)}</option>
                ))}
            </NativeSelect>
          </Field>
          <Field label={tr("Raison sociale")} htmlFor="legalName" error={err("legalName")}>
            <Input {...register("legalName")} />
          </Field>
          <Field label={tr("Étiquettes")} htmlFor="tags" hint={tr("Séparées par des virgules (ex. Reels, Coaching).")} error={err("tags")} className="md:col-span-2">
            <Input {...register("tags")} />
          </Field>
        </FormGrid>
      </FormSection>

      {isNew ? (
        <FormSection title={tr("Contact principal")} description={tr("D'autres contacts pourront être ajoutés depuis la fiche.")}>
          <FormGrid>
            <Field label={tr("Prénom")} htmlFor="contactFirstName" error={err("contactFirstName")}>
              <Input {...register("contactFirstName")} autoComplete="given-name" />
            </Field>
            <Field label={tr("Nom")} htmlFor="contactLastName" error={err("contactLastName")}>
              <Input {...register("contactLastName")} autoComplete="family-name" />
            </Field>
            <Field label={tr("Fonction")} htmlFor="contactJobTitle">
              <Input {...register("contactJobTitle")} />
            </Field>
            <Field label={tr("Email du contact")} htmlFor="contactEmail" error={err("contactEmail")}>
              <Input type="email" {...register("contactEmail")} />
            </Field>
            <Field label={tr("Téléphone du contact")} htmlFor="contactPhone">
              <Input type="tel" {...register("contactPhone")} />
            </Field>
          </FormGrid>
        </FormSection>
      ) : null}

      <FormSection title={tr("Coordonnées")}>
        <FormGrid>
          <Field label={tr("Email")} htmlFor="email" error={err("email")}>
            <Input type="email" {...register("email")} autoComplete="email" />
          </Field>
          <Field label={tr("Téléphone")} htmlFor="phone">
            <Input type="tel" {...register("phone")} />
          </Field>
          <Field label={tr("WhatsApp")} htmlFor="whatsapp">
            <Input type="tel" {...register("whatsapp")} />
          </Field>
          <Field label={tr("Pays")} htmlFor="country">
            <Input {...register("country")} autoComplete="country-name" />
          </Field>
          <Field label={tr("Adresse de facturation")} htmlFor="billingAddress" className="md:col-span-2">
            <Textarea rows={2} {...register("billingAddress")} />
          </Field>
          <Field label={tr("N° TVA intracommunautaire")} htmlFor="vatNumber" hint={tr("Facultatif")}>
            <Input {...register("vatNumber")} />
          </Field>
          <Field label={tr("Identifiant administratif (SIRET, NIB…)")} htmlFor="companyRegistration" hint={tr("Facultatif")}>
            <Input {...register("companyRegistration")} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Web et réseaux sociaux")}>
        <FormGrid>
          <Field label={tr("Site web")} htmlFor="website" error={err("website")}>
            <Input type="url" placeholder={tr("https://")} {...register("website")} />
          </Field>
          <Field label={tr("Instagram")} htmlFor="instagram">
            <Input {...register("instagram")} placeholder={tr("@compte")} />
          </Field>
          <Field label={tr("TikTok")} htmlFor="tiktok">
            <Input {...register("tiktok")} />
          </Field>
          <Field label={tr("YouTube")} htmlFor="youtube">
            <Input {...register("youtube")} />
          </Field>
          <Field label={tr("LinkedIn")} htmlFor="linkedin">
            <Input {...register("linkedin")} />
          </Field>
          <Field label={tr("Autre")} htmlFor="otherSocial">
            <Input {...register("otherSocial")} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Relation commerciale")}>
        <FormGrid>
          <Field label={tr("Source d'acquisition")} htmlFor="acquisitionSource">
            <Input {...register("acquisitionSource")} placeholder={tr("Recommandation, Instagram, salon…")} />
          </Field>
          <Field label={tr("Responsable interne")} htmlFor="ownerId">
            <NativeSelect {...register("ownerId")}>
              <option value="">—</option>
              {owners.map((o) => (
                <option key={o.value} value={o.value}>{tr(o.label)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={tr("Devise habituelle")} htmlFor="currency">
            <NativeSelect {...register("currency")}>
              {Object.entries(CURRENCY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{tr(l)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={tr("Délai de paiement (jours)")} htmlFor="paymentTermsDays" error={err("paymentTermsDays")}>
            <Input inputMode="numeric" {...register("paymentTermsDays")} />
          </Field>
          <Field label={tr("Prochaine relance")} htmlFor="nextFollowUpOn" error={err("nextFollowUpOn")}>
            <Input type="date" {...register("nextFollowUpOn")} />
          </Field>
          <Field label={tr("Dossier Google Drive")} htmlFor="driveUrl" error={err("driveUrl")}>
            <Input type="url" placeholder={tr("https://drive.google.com/…")} {...register("driveUrl")} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title={tr("Créatif et notes internes")}>
        <div className="grid gap-4">
          <Field label={tr("Préférences créatives")} htmlFor="creativePreferences">
            <Textarea rows={3} {...register("creativePreferences")} />
          </Field>
          <Field label={tr("Références")} htmlFor="references">
            <Textarea rows={3} {...register("references")} />
          </Field>
          <Field label={tr("Notes internes")} htmlFor="internalNotes" hint={tr("Jamais visibles des monteurs.")}>
            <Textarea rows={3} {...register("internalNotes")} />
          </Field>
        </div>
      </FormSection>

      <FormActions pending={pending} submitLabel={isNew ? tr("Créer le client") : tr("Enregistrer")} cancelHref={clientId ? `/clients/${clientId}` : "/clients"} />
    </form>
  );
}
