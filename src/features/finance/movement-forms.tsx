"use client";

import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, FormSection, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateOnly } from "@/lib/dates";
import { CARRY_OVER_LABELS, COST_KIND_LABELS, CURRENCY_LABELS, PAYMENT_METHOD_LABELS, RECURRENCE_LABELS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { Decimal, parseDecimalInput, sum, type CurrencyCode } from "@/lib/money";
import {
  createDirectCostAction,
  createExpenseAction,
  createRetainerAction,
  recordClientPaymentAction,
  recordSupplierPaymentAction,
} from "./actions";
import {
  clientPaymentSchema,
  directCostSchema,
  expenseSchema,
  retainerSchema,
  supplierPaymentSchema,
  type ClientPaymentInput,
  type DirectCostInput,
  type ExpenseInput,
  type RetainerInput,
} from "./schemas";
import { useT } from "#i18n";

const Methods = () => {
  const tr = useT();
  return <>{Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</>;
};
const Currencies = () => {
  const tr = useT();
  return <>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</>;
};

// ─────────────────────────── Encaissement client ───────────────────────────

export function ClientPaymentForm({
  defaults,
  clients,
  openInvoices,
}: {
  defaults: ClientPaymentInput;
  clients: { value: string; label: string }[];
  openInvoices: { id: string; number: string; clientId: string; currency: string; dueDate: string | null; balance: string }[];
}) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: clientPaymentSchema,
    defaultValues: defaults,
    action: recordClientPaymentAction,
    refresh: false,
    onSuccess: () => {
      router.push("/finances?onglet=encaissements");
      router.refresh();
    },
  });
  const { register, watch, control } = form;
  const allocs = useFieldArray({ control, name: "allocations" });
  const clientId = watch("clientId");
  const currency = watch("currency");
  const invoices = openInvoices.filter((i) => i.clientId === clientId && i.currency === currency);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Notice tone="info">{tr("Saisie d'un encaissement déjà reçu (virement, carte, PayPal…). Aucun prélèvement n'est déclenché.")}</Notice>
      <FormSection title={tr("Encaissement")}>
        <FormGrid>
          <Field label={tr("Client")} htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId", { onChange: () => allocs.replace([]) })}>
              <option value="">{tr("— Choisir —")}</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Date de réception")} htmlFor="receivedOn" required error={err("receivedOn")}><Input type="date" {...register("receivedOn")} /></Field>
          <Field label={tr("Montant reçu (TTC)")} htmlFor="amount" required error={err("amount")}><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency"><NativeSelect {...register("currency", { onChange: () => allocs.replace([]) })}><Currencies /></NativeSelect></Field>
          {currency !== "EUR" ? <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label={tr("Frais prélevés par l'intermédiaire")} htmlFor="fees" error={err("fees")} hint={tr("Ex. commission PayPal (même devise).")}><Input inputMode="decimal" {...register("fees")} /></Field>
          <Field label={tr("Moyen")} htmlFor="method"><NativeSelect {...register("method")}><Methods /></NativeSelect></Field>
          <Field label={tr("Référence")} htmlFor="reference"><Input {...register("reference")} /></Field>
          <Field label={tr("Note")} htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title={tr("Affectation aux factures")} description={tr("Un paiement peut couvrir plusieurs factures. Le reliquat non affecté reste visible (crédit client).")}>
        {invoices.length === 0 ? (
          <p className="text-sm text-subtle">{clientId ? tr("Aucune facture ouverte dans cette devise.") : tr("Choisissez un client.")}</p>
        ) : (
          <>
            {allocs.fields.map((f, i) => (
              <div key={f.id} className="mb-2 grid gap-2 md:grid-cols-[3fr_1fr_auto] md:items-end">
                <Field label={tr("Facture")} htmlFor={`a${i}-inv`} error={err(`allocations.${i}.invoiceId`)}>
                  <NativeSelect {...register(`allocations.${i}.invoiceId`)}>
                    <option value="">—</option>
                    {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} {" "}{tr("— solde")}{" "}{inv.balance} {inv.currency} {" "}{tr("— échéance")}{" "}{formatDateOnly(inv.dueDate)}</option>)}
                  </NativeSelect>
                </Field>
                <Field label={tr("Montant affecté")} htmlFor={`a${i}-amt`} error={err(`allocations.${i}.amount`)}><Input inputMode="decimal" {...register(`allocations.${i}.amount`)} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={tr("Retirer")} onClick={() => allocs.remove(i)}><Trash2 aria-hidden /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => { const inv = invoices.find((x) => !allocs.fields.some((_, j) => watch(`allocations.${j}.invoiceId`) === x.id)); allocs.append({ invoiceId: inv?.id ?? "", amount: inv?.balance ?? "" }); }}>
              <Plus aria-hidden /> {" "}{tr("Affecter à une facture")}</Button>
          </>
        )}
      </FormSection>
      <FormActions pending={pending} submitLabel={tr("Enregistrer l'encaissement")} cancelHref="/finances?onglet=encaissements" />
    </form>
  );
}

