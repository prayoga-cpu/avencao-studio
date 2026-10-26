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
  setUserPasswordAction,
  saveTemplateAction,
  updateAgencySettingsAction,
  updateUserAccessAction,
} from "./actions";
import { agencySettingsSchema, inviteSchema, templateSchema, type AgencySettingsInput, type InviteInput, type TemplateInput } from "./schemas";
import { useT } from "#i18n";
import { PasswordInput } from "@/components/app/password-input";

export function AgencySettingsForm({ defaults }: { defaults: AgencySettingsInput }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({ schema: agencySettingsSchema, defaultValues: defaults, action: updateAgencySettingsAction });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title={tr("Agence")}>
        <FormGrid>
          <Field label={tr("Nom")} htmlFor="name" required error={err("name")}><Input {...register("name")} /></Field>
          <Field label={tr("Fuseau horaire")} htmlFor="timezone" required error={err("timezone")} hint={tr("Échéances interprétées dans ce fuseau ; instants stockés en UTC.")}><Input {...register("timezone")} /></Field>
          <Field label={tr("Devise de reporting")} htmlFor="currency" hint={tr("Les coûts restent saisissables en EUR, IDR et USD.")}><Input id="currency" value="EUR — Euro" disabled readOnly /></Field>
          <Field label={tr("Préfixe des références vidéo")} htmlFor="videoRefPrefix" error={err("videoRefPrefix")} hint={tr("Ex. AV → AV-2026-0042")}><Input {...register("videoRefPrefix")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title={tr("Rentabilité")}>
        <FormGrid>
          <Field label={tr("Seuil d'alerte de taux de marge (%)")} htmlFor="marginThresholdPct" error={err("marginThresholdPct")}><Input inputMode="decimal" {...register("marginThresholdPct")} /></Field>
          <Field label={tr("Taux interne du dirigeant (€/h)")} htmlFor="ownerHourlyRate" error={err("ownerHourlyRate")} hint={tr("Valorisation analytique séparée, jamais une sortie de trésorerie.")}><Input inputMode="decimal" {...register("ownerHourlyRate")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("ownerTimeIncludedInCosts")} className="accent-[var(--av-accent)]" /> {" "}{tr("Ce temps est déjà compris dans un coût (pas de double comptage)")}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("nonRecoverableVatInCost")} className="accent-[var(--av-accent)]" /> {" "}{tr("Intégrer la TVA non récupérable aux coûts")}</label>
          <Field label={tr("Ventilation analytique des charges par client")} htmlFor="overheadMethod" hint={tr("Affichée à part de la marge directe.")}>
            <NativeSelect {...register("overheadMethod")}>
              <option value="NONE">{tr("Aucune")}</option>
              <option value="REVENUE">{tr("Au prorata du CA alloué")}</option>
              <option value="HOURS">{tr("Au prorata des heures saisies")}</option>
            </NativeSelect>
          </Field>
          <Field label={tr("Délai de paiement par défaut (jours)")} htmlFor="defaultPaymentTermsDays" error={err("defaultPaymentTermsDays")}><Input inputMode="numeric" {...register("defaultPaymentTermsDays")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title={tr("Production")}>
        <FormGrid>
          <Field label={tr("Allers-retours inclus par défaut")} htmlFor="defaultIncludedRevisions" error={err("defaultIncludedRevisions")}><Input inputMode="numeric" {...register("defaultIncludedRevisions")} /></Field>
          <Field label={tr("Arrondi par défaut (tarifs à la minute)")} htmlFor="defaultMinuteRounding">
            <NativeSelect {...register("defaultMinuteRounding")}>{Object.entries(MINUTE_ROUNDING_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("Définition d'un aller-retour")} htmlFor="revisionRoundDefinition" error={err("revisionRoundDefinition")} className="md:col-span-2"><Textarea rows={2} {...register("revisionRoundDefinition")} /></Field>
          <Field label={tr("Corrections dues à une erreur de production")} htmlFor="productionErrorPolicy" error={err("productionErrorPolicy")} className="md:col-span-2"><Textarea rows={2} {...register("productionErrorPolicy")} /></Field>
          <Field label={tr("Alerte « deadline proche » (jours)")} htmlFor="deadlineSoonDays" error={err("deadlineSoonDays")}><Input inputMode="numeric" {...register("deadlineSoonDays")} /></Field>
          <Field label={tr("Taille maximale des pièces jointes (Mo)")} htmlFor="maxUploadMb" error={err("maxUploadMb")}><Input inputMode="numeric" {...register("maxUploadMb")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} />
    </form>
  );
}

function CopyLink({ url, emailSent, hours }: { url: string; emailSent: boolean; hours: number }) {
  const tr = useT();
  return (
    <Notice tone={emailSent ? "success" : "warning"} title={emailSent ? tr("Email envoyé") : tr("Aucun email envoyé : transmettez ce lien vous-même")}>
      <p className="mb-2">{tr("Lien personnel, valable")}{" "}{hours} {" "}{tr("h, utilisable une seule fois.")}</p>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={tr("Lien")} onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success(tr("Lien copié.")))}>
          <Copy aria-hidden /> {" "}{tr("Copier")}</Button>
      </div>
    </Notice>
  );
}

