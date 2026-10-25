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

const Methods = () => <>{Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</>;
const Currencies = () => <>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</>;

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
      <Notice tone="info">Saisie d&apos;un encaissement déjà reçu (virement, carte, PayPal…). Aucun prélèvement n&apos;est déclenché.</Notice>
      <FormSection title="Encaissement">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId", { onChange: () => allocs.replace([]) })}>
              <option value="">— Choisir —</option>
              {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Date de réception" htmlFor="receivedOn" required error={err("receivedOn")}><Input type="date" {...register("receivedOn")} /></Field>
          <Field label="Montant reçu (TTC)" htmlFor="amount" required error={err("amount")}><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label="Devise" htmlFor="currency"><NativeSelect {...register("currency", { onChange: () => allocs.replace([]) })}><Currencies /></NativeSelect></Field>
          {currency !== "EUR" ? <Field label="Taux manuel (unités pour 1 €)" htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label="Frais prélevés par l'intermédiaire" htmlFor="fees" error={err("fees")} hint="Ex. commission PayPal (même devise)."><Input inputMode="decimal" {...register("fees")} /></Field>
          <Field label="Moyen" htmlFor="method"><NativeSelect {...register("method")}><Methods /></NativeSelect></Field>
          <Field label="Référence" htmlFor="reference"><Input {...register("reference")} /></Field>
          <Field label="Note" htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Affectation aux factures" description="Un paiement peut couvrir plusieurs factures. Le reliquat non affecté reste visible (crédit client).">
        {invoices.length === 0 ? (
          <p className="text-sm text-subtle">{clientId ? "Aucune facture ouverte dans cette devise." : "Choisissez un client."}</p>
        ) : (
          <>
            {allocs.fields.map((f, i) => (
              <div key={f.id} className="mb-2 grid gap-2 md:grid-cols-[3fr_1fr_auto] md:items-end">
                <Field label="Facture" htmlFor={`a${i}-inv`} error={err(`allocations.${i}.invoiceId`)}>
                  <NativeSelect {...register(`allocations.${i}.invoiceId`)}>
                    <option value="">—</option>
                    {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} — solde {inv.balance} {inv.currency} — échéance {formatDateOnly(inv.dueDate)}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Montant affecté" htmlFor={`a${i}-amt`} error={err(`allocations.${i}.amount`)}><Input inputMode="decimal" {...register(`allocations.${i}.amount`)} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => allocs.remove(i)}><Trash2 aria-hidden /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => { const inv = invoices.find((x) => !allocs.fields.some((_, j) => watch(`allocations.${j}.invoiceId`) === x.id)); allocs.append({ invoiceId: inv?.id ?? "", amount: inv?.balance ?? "" }); }}>
              <Plus aria-hidden /> Affecter à une facture
            </Button>
          </>
        )}
      </FormSection>
      <FormActions pending={pending} submitLabel="Enregistrer l'encaissement" cancelHref="/finances?onglet=encaissements" />
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
      <Notice tone="info">Saisie d&apos;un règlement déjà effectué. Aucun virement n&apos;est déclenché. Seuls les coûts <strong>validés</strong> sont réglables.</Notice>
      <FormSection title="Règlement">
        <FormGrid>
          <Field label="Prestataire" htmlFor="editorId" required error={err("editorId")}>
            <NativeSelect {...register("editorId", { onChange: (e) => { set([]); const cur = payable.find((c) => c.editorId === e.target.value)?.currency; if (cur) setValue("currency", cur as "EUR"); } })}>
              <option value="">— Choisir —</option>
              {editors.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Date du paiement" htmlFor="paidOn" required error={err("paidOn")}><Input type="date" {...register("paidOn")} /></Field>
          <Field label="Devise" htmlFor="currency" hint={currenciesForEditor.length > 1 ? `Coûts dans plusieurs devises : ${currenciesForEditor.join(", ")}` : undefined}>
            <NativeSelect {...register("currency", { onChange: () => set([]) })}><Currencies /></NativeSelect>
          </Field>
          {currency !== "EUR" ? <Field label="Taux du jour (unités pour 1 €)" htmlFor="manualFxRate" error={err("manualFxRate")} hint="L'écart avec le taux d'engagement est conservé séparément."><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label="Frais bancaires" htmlFor="fees" error={err("fees")}><Input inputMode="decimal" {...register("fees")} /></Field>
          <Field label="Moyen" htmlFor="method"><NativeSelect {...register("method")}><Methods /></NativeSelect></Field>
          <Field label="Référence" htmlFor="reference"><Input {...register("reference")} /></Field>
          <Field label="Note" htmlFor="notes"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Coûts couverts" description="Un paiement peut couvrir plusieurs missions ; paiement partiel possible.">
        {err("allocations") ? <p className="mb-2 text-xs text-danger" role="alert">{err("allocations")}</p> : null}
        {costs.length === 0 ? (
          <p className="text-sm text-subtle">{editorId ? "Aucun coût validé restant dû dans cette devise." : "Choisissez un prestataire."}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {costs.map((c) => {
              const current = allocations.find((a) => a.directCostId === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                  <input type="checkbox" aria-label={`Régler ${c.label}`} className="accent-[var(--av-accent)]" checked={!!current} onChange={(e) => set(e.target.checked ? [...allocations, { directCostId: c.id, amount: c.remaining }] : allocations.filter((a) => a.directCostId !== c.id))} />
                  <span className="min-w-0 flex-1">{c.label}<span className="block text-xs text-subtle">{formatDateOnly(c.incurredOn)} · reste dû <Money value={c.remaining} currency={c.currency as CurrencyCode} /></span></span>
                  {current ? <Input aria-label={`Montant pour ${c.label}`} className="h-8 w-32" inputMode="decimal" value={current.amount} onChange={(e) => set(allocations.map((a) => (a.directCostId === c.id ? { ...a, amount: e.target.value } : a)))} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {allocations.length ? (
          <p className="mt-3 text-sm font-semibold">
            Total réglé : <Money value={sum(allocations.map((a) => parseDecimalInput(a.amount) ?? new Decimal(0))).toFixed(2)} currency={currency as CurrencyCode} />{" "}
            <span className="text-xs font-normal text-faint">(recalculé et contrôlé côté serveur)</span>
          </p>
        ) : null}
      </FormSection>
      <FormActions pending={pending} submitLabel="Enregistrer le règlement" cancelHref="/finances?onglet=reglements" />
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
      <Notice tone="info">Coût direct = exclusivement affecté à une production (sous-traitance, achat, enveloppe). Une charge générale s&apos;enregistre dans « Charges » : jamais les deux pour la même dépense.</Notice>
      <FormSection title="Coût">
        <FormGrid>
          <Field label="Nature" htmlFor="kind">
            <NativeSelect {...register("kind")}>
              {(["PURCHASE", "ADDITIONAL", "ENVELOPE"] as const).map((k) => <option key={k} value={k}>{COST_KIND_LABELS[k]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Libellé" htmlFor="label" required error={err("label")}><Input {...register("label")} /></Field>
          {kind === "ENVELOPE" || kind === "ADDITIONAL" ? (
            <Field label="Prestataire" htmlFor="editorId" required={kind === "ENVELOPE"} error={err("editorId")}>
              <NativeSelect {...register("editorId")}><option value="">—</option>{editors.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</NativeSelect>
            </Field>
          ) : (
            <Field label="Fournisseur" htmlFor="supplierName"><Input {...register("supplierName")} /></Field>
          )}
          {kind === "ENVELOPE" ? (
            <Field label="Mois couvert" htmlFor="periodMonth" required error={err("periodMonth")}><Input type="month" {...register("periodMonth")} /></Field>
          ) : (
            <>
              <Field label="Projet" htmlFor="projectId" hint="Sans vidéo précise : réparti à parts égales entre les vidéos du projet (modifiable).">
                <NativeSelect {...register("projectId")}><option value="">—</option>{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect>
              </Field>
              <Field label="Vidéo" htmlFor="videoId">
                <NativeSelect {...register("videoId")}><option value="">— (tout le projet)</option>{videos.filter((v) => !projectId || v.projectId === projectId).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</NativeSelect>
              </Field>
            </>
          )}
          <Field label="Montant" htmlFor="amount" error={err("amount")} hint="Vide = « À renseigner » (marge provisoire)."><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label="Devise" htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          {watch("currency") !== "EUR" ? <Field label="Taux manuel (unités pour 1 €)" htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <Field label="Date d'engagement" htmlFor="incurredOn" required error={err("incurredOn")}><Input type="date" {...register("incurredOn")} /></Field>
          <Field label="Étape" htmlFor="stage" hint="Estimé, engagé et validé sont les étapes d'un même coût.">
            <NativeSelect {...register("stage")}>
              <option value="ESTIMATED">Estimé</option>
              <option value="COMMITTED">Engagé</option>
              <option value="VALIDATED">Validé (payable)</option>
            </NativeSelect>
          </Field>
          <Field label="TVA non récupérable incluse" htmlFor="nonRecoverableVat" error={err("nonRecoverableVat")} hint="Ajoutée au coût si le réglage l'autorise."><Input inputMode="decimal" {...register("nonRecoverableVat")} /></Field>
          <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} submitLabel="Enregistrer le coût" cancelHref="/finances?onglet=couts" />
    </form>
  );
}

// ─────────────────────────── Charge de structure ───────────────────────────

export function ExpenseForm({ defaults, categories }: { defaults: ExpenseInput; categories: { value: string; label: string }[] }) {
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
      <FormSection title="Charge de structure" description="Abonnements, stockage, musique, publicité, services administratifs, frais bancaires…">
        <FormGrid>
          <Field label="Catégorie" htmlFor="categoryId" required error={err("categoryId")}>
            <NativeSelect {...register("categoryId")}><option value="">— Choisir —</option>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>
          </Field>
          <Field label="Libellé" htmlFor="label" required error={err("label")}><Input {...register("label")} /></Field>
          <Field label="Fournisseur" htmlFor="supplier"><Input {...register("supplier")} /></Field>
          <Field label="Date de dépense" htmlFor="expenseDate" required error={err("expenseDate")}><Input type="date" {...register("expenseDate")} /></Field>
          <Field label="Période de rattachement" htmlFor="periodMonth" required error={err("periodMonth")} hint="Mois auquel la charge est rattachée dans le résultat."><Input type="month" {...register("periodMonth")} /></Field>
          <Field label="Récurrence" htmlFor="recurrence"><NativeSelect {...register("recurrence")}>{Object.entries(RECURRENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
          <Field label="Montant HT" htmlFor="amountNet" required error={err("amountNet")}><Input inputMode="decimal" {...register("amountNet")} /></Field>
          <Field label="TVA" htmlFor="vatAmount" error={err("vatAmount")}><Input inputMode="decimal" {...register("vatAmount")} /></Field>
          <Field label="Devise" htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          {watch("currency") !== "EUR" ? <Field label="Taux manuel (unités pour 1 €)" htmlFor="manualFxRate" error={err("manualFxRate")}><Input inputMode="decimal" {...register("manualFxRate")} /></Field> : null}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("vatRecoverable")} className="accent-[var(--av-accent)]" />
            TVA récupérable (sinon intégrée au coût selon le paramétrage)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isPaid")} className="accent-[var(--av-accent)]" />
            Déjà payée
          </label>
          {watch("isPaid") ? <Field label="Date de paiement" htmlFor="paidOn" error={err("paidOn")}><Input type="date" {...register("paidOn")} /></Field> : null}
          <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Input {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormActions pending={pending} submitLabel="Enregistrer la charge" cancelHref="/finances?onglet=charges" />
    </form>
  );
}

// ─────────────────────────── Forfait récurrent ───────────────────────────

export function RetainerForm({ defaults, clients }: { defaults: RetainerInput; clients: { value: string; label: string }[] }) {
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
      <FormSection title="Contrat récurrent" description="Les crédits de production sont distincts des encaissements.">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" required error={err("clientId")}>
            <NativeSelect {...register("clientId")}><option value="">— Choisir —</option>{clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>
          </Field>
          <Field label="Intitulé" htmlFor="title" required error={err("title")}><Input {...register("title")} /></Field>
          <Field label="Date d'effet" htmlFor="startsOn" required error={err("startsOn")}><Input type="date" {...register("startsOn")} /></Field>
          <Field label="Fin" htmlFor="endsOn" error={err("endsOn")}><Input type="date" {...register("endsOn")} /></Field>
          <Field label="Montant mensuel HT" htmlFor="amount" required error={err("amount")}><Input inputMode="decimal" {...register("amount")} /></Field>
          <Field label="Devise" htmlFor="currency"><NativeSelect {...register("currency")}><Currencies /></NativeSelect></Field>
          <Field label="Report des crédits" htmlFor="carryOver"><NativeSelect {...register("carryOver")}>{Object.entries(CARRY_OVER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
          <Field label="TVA de la facture brouillon (%)" htmlFor="vatRate" error={err("vatRate")}><Input inputMode="decimal" {...register("vatRate")} /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...register("createDraftInvoice")} className="accent-[var(--av-accent)]" />
            Créer une facture brouillon à chaque période (à émettre dans votre outil)
          </label>
          <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Textarea rows={2} {...register("notes")} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Quotas mensuels">
        {quotas.fields.map((f, i) => (
          <div key={f.id} className="mb-2 grid grid-cols-[2fr_1fr_auto] items-end gap-2">
            <Field label="Type" htmlFor={`q${i}-t`}><NativeSelect {...register(`quotas.${i}.videoType`)}>{Object.entries(VIDEO_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
            <Field label="Quantité" htmlFor={`q${i}-n`} error={err(`quotas.${i}.quantity`)}><Input inputMode="numeric" {...register(`quotas.${i}.quantity`)} /></Field>
            <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => quotas.remove(i)} disabled={quotas.fields.length === 1}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => quotas.append({ videoType: "REEL", quantity: "" })}><Plus aria-hidden /> Quota</Button>
      </FormSection>
      <FormActions pending={pending} submitLabel="Créer le forfait" cancelHref="/finances?onglet=forfaits" />
    </form>
  );
}