// ─────────────────────────── Règlement prestataire ───────────────────────────

export function SupplierPaymentForm({
  defaults,
  editors,
  payable,
}: {
  defaults: { editorId: string; paidOn: string };
  editors: { value: string; label: string }[];
  payable: { id: string; label: string; editorId: string; currency: string; reference: string | null; incurredOn: string; remaining: string }[];
}) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: supplierPaymentSchema,
    defaultValues: { editorId: defaults.editorId, paidOn: defaults.paidOn, currency: "EUR", manualFxRate: "", fees: "", method: "BANK_TRANSFER", reference: "", notes: "", allocations: [] },
    action: recordSupplierPaymentAction,
    refresh: false,
    onSuccess: () => {
      router.push("/finances?onglet=reglements");
      router.refresh();
    },
  });
  const { register, watch, setValue } = form;
  const editorId = watch("editorId");
  const currency = watch("currency");
  const allocations = watch("allocations") ?? [];
  const costs = payable.filter((c) => c.editorId === editorId && c.currency === currency);
  const currenciesForEditor = [...new Set(payable.filter((c) => c.editorId === editorId).map((c) => c.currency))];
  const set = (next: { directCostId: string; amount: string }[]) => setValue("allocations", next, { shouldDirty: true });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Notice tone="info">{tr("Saisie d'un règlement déjà effectué. Aucun virement n'est déclenché. Seuls les coûts")}{" "}<strong>{tr("validés")}</strong> {" "}{tr("sont réglables.")}</Notice>
      <FormSection title={tr("Règlement")}>
        <FormGrid>
          <Field label={tr("Prestataire")} htmlFor="editorId" required error={err("editorId")}>
            <NativeSelect {...register("editorId", { onChange: (e) => { set([]); const cur = payable.find((c) => c.editorId === e.target.value)?.currency; if (cur) setValue("currency", cur as "EUR"); } })}>
              <option value="">{tr("— Choisir —")}</option>
              {editors.map((e) => <option key={e.value} value={e.value}>{tr(e.label)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Date du paiement")} htmlFor="paidOn" required error={err("paidOn")}><Input type="date" {...register("paidOn")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency" hint={currenciesForEditor.length > 1 ? tr("Coûts dans plusieurs devises : {0}", [currenciesForEditor.join(", ")]) : undefined}>
            <NativeSelect {...register("currency", { onChange: () => set([]) })}><Currencies /></NativeSelect>
          </Field>
          {currency !== "EUR" ? <Field label={tr("Taux du jour (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")} hint={tr("L'écart avec le taux d'engagement est conservé séparément.")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label={tr("Frais bancaires")} htmlFor="fees" error={err("fees")}><Input inputMode="decimal" {...register("fees")} /></Field>
          <Field label={tr("Moyen")} htmlFor="method"><NativeSelect {...register("method")}><Methods /></NativeSelect></Field>
          <Field label={tr("Référence")} htmlFor="reference"><Input {...register("reference")} /></Field>
          <Field label={tr("Note")} htmlFor="notes"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title={tr("Coûts couverts")} description={tr("Un paiement peut couvrir plusieurs missions ; paiement partiel possible.")}>
        {err("allocations") ? <p className="mb-2 text-xs text-danger" role="alert">{err("allocations")}</p> : null}
        {costs.length === 0 ? (
          <p className="text-sm text-subtle">{editorId ? tr("Aucun coût validé restant dû dans cette devise.") : tr("Choisissez un prestataire.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {costs.map((c) => {
              const current = allocations.find((a) => a.directCostId === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                  <input type="checkbox" aria-label={tr("Régler {0}", [c.label])} className="accent-[var(--av-accent)]" checked={!!current} onChange={(e) => set(e.target.checked ? [...allocations, { directCostId: c.id, amount: c.remaining }] : allocations.filter((a) => a.directCostId !== c.id))} />
                  <span className="min-w-0 flex-1">{tr(c.label)}<span className="block text-xs text-subtle">{formatDateOnly(c.incurredOn)} {" "}{tr("· reste dû")}{" "}<Money value={c.remaining} currency={c.currency as CurrencyCode} /></span></span>
                  {current ? <Input aria-label={tr("Montant pour {0}", [c.label])} className="h-8 w-32" inputMode="decimal" value={current.amount} onChange={(e) => set(allocations.map((a) => (a.directCostId === c.id ? { ...a, amount: e.target.value } : a)))} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {allocations.length ? (
          <p className="mt-3 text-sm font-semibold">
            {tr("Total réglé :")}{" "}<Money value={sum(allocations.map((a) => parseDecimalInput(a.amount) ?? new Decimal(0))).toFixed(2)} currency={currency as CurrencyCode} />{" "}
            <span className="text-xs font-normal text-faint">{tr("(recalculé et contrôlé côté serveur)")}</span>
          </p>
        ) : null}
      </FormSection>
      <FormActions pending={pending} submitLabel={tr("Enregistrer le règlement")} cancelHref="/finances?onglet=reglements" />
    </form>
  );
}

// ─────────────────────────── Coût direct ───────────────────────────

export function DirectCostForm({
  defaults,
  editors,
  projects,
  videos,
}: {
  defaults: DirectCostInput;
  editors: { value: string; label: string }[];
  projects: { value: string; label: string }[];
  videos: { value: string; label: string; projectId: string }[];
}) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: directCostSchema,
    defaultValues: defaults,
    action: createDirectCostAction,
    refresh: false,
    onSuccess: (data) => {
      router.push(`/finances/couts/${data.id}`);
      router.refresh();
    },
  });
  const { register, watch } = form;
  const kind = watch("kind");
  const projectId = watch("projectId");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Notice tone="info">{tr("Coût direct = exclusivement affecté à une production (sous-traitance, achat, enveloppe). Une charge générale s'enregistre dans « Charges » : jamais les deux pour la même dépense.")}</Notice>
      <FormSection title={tr("Coût")}>
        <FormGrid>
          <Field label={tr("Nature")} htmlFor="kind">
            <NativeSelect {...register("kind")}>
              {(["PURCHASE", "ADDITIONAL", "ENVELOPE"] as const).map((k) => <option key={k} value={k}>{tr(COST_KIND_LABELS[k])}</option>)}
            </NativeSelect>
          </Field>
          <Field label={tr("Libellé")} htmlFor="label" required error={err("label")}><Input {...register("label")} /></Field>
          {kind === "ENVELOPE" || kind === "ADDITIONAL" ? (
            <Field label={tr("Prestataire")} htmlFor="editorId" required={kind === "ENVELOPE"} error={err("editorId")}>
              <NativeSelect {...register("editorId")}><option value="">—</option>{editors.map((e) => <option key={e.value} value={e.value}>{tr(e.label)}</option>)}</NativeSelect>
            </Field>
          ) : (
            <Field label={tr("Fournisseur")} htmlFor="supplierName"><Input {...register("supplierName")} /></Field>
          )}
          {kind === "ENVELOPE" ? (
            <Field label={tr("Mois couvert")} htmlFor="periodMonth" required error={err("periodMonth")}><Input type="month" {...register("periodMonth")} /></Field>
          ) : (
            <>
              <Field label={tr("Projet")} htmlFor="projectId" hint={tr("Sans vidéo précise : réparti à parts égales entre les vidéos du projet (modifiable).")}>
                <NativeSelect {...register("projectId")}><option value="">—</option>{projects.map((p) => <option key={p.value} value={p.value}>{tr(p.label)}</option>)}</NativeSelect>
              </Field>
              <Field label={tr("Vidéo")} htmlFor="videoId">
                <NativeSelect {...register("videoId")}><option value="">{tr("— (tout le projet)")}</option>{videos.filter((v) => !projectId || v.projectId === projectId).map((v) => <option key={v.value} value={v.value}>{tr(v.label)}</option>)}</NativeSelect>
              </Field>
            </>
          )}
          <Field label={tr("Montant")} htmlFor="amount" error={err("amount")} hint={tr("Vide = « À renseigner » (marge provisoire).")}><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          {watch("currency") !== "EUR" ? <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label={tr("Date d'engagement")} htmlFor="incurredOn" required error={err("incurredOn")}><Input type="date" {...register("incurredOn")} /></Field>
          <Field label={tr("Étape")} htmlFor="stage" hint={tr("Estimé, engagé et validé sont les étapes d'un même coût.")}>
            <NativeSelect {...register("stage")}>
              <option value="ESTIMATED">{tr("Estimé")}</option>
              <option value="COMMITTED">{tr("Engagé")}</option>
              <option value="VALIDATED">{tr("Validé (payable)")}</option>
            </NativeSelect>
          </Field>
          <Field label={tr("TVA non récupérable incluse")} htmlFor="nonRecoverableVat" error={err("nonRecoverableVat")} hint={tr("Ajoutée au coût si le réglage l'autorise.")}><Input inputMode="decimal" {...register("nonRecoverableVat")} /></Field>
          <Field label={tr("N° de pièce fournisseur")} htmlFor="documentRef" error={err("documentRef")} hint={tr("Numéro de la facture reçue : évite de l'enregistrer deux fois.")}><Input {...register("documentRef")} /></Field>
          <Field label={tr("Notes")} htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} submitLabel={tr("Enregistrer le coût")} cancelHref="/finances?onglet=couts" />
    </form>
  );
}

// ─────────────────────────── Charge de structure ───────────────────────────

export function ExpenseForm({ defaults, categories }: { defaults: ExpenseInput; categories: { value: string; label: string }[] }) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: expenseSchema,
    defaultValues: defaults,
    action: createExpenseAction,
    refresh: false,
    onSuccess: () => {
      router.push("/finances?onglet=charges");
      router.refresh();
    },
  });
  const { register, watch } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title={tr("Charge de structure")} description={tr("Abonnements, stockage, musique, publicité, services administratifs, frais bancaires…")}>
        <FormGrid>
          <Field label={tr("Catégorie")} htmlFor="categoryId" required error={err("categoryId")}>
            <NativeSelect {...register("categoryId")}><option value="">{tr("— Choisir —")}</option>{categories.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("Libellé")} htmlFor="label" required error={err("label")}><Input {...register("label")} /></Field>
          <Field label={tr("Fournisseur")} htmlFor="supplier"><Input {...register("supplier")} /></Field>
          <Field label={tr("N° de pièce fournisseur")} htmlFor="documentRef" error={err("documentRef")} hint={tr("Numéro de la facture reçue : évite de l'enregistrer deux fois.")}><Input {...register("documentRef")} /></Field>
          <Field label={tr("Date de dépense")} htmlFor="expenseDate" required error={err("expenseDate")}><Input type="date" {...register("expenseDate")} /></Field>
          <Field label={tr("Période de rattachement")} htmlFor="periodMonth" required error={err("periodMonth")} hint={tr("Mois auquel la charge est rattachée dans le résultat.")}><Input type="month" {...register("periodMonth")} /></Field>
          <Field label={tr("Récurrence")} htmlFor="recurrence"><NativeSelect {...register("recurrence")}>{Object.entries(RECURRENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
          <Field label={tr("Montant HT")} htmlFor="amountNet" required error={err("amountNet")}><Input inputMode="decimal" {...register("amountNet")} /></Field>
          <Field label={tr("TVA")} htmlFor="vatAmount" error={err("vatAmount")}><Input inputMode="decimal" {...register("vatAmount")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          {watch("currency") !== "EUR" ? <Field label={tr("Taux manuel (unités pour 1 €)")} htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("vatRecoverable")} className="accent-[var(--av-accent)]" />
            {tr("TVA récupérable (sinon intégrée au coût selon le paramétrage)")}</label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isPaid")} className="accent-[var(--av-accent)]" />
            {tr("Déjà payée")}</label>
          {watch("isPaid") ? <Field label={tr("Date de paiement")} htmlFor="paidOn" error={err("paidOn")}><Input type="date" {...register("paidOn")} /></Field> : null}
          <Field label={tr("Notes")} htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} submitLabel={tr("Enregistrer la charge")} cancelHref="/finances?onglet=charges" />
    </form>
  );
}

// ─────────────────────────── Forfait récurrent ───────────────────────────

export function RetainerForm({ defaults, clients }: { defaults: RetainerInput; clients: { value: string; label: string }[] }) {
  const tr = useT();
  const router = useRouter();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: retainerSchema,
    defaultValues: defaults,
    action: createRetainerAction,
    refresh: false,
    onSuccess: (data) => {
      router.push(`/finances/forfaits/${data.id}`);
      router.refresh();
    },
  });
  const { register, control } = form;
  const quotas = useFieldArray({ control, name: "quotas" });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormSection title={tr("Contrat récurrent")} description={tr("Les crédits de production sont distincts des encaissements.")}>
        <FormGrid>
          <Field label={tr("Client")} htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId")}><option value="">{tr("— Choisir —")}</option>{clients.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("Intitulé")} htmlFor="title" required error={err("title")}><Input {...register("title")} /></Field>
          <Field label={tr("Date d'effet")} htmlFor="startsOn" required error={err("startsOn")}><Input type="date" {...register("startsOn")} /></Field>
          <Field label={tr("Fin")} htmlFor="endsOn" error={err("endsOn")}><Input type="date" {...register("endsOn")} /></Field>
          <Field label={tr("Montant mensuel HT")} htmlFor="amount" required error={err("amount")}><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label={tr("Devise")} htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          <Field label={tr("Report des crédits")} htmlFor="carryOver"><NativeSelect {...register("carryOver")}>{Object.entries(CARRY_OVER_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
          <Field label={tr("TVA de la facture brouillon (%)")} htmlFor="vatRate" error={err("vatRate")}><Input inputMode="decimal" {...register("vatRate")} /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("createDraftInvoice")} className="accent-[var(--av-accent)]" />
            {tr("Créer une facture brouillon à chaque période (à émettre dans votre outil)")}</label>
          <Field label={tr("Notes")} htmlFor="notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title={tr("Quotas mensuels")}>
        {quotas.fields.map((f, i) => (
          <div key={f.id} className="mb-2 grid grid-cols-[2fr_1fr_auto] items-end gap-2">
            <Field label={tr("Type")} htmlFor={`q${i}-t`}><NativeSelect {...register(`quotas.${i}.videoType`)}>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect></Field>
            <Field label={tr("Quantité")} htmlFor={`q${i}-n`} error={err(`quotas.${i}.quantity`)}><Input inputMode="numeric" {...register(`quotas.${i}.quantity`)} /></Field>
            <Button type="button" variant="ghost" size="icon" aria-label={tr("Retirer")} onClick={() => quotas.remove(i)} disabled={quotas.fields.length === 1}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => quotas.append({ videoType: "REEL", quantity: "" })}><Plus aria-hidden /> {" "}{tr("Quota")}</Button>
      </FormSection>
      <FormActions pending={pending} submitLabel={tr("Créer le forfait")} cancelHref="/finances?onglet=forfaits" />
    </form>
  );
}