export function InviteForm({ editors, defaultEditorId }: { editors: { value: string; label: string; email: string | null }[]; defaultEditorId?: string }) {
  const tr = useT();
  const [link, setLink] = useState<{ url: string; emailSent: boolean; expiresInHours: number } | null>(null);
  const preset = editors.find((e) => e.value === defaultEditorId);
  const { form, onSubmit, pending, err } = useServerForm({
    schema: inviteSchema,
    defaultValues: { email: preset?.email ?? "", name: preset?.label ?? "", role: preset ? "EDITOR" : "PRODUCTION_MANAGER", financeAccess: false, editorId: preset?.value ?? "", password: "" } satisfies InviteInput,
    action: inviteUserAction,
    onSuccess: (r) => {
      setLink(r.kind === "link" ? r : null);
      form.reset({ email: "", name: "", role: "PRODUCTION_MANAGER", financeAccess: false, editorId: "", password: "" });
    },
  });
  const { register, watch } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label={tr("Email")} htmlFor="inv-email" required error={err("email")}><Input type="email" {...register("email")} /></Field>
        <Field label={tr("Nom")} htmlFor="inv-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label={tr("Rôle")} htmlFor="inv-role" hint={tr("Défini par l'administrateur ; jamais modifiable par l'invité.")}>
          <NativeSelect {...register("role")}>
            {(["PRODUCTION_MANAGER", "EDITOR", "ADMIN"] as Role[]).map((r) => <option key={r} value={r}>{tr(ROLE_LABELS[r])}</option>)}
          </NativeSelect>
        </Field>
        {watch("role") === "EDITOR" ? (
          <Field label={tr("Fiche prestataire liée")} htmlFor="inv-editor" hint={tr("Le monteur ne verra que ses missions et sa rémunération.")}>
            <NativeSelect {...register("editorId")}>
              <option value="">{tr("— (à lier plus tard)")}</option>
              {editors.map((e) => <option key={e.value} value={e.value}>{tr(e.label)}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
        {watch("role") === "PRODUCTION_MANAGER" ? (
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("financeAccess")} className="accent-[var(--av-accent)]" />
            {tr("Activer l'accès financier (ventes, factures, coûts, marges projet — sans marge globale)")}</label>
        ) : null}
        <Field
          label={tr("Mot de passe")}
          htmlFor="inv-password"
          error={err("password")}
          hint={tr("Facultatif. Rempli : compte actif immédiatement avec ce mot de passe (à transmettre à la personne). Vide : un lien d'invitation est créé.")}
          className="md:col-span-2"
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        <div className="md:col-span-2 -mt-2">
          <Button type="button" size="xs" variant="outline" onClick={() => form.setValue("password", generatePassword(), { shouldValidate: true })}>
            <KeyRound aria-hidden /> {tr("Générer un mot de passe")}
          </Button>
        </div>
      </FormGrid>
      {link ? <CopyLink url={link.url} emailSent={link.emailSent} hours={link.expiresInHours} /> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : null} {" "}{watch("password") ? tr("Créer le compte") : tr("Créer l'invitation")}</Button>
      </div>
    </form>
  );
}

export function UserAccessEditor({ user, isSelf }: { user: { id: string; role: Role; financeAccess: boolean; status: string; legacyRole: string | null; suggestedRole: Role | null }; isSelf: boolean }) {
  const tr = useT();
  const [role, setRole] = useState<Role>(user.role);
  const [finance, setFinance] = useState(user.financeAccess);
  const [active, setActive] = useState(user.status === "ACTIVE");
  const [link, setLink] = useState<{ url: string; emailSent: boolean; expiresInHours: number } | null>(null);
  const { pending, run } = useAction();
  const changed = role !== user.role || finance !== user.financeAccess || active !== (user.status === "ACTIVE");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={tr("Rôle")} className="w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
          {(["ADMIN", "PRODUCTION_MANAGER", "EDITOR", "VISITOR"] as Role[]).map((r) => <option key={r} value={r}>{tr(ROLE_LABELS[r])}</option>)}
        </NativeSelect>
        {role === "PRODUCTION_MANAGER" ? (
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={finance} onChange={(e) => setFinance(e.target.checked)} className="accent-[var(--av-accent)]" /> {" "}{tr("Accès financier")}</label>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--av-accent)]" /> {" "}{tr("Actif")}</label>
        {changed ? (
          <Button size="xs" disabled={pending} onClick={() => run(() => updateUserAccessAction(user.id, { role, financeAccess: finance, status: active ? "ACTIVE" : "DISABLED" }))}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} {" "}{tr("Enregistrer")}</Button>
        ) : null}
        <SetPasswordDialog userId={user.id} />
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => resetLinkAction(user.id), { onSuccess: setLink, refresh: false })}>
          <KeyRound aria-hidden /> {" "}{tr("Lien mot de passe")}</Button>
      </div>
      {user.suggestedRole && user.status !== "ACTIVE" ? (
        <p className="text-xs text-warning">{tr("Compte importé (ancien rôle «")}{" "}{user.legacyRole} {" "}{tr("») : rôle suggéré")}{" "}{tr(ROLE_LABELS[user.suggestedRole])} {" "}{tr("— à confirmer explicitement.")}</p>
      ) : null}
      {link ? <CopyLink url={link.url} emailSent={link.emailSent} hours={link.expiresInHours} /> : null}
    </div>
  );
}

