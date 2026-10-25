"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Notice } from "@/components/app/notice";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_LABELS, MINUTE_ROUNDING_LABELS, ROLE_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";
import { saveCatalogItemAction } from "@/features/finance/actions";
import { catalogItemSchema, type CatalogItemInput } from "@/features/finance/schemas";
import {
  addChecklistItemAction,
  addExpenseCategoryAction,
  inviteUserAction,
  resetLinkAction,
  saveTemplateAction,
  updateAgencySettingsAction,
  updateUserAccessAction,
} from "./actions";
import { agencySettingsSchema, inviteSchema, templateSchema, type AgencySettingsInput, type InviteInput, type TemplateInput } from "./schemas";

export function AgencySettingsForm({ defaults }: { defaults: AgencySettingsInput }) {
  const { form, onSubmit, pending, err } = useServerForm({ schema: agencySettingsSchema, defaultValues: defaults, action: updateAgencySettingsAction });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title="Agence">
        <FormGrid>
          <Field label="Nom" htmlFor="name" required error={err("name")}><Input {...register("name")} /></Field>
          <Field label="Fuseau horaire" htmlFor="timezone" required error={err("timezone")} hint="Échéances interprétées dans ce fuseau ; instants stockés en UTC."><Input {...register("timezone")} /></Field>
          <Field label="Devise de reporting" htmlFor="currency" hint="Les coûts restent saisissables en EUR, IDR et USD."><Input id="currency" value="EUR — Euro" disabled readOnly /></Field>
          <Field label="Préfixe des références vidéo" htmlFor="videoRefPrefix" error={err("videoRefPrefix")} hint="Ex. AV → AV-2026-0042"><Input {...register("videoRefPrefix")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Rentabilité">
        <FormGrid>
          <Field label="Seuil d'alerte de taux de marge (%)" htmlFor="marginThresholdPct" error={err("marginThresholdPct")}><Input inputMode="decimal" {...register("marginThresholdPct")} /></Field>
          <Field label="Taux interne du dirigeant (€/h)" htmlFor="ownerHourlyRate" error={err("ownerHourlyRate")} hint="Valorisation analytique séparée, jamais une sortie de trésorerie."><Input inputMode="decimal" {...register("ownerHourlyRate")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("ownerTimeIncludedInCosts")} className="accent-[var(--av-accent)]" /> Ce temps est déjà compris dans un coût (pas de double comptage)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("nonRecoverableVatInCost")} className="accent-[var(--av-accent)]" /> Intégrer la TVA non récupérable aux coûts</label>
          <Field label="Ventilation analytique des charges par client" htmlFor="overheadMethod" hint="Affichée à part de la marge directe.">
            <NativeSelect {...register("overheadMethod")}>
              <option value="NONE">Aucune</option>
              <option value="REVENUE">Au prorata du CA alloué</option>
              <option value="HOURS">Au prorata des heures saisies</option>
            </NativeSelect>
          </Field>
          <Field label="Délai de paiement par défaut (jours)" htmlFor="defaultPaymentTermsDays" error={err("defaultPaymentTermsDays")}><Input inputMode="numeric" {...register("defaultPaymentTermsDays")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Production">
        <FormGrid>
          <Field label="Allers-retours inclus par défaut" htmlFor="defaultIncludedRevisions" error={err("defaultIncludedRevisions")}><Input inputMode="numeric" {...register("defaultIncludedRevisions")} /></Field>
          <Field label="Arrondi par défaut (tarifs à la minute)" htmlFor="defaultMinuteRounding">
            <NativeSelect {...register("defaultMinuteRounding")}>{Object.entries(MINUTE_ROUNDING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
          </Field>
          <Field label="Définition d'un aller-retour" htmlFor="revisionRoundDefinition" error={err("revisionRoundDefinition")} className="md:col-span-2"><Textarea rows={2} {...register("revisionRoundDefinition")} /></Field>
          <Field label="Corrections dues à une erreur de production" htmlFor="productionErrorPolicy" error={err("productionErrorPolicy")} className="md:col-span-2"><Textarea rows={2} {...register("productionErrorPolicy")} /></Field>
          <Field label="Alerte « deadline proche » (jours)" htmlFor="deadlineSoonDays" error={err("deadlineSoonDays")}><Input inputMode="numeric" {...register("deadlineSoonDays")} /></Field>
          <Field label="Taille maximale des pièces jointes (Mo)" htmlFor="maxUploadMb" error={err("maxUploadMb")}><Input inputMode="numeric" {...register("maxUploadMb")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} />
    </form>
  );
}

function CopyLink({ url, emailSent, hours }: { url: string; emailSent: boolean; hours: number }) {
  return (
    <Notice tone={emailSent ? "success" : "warning"} title={emailSent ? "Email envoyé" : "Aucun email envoyé : transmettez ce lien vous-même"}>
      <p className="mb-2">Lien personnel, valable {hours} h, utilisable une seule fois.</p>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label="Lien" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien copié."))}>
          <Copy aria-hidden /> Copier
        </Button>
      </div>
    </Notice>
  );
}

export function InviteForm({ editors, defaultEditorId }: { editors: { value: string; label: string; email: string | null }[]; defaultEditorId?: string }) {
  const [link, setLink] = useState<{ url: string; emailSent: boolean; expiresInHours: number } | null>(null);
  const preset = editors.find((e) => e.value === defaultEditorId);
  const { form, onSubmit, pending, err } = useServerForm({
    schema: inviteSchema,
    defaultValues: { email: preset?.email ?? "", name: preset?.label ?? "", role: preset ? "EDITOR" : "PRODUCTION_MANAGER", financeAccess: false, editorId: preset?.value ?? "" } satisfies InviteInput,
    action: inviteUserAction,
    onSuccess: (r) => {
      setLink(r);
      form.reset({ email: "", name: "", role: "PRODUCTION_MANAGER", financeAccess: false, editorId: "" });
    },
  });
  const { register, watch } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label="Email" htmlFor="inv-email" required error={err("email")}><Input type="email" {...register("email")} /></Field>
        <Field label="Nom" htmlFor="inv-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label="Rôle" htmlFor="inv-role" hint="Défini par l'administrateur ; jamais modifiable par l'invité.">
          <NativeSelect {...register("role")}>
            {(["PRODUCTION_MANAGER", "EDITOR", "ADMIN"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </NativeSelect>
        </Field>
        {watch("role") === "EDITOR" ? (
          <Field label="Fiche prestataire liée" htmlFor="inv-editor" hint="Le monteur ne verra que ses missions et sa rémunération.">
            <NativeSelect {...register("editorId")}>
              <option value="">— (à lier plus tard)</option>
              {editors.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
        {watch("role") === "PRODUCTION_MANAGER" ? (
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("financeAccess")} className="accent-[var(--av-accent)]" />
            Activer l&apos;accès financier (ventes, factures, coûts, marges projet — sans marge globale)
          </label>
        ) : null}
      </FormGrid>
      {link ? <CopyLink url={link.url} emailSent={link.emailSent} hours={link.expiresInHours} /> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Créer l&apos;invitation</Button>
      </div>
    </form>
  );
}

export function UserAccessEditor({ user, isSelf }: { user: { id: string; role: Role; financeAccess: boolean; status: string; legacyRole: string | null; suggestedRole: Role | null }; isSelf: boolean }) {
  const [role, setRole] = useState<Role>(user.role);
  const [finance, setFinance] = useState(user.financeAccess);
  const [active, setActive] = useState(user.status === "ACTIVE");
  const [link, setLink] = useState<{ url: string; emailSent: boolean; expiresInHours: number } | null>(null);
  const { pending, run } = useAction();
  const changed = role !== user.role || finance !== user.financeAccess || active !== (user.status === "ACTIVE");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Rôle" className="w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
          {(["ADMIN", "PRODUCTION_MANAGER", "EDITOR", "VISITOR"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
        {role === "PRODUCTION_MANAGER" ? (
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={finance} onChange={(e) => setFinance(e.target.checked)} className="accent-[var(--av-accent)]" /> Accès financier</label>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--av-accent)]" /> Actif</label>
        {changed ? (
          <Button size="xs" disabled={pending} onClick={() => run(() => updateUserAccessAction(user.id, { role, financeAccess: finance, status: active ? "ACTIVE" : "DISABLED" }))}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Enregistrer
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => resetLinkAction(user.id), { onSuccess: setLink, refresh: false })}>
          <KeyRound aria-hidden /> Lien mot de passe
        </Button>
      </div>
      {user.suggestedRole && user.status !== "ACTIVE" ? (
        <p className="text-xs text-warning">Compte importé (ancien rôle « {user.legacyRole} ») : rôle suggéré {ROLE_LABELS[user.suggestedRole]} — à confirmer explicitement.</p>
      ) : null}
      {link ? <CopyLink url={link.url} emailSent={link.emailSent} hours={link.expiresInHours} /> : null}
    </div>
  );
}

export function SimpleAddForm({ label, placeholder, kind }: { label: string; placeholder: string; kind: "checklist" | "category" }) {
  const [value, setValue] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (kind === "checklist" ? addChecklistItemAction(value) : addExpenseCategoryAction(value)), { onSuccess: () => setValue("") });
      }}
    >
      <Input aria-label={label} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" size="sm" disabled={pending || !value.trim()}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Ajouter</Button>
    </form>
  );
}

export function CatalogItemDialog({ item, trigger }: { item?: CatalogItemInput; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prestation du catalogue</DialogTitle>
          <DialogDescription>Prix de vente HT indicatif ; le prix négocié est figé sur chaque vente acceptée.</DialogDescription>
        </DialogHeader>
        {open ? <CatalogForm item={item} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CatalogForm({ item, onDone }: { item?: CatalogItemInput; onDone: () => void }) {
  const { form, onSubmit, pending, err } = useServerForm({
    schema: catalogItemSchema,
    defaultValues: item ?? { id: "", name: "", description: "", videoType: "", unit: "vidéo", unitPrice: "", currency: "EUR", includedRevisions: "", turnaroundDays: "", targetCost: "", active: true },
    action: saveCatalogItemAction,
    onSuccess: onDone,
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label="Nom" htmlFor="ci-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label="Type" htmlFor="ci-type"><NativeSelect {...register("videoType")}><option value="">—</option>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
        <Field label="Unité" htmlFor="ci-unit" required error={err("unit")}><Input {...register("unit")} /></Field>
        <Field label="Prix de vente HT" htmlFor="ci-price" required error={err("unitPrice")}><Input inputMode="decimal" {...register("unitPrice")} /></Field>
        <Field label="Devise" htmlFor="ci-cur"><NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
        <Field label="Retouches incluses" htmlFor="ci-rev" error={err("includedRevisions")}><Input inputMode="numeric" {...register("includedRevisions")} /></Field>
        <Field label="Délai (jours)" htmlFor="ci-days" error={err("turnaroundDays")}><Input inputMode="numeric" {...register("turnaroundDays")} /></Field>
        <Field label="Coût cible (facultatif)" htmlFor="ci-target" error={err("targetCost")}><Input inputMode="decimal" {...register("targetCost")} /></Field>
        <Field label="Description" htmlFor="ci-desc" className="md:col-span-2"><Textarea rows={2} {...register("description")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("active")} className="accent-[var(--av-accent)]" /> Active</label>
      </FormGrid>
      <FormActions pending={pending} onCancel={onDone} />
    </form>
  );
}

export function TemplateDialog({ item, trigger }: { item?: TemplateInput; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Modèle de projet</DialogTitle></DialogHeader>
        {open ? <TemplateForm item={item} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({ item, onDone }: { item?: TemplateInput; onDone: () => void }) {
  const { form, onSubmit, pending, err } = useServerForm({
    schema: templateSchema,
    defaultValues: item ?? { id: "", name: "", description: "", videoType: "REEL", defaultVideoCount: "1", defaultRatio: "", defaultFormat: "", defaultExpectedSec: "", defaultIncludedRevisions: "", defaultEstimatedHours: "", titlePattern: "{type} {n}", active: true },
    action: saveTemplateAction,
    onSuccess: onDone,
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label="Nom" htmlFor="tp-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label="Type de vidéo" htmlFor="tp-type"><NativeSelect {...register("videoType")}>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
        <Field label="Nombre de vidéos" htmlFor="tp-count" error={err("defaultVideoCount")}><Input inputMode="numeric" {...register("defaultVideoCount")} /></Field>
        <Field label="Modèle de titre" htmlFor="tp-title" error={err("titlePattern")} hint="{type}, {n}"><Input {...register("titlePattern")} /></Field>
        <Field label="Ratio" htmlFor="tp-ratio"><Input {...register("defaultRatio")} /></Field>
        <Field label="Format" htmlFor="tp-format"><Input {...register("defaultFormat")} /></Field>
        <Field label="Durée attendue (s)" htmlFor="tp-sec" error={err("defaultExpectedSec")}><Input inputMode="numeric" {...register("defaultExpectedSec")} /></Field>
        <Field label="Allers-retours inclus" htmlFor="tp-rev" error={err("defaultIncludedRevisions")}><Input inputMode="numeric" {...register("defaultIncludedRevisions")} /></Field>
        <Field label="Heures estimées / vidéo" htmlFor="tp-hours" error={err("defaultEstimatedHours")}><Input inputMode="decimal" {...register("defaultEstimatedHours")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("active")} className="accent-[var(--av-accent)]" /> Actif</label>
        <Field label="Description" htmlFor="tp-desc" className="md:col-span-2"><Textarea rows={2} {...register("description")} /></Field>
      </FormGrid>
      <FormActions pending={pending} onCancel={onDone} />
    </form>
  );
}