export function SimpleAddForm({ label, placeholder, kind }: { label: string; placeholder: string; kind: "checklist" | "category" }) {
  const tr = useT();
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
      <Button type="submit" size="sm" disabled={pending || !value.trim()}>{pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} {" "}{tr("Ajouter")}</Button>
    </form>
  );
}

export function CatalogItemDialog({ item, trigger }: { item?: CatalogItemInput; trigger: React.ReactNode }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr("Prestation du catalogue")}</DialogTitle>
          <DialogDescription>{tr("Prix de vente HT indicatif ; le prix négocié est figé sur chaque vente acceptée.")}</DialogDescription>
        </DialogHeader>
        {open ? <CatalogForm item={item} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CatalogForm({ item, onDone }: { item?: CatalogItemInput; onDone: () => void }) {
  const tr = useT();
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
        <Field label={tr("Nom")} htmlFor="ci-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label={tr("Type")} htmlFor="ci-type"><NativeSelect {...register("videoType")}><option value="">—</option>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
        <Field label={tr("Unité")} htmlFor="ci-unit" required error={err("unit")}><Input {...register("unit")} /></Field>
        <Field label={tr("Prix de vente HT")} htmlFor="ci-price" required error={err("unitPrice")}><Input inputMode="decimal" {...register("unitPrice")} /></Field>
        <Field label={tr("Devise")} htmlFor="ci-cur"><NativeSelect {...register("currency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
        <Field label={tr("Retouches incluses")} htmlFor="ci-rev" error={err("includedRevisions")}><Input inputMode="numeric" {...register("includedRevisions")} /></Field>
        <Field label={tr("Délai (jours)")} htmlFor="ci-days" error={err("turnaroundDays")}><Input inputMode="numeric" {...register("turnaroundDays")} /></Field>
        <Field label={tr("Coût cible (facultatif)")} htmlFor="ci-target" error={err("targetCost")}><Input inputMode="decimal" {...register("targetCost")} /></Field>
        <Field label={tr("Description")} htmlFor="ci-desc" className="md:col-span-2"><Textarea rows={2} {...register("description")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("active")} className="accent-[var(--av-accent)]" /> {" "}{tr("Active")}</label>
      </FormGrid>
      <FormActions pending={pending} onCancel={onDone} />
    </form>
  );
}

export function TemplateDialog({ item, trigger }: { item?: TemplateInput; trigger: React.ReactNode }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{tr("Modèle de projet")}</DialogTitle></DialogHeader>
        {open ? <TemplateForm item={item} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({ item, onDone }: { item?: TemplateInput; onDone: () => void }) {
  const tr = useT();
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
        <Field label={tr("Nom")} htmlFor="tp-name" required error={err("name")}><Input {...register("name")} /></Field>
        <Field label={tr("Type de vidéo")} htmlFor="tp-type"><NativeSelect {...register("videoType")}>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
        <Field label={tr("Nombre de vidéos")} htmlFor="tp-count" error={err("defaultVideoCount")}><Input inputMode="numeric" {...register("defaultVideoCount")} /></Field>
        <Field label={tr("Modèle de titre")} htmlFor="tp-title" error={err("titlePattern")} hint={tr("{type}, {n}")}><Input {...register("titlePattern")} /></Field>
        <Field label={tr("Ratio")} htmlFor="tp-ratio"><Input {...register("defaultRatio")} /></Field>
        <Field label={tr("Format")} htmlFor="tp-format"><Input {...register("defaultFormat")} /></Field>
        <Field label={tr("Durée attendue (s)")} htmlFor="tp-sec" error={err("defaultExpectedSec")}><Input inputMode="numeric" {...register("defaultExpectedSec")} /></Field>
        <Field label={tr("Allers-retours inclus")} htmlFor="tp-rev" error={err("defaultIncludedRevisions")}><Input inputMode="numeric" {...register("defaultIncludedRevisions")} /></Field>
        <Field label={tr("Heures estimées / vidéo")} htmlFor="tp-hours" error={err("defaultEstimatedHours")}><Input inputMode="decimal" {...register("defaultEstimatedHours")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("active")} className="accent-[var(--av-accent)]" /> {" "}{tr("Actif")}</label>
        <Field label={tr("Description")} htmlFor="tp-desc" className="md:col-span-2"><Textarea rows={2} {...register("description")} /></Field>
      </FormGrid>
      <FormActions pending={pending} onCancel={onDone} />
    </form>
  );
}

/** Mot de passe aléatoire lisible (16 caractères, sans caractères ambigus). */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Changement du mot de passe d'un utilisateur par un administrateur. */
function SetPasswordDialog({ userId }: { userId: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPassword(""); }}>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost"><KeyRound aria-hidden /> {tr("Mot de passe")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Changer le mot de passe")}</DialogTitle>
          <DialogDescription>{tr("Le nouveau mot de passe remplace l'ancien et ferme toutes les sessions de cet utilisateur. Transmettez-le de façon sûre.")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setUserPasswordAction(userId, password), { onSuccess: () => { setOpen(false); setPassword(""); } });
          }}
        >
          <Field label={tr("Nouveau mot de passe")} htmlFor={`pw-${userId}`} hint={tr("10 caractères minimum.")}>
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setPassword(generatePassword())}>
              <KeyRound aria-hidden /> {tr("Générer un mot de passe")}
            </Button>
            <Button type="submit" size="sm" disabled={pending || password.length < 10}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} {tr("Enregistrer le mot de passe")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
