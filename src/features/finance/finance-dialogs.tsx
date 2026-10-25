"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { Decimal, parseDecimalInput, sum } from "@/lib/money";
import type { ActionResult } from "@/lib/action-result";
import {
  allocateClientPaymentAction,
  cancelSalesLineAction,
  createCreditNoteAction,
  generateRetainerPeriodAction,
  issueInvoiceAction,
  markExpensePaidAction,
  reallocateLineAction,
  recordRefundAction,
  saveExchangeRateAction,
  setCostAllocationsAction,
  consumeRetainerCreditAction,
} from "./actions";

/** Dialogue générique : champs simples (chaînes) → action. */
function FormDialog<T extends Record<string, string>>({
  trigger,
  title,
  description,
  initial,
  fields,
  submitLabel = "Enregistrer",
  action,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  initial: T;
  fields: { name: keyof T & string; label: string; type?: "text" | "date" | "decimal" | "select"; options?: { value: string; label: string }[]; required?: boolean; hint?: string }[];
  submitLabel?: string;
  action: (values: T) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<T>(initial);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setValues(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription asChild><div>{description}</div></DialogDescription> : null}
        </DialogHeader>
        <FormGrid>
          {fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`fd-${f.name}`} required={f.required} hint={f.hint}>
              {f.type === "select" ? (
                <NativeSelect value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              ) : (
                <Input type={f.type === "date" ? "date" : "text"} inputMode={f.type === "decimal" ? "decimal" : undefined} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </Field>
          ))}
        </FormGrid>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
          <Button disabled={pending} onClick={() => run(() => action(values), { onSuccess: () => setOpen(false) })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));

export function IssueInvoiceDialog({ invoiceId, today, number }: { invoiceId: string; today: string; number: string }) {
  return (
    <FormDialog
      trigger={<Button size="sm">Marquer émise</Button>}
      title="Facture émise"
      description="Renseignez le numéro et la date du document émis dans votre outil de facturation. Le taux de change est figé à la date d'émission."
      initial={{ invoiceId, number, issueDate: today, dueDate: "", manualFxRate: "" }}
      fields={[
        { name: "number", label: "Numéro", required: true },
        { name: "issueDate", label: "Date d'émission", type: "date", required: true },
        { name: "dueDate", label: "Échéance", type: "date", hint: "Vide : conditions du client." },
        { name: "manualFxRate", label: "Taux manuel (si devise ≠ EUR)", type: "decimal" },
      ]}
      submitLabel="Marquer émise"
      action={issueInvoiceAction}
    />
  );
}

export function CreditNoteDialog({ invoiceId, today, defaultVat }: { invoiceId: string; today: string; defaultVat: string }) {
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Émettre un avoir</Button>}
      title="Avoir sur cette facture"
      description="Un avoir réduit la facturation une seule fois, à sa date d'émission. Un remboursement éventuel s'enregistre ensuite comme mouvement de trésorerie."
      initial={{ invoiceId, number: "", issueDate: today, net: "", vatRate: defaultVat, reason: "", manualFxRate: "" }}
      fields={[
        { name: "number", label: "Numéro de l'avoir" },
        { name: "issueDate", label: "Date d'émission", type: "date", required: true },
        { name: "net", label: "Montant HT", type: "decimal", required: true },
        { name: "vatRate", label: "TVA %", type: "decimal", required: true },
        { name: "reason", label: "Motif", required: true },
        { name: "manualFxRate", label: "Taux manuel (si devise ≠ EUR)", type: "decimal" },
      ]}
      submitLabel="Enregistrer l'avoir"
      action={createCreditNoteAction}
    />
  );
}

export function RefundDialog({ creditNoteId, paymentId, today, max, currency, label }: { creditNoteId?: string; paymentId?: string; today: string; max: string; currency: string; label: string }) {
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">{label}</Button>}
      title="Enregistrer un remboursement"
      description={`Mouvement de trésorerie sortant déjà effectué (aucun virement déclenché). Maximum : ${max} ${currency}. Ne réduit pas une seconde fois le CA.`}
      initial={{ creditNoteId: creditNoteId ?? "", paymentId: paymentId ?? "", refundedOn: today, amount: max, manualFxRate: "", method: "BANK_TRANSFER", reference: "", reason: "" }}
      fields={[
        { name: "refundedOn", label: "Date", type: "date", required: true },
        { name: "amount", label: `Montant (${currency})`, type: "decimal", required: true },
        { name: "method", label: "Moyen", type: "select", options: METHOD_OPTIONS },
        { name: "reference", label: "Référence" },
        { name: "reason", label: "Motif", required: true },
        { name: "manualFxRate", label: "Taux manuel (si devise ≠ EUR)", type: "decimal" },
      ]}
      action={(v) => recordRefundAction({ ...v, method: v.method as "BANK_TRANSFER" })}
    />
  );
}

export function AllocatePaymentDialog({ invoiceId, payments, balance }: { invoiceId: string; payments: { id: string; receivedOn: string; available: string; reference: string | null }[]; balance: string }) {
  if (payments.length === 0) return null;
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Affecter un encaissement existant</Button>}
      title="Affecter un encaissement"
      description="Reliquat d'un paiement déjà enregistré. Le montant ne peut dépasser ni le disponible du paiement, ni le solde de la facture."
      initial={{ paymentId: payments[0].id, invoiceId, amount: [payments[0].available, balance].sort((a, b) => (parseDecimalInput(a)!.lt(parseDecimalInput(b)!) ? -1 : 1))[0] }}
      fields={[
        { name: "paymentId", label: "Encaissement", type: "select", options: payments.map((p) => ({ value: p.id, label: `${p.receivedOn} — disponible ${p.available}${p.reference ? ` (${p.reference})` : ""}` })) },
        { name: "amount", label: "Montant", type: "decimal", required: true },
      ]}
      action={allocateClientPaymentAction}
    />
  );
}

export function CancelLineDialog({ lineId, max, today }: { lineId: string; max: string; today: string }) {
  return (
    <FormDialog
      trigger={<Button size="xs" variant="ghost">Annuler (partiellement)</Button>}
      title="Annulation de vente"
      description={`Réduit les ventes signées à la date d'annulation (net restant : ${max}). Les allocations sont recalculées au prorata.`}
      initial={{ lineId, amount: max, cancelledOn: today, reason: "" }}
      fields={[
        { name: "amount", label: "Montant HT annulé", type: "decimal", required: true },
        { name: "cancelledOn", label: "Date", type: "date", required: true },
        { name: "reason", label: "Motif / accord client", required: true },
      ]}
      action={cancelSalesLineAction}
    />
  );
}

export function MarkExpensePaidButton({ id, today }: { id: string; today: string }) {
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">Marquer payée</Button>}
      title="Charge payée"
      initial={{ paidOn: today }}
      fields={[{ name: "paidOn", label: "Date de paiement", type: "date", required: true }]}
      action={(v) => markExpensePaidAction(id, v.paidOn)}
    />
  );
}

export function GenerateRetainerButton({ retainerId, month }: { retainerId: string; month: string }) {
  return (
    <FormDialog
      trigger={<Button size="sm">Générer une période</Button>}
      title="Générer la période du forfait"
      description="Idempotent : si la période existe déjà, rien n'est recréé (ni vente, ni facture brouillon)."
      initial={{ month }}
      fields={[{ name: "month", label: "Mois (n'importe quel jour du mois)", type: "date", required: true }]}
      action={async (v) => {
        const r = await generateRetainerPeriodAction(retainerId, v.month);
        if (r.ok) toast[r.data.created ? "success" : "info"](r.data.created ? "Période générée." : `Aucune création : ${"reason" in r.data ? r.data.reason : "déjà fait"}.`);
        return r;
      }}
    />
  );
}

export function UseCreditForm({ periodId, videos }: { periodId: string; videos: { id: string; reference: string; title: string; type: string }[] }) {
  if (videos.length === 0) return null;
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">Consommer un crédit</Button>}
      title="Consommer un crédit"
      description="Rattache une vidéo du client à la période. N'a aucun effet sur les encaissements."
      initial={{ videoId: videos[0].id }}
      fields={[{ name: "videoId", label: "Vidéo", type: "select", options: videos.map((v) => ({ value: v.id, label: `${v.reference} — ${v.title}` })) }]}
      action={(v) => consumeRetainerCreditAction(periodId, v.videoId)}
    />
  );
}

export function ExchangeRateDialog({ today }: { today: string }) {
  return (
    <FormDialog
      trigger={<Button size="sm">Ajouter un taux</Button>}
      title="Taux de change de référence"
      description="Unités de devise pour 1 €. Utilisé par défaut à partir de sa date ; les opérations passées gardent leur taux figé."
      initial={{ date: today, currency: "IDR", unitsPerEur: "", note: "" }}
      fields={[
        { name: "date", label: "Date d'effet", type: "date", required: true },
        { name: "currency", label: "Devise", type: "select", options: [{ value: "IDR", label: "IDR" }, { value: "USD", label: "USD" }] },
        { name: "unitsPerEur", label: "Unités pour 1 €", type: "decimal", required: true },
        { name: "note", label: "Source / note" },
      ]}
      action={(v) => saveExchangeRateAction({ ...v, currency: v.currency as "IDR" | "USD" })}
    />
  );
}

/** Répartition analytique d'une ligne de vente (dialogue). */
export function ReallocateDialog({
  lineId,
  method,
  current,
  videos,
  net,
}: {
  lineId: string;
  method: "EQUAL" | "WEIGHTED" | "MANUAL";
  current: { videoId: string; weight: string | null; amount: string }[];
  videos: { id: string; reference: string; title: string }[];
  net: string;
}) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<"EQUAL" | "WEIGHTED" | "MANUAL" | "NONE">(method);
  const [rows, setRows] = useState(current.map((c) => ({ videoId: c.videoId, value: m === "MANUAL" ? c.amount : (c.weight ?? "") })));
  const { pending, run } = useAction();
  const manualTotal = sum(rows.map((r) => parseDecimalInput(r.value) ?? new Decimal(0)));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="xs" variant="outline">Répartir</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Répartition analytique</DialogTitle>
          <DialogDescription>Net à répartir : {net}. Somme exacte garantie ; n&apos;affecte ni les ventes signées ni la facturation.</DialogDescription>
        </DialogHeader>
        <NativeSelect aria-label="Méthode" value={m} onChange={(e) => setM(e.target.value as typeof m)}>
          <option value="EQUAL">Parts égales</option>
          <option value="WEIGHTED">Pondération</option>
          <option value="MANUAL">Montants manuels</option>
          <option value="NONE">Retirer la répartition</option>
        </NativeSelect>
        {m !== "NONE" ? (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto av-scroll">
            {videos.map((v) => {
              const row = rows.find((r) => r.videoId === v.id);
              return (
                <li key={v.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <input type="checkbox" aria-label={`Inclure ${v.reference}`} className="accent-[var(--av-accent)]" checked={!!row} onChange={(e) => setRows(e.target.checked ? [...rows, { videoId: v.id, value: "" }] : rows.filter((r) => r.videoId !== v.id))} />
                  <span className="flex-1 truncate">{v.reference} — {v.title}</span>
                  {row && m !== "EQUAL" ? <Input aria-label={`Valeur ${v.reference}`} className="h-7 w-24" inputMode="decimal" value={row.value} onChange={(e) => setRows(rows.map((r) => (r.videoId === v.id ? { ...r, value: e.target.value } : r)))} /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {m === "MANUAL" ? <p className="text-xs text-subtle">Total saisi : {manualTotal.toFixed(2)} / {net}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={pending} onClick={() => run(() => reallocateLineAction({ lineId, allocationMethod: m, allocations: m === "NONE" ? [] : rows }), { onSuccess: () => setOpen(false) })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Allocation analytique d'un coût (enveloppe mensuelle, achat projet). */
export function CostAllocationEditor({ costId, amount, currency, current, videos }: { costId: string; amount: string; currency: string; current: { videoId: string; amount: string }[]; videos: { id: string; reference: string; title: string }[] }) {
  const [rows, setRows] = useState(current);
  const { pending, run } = useAction();
  const total = sum(rows.map((r) => parseDecimalInput(r.amount) ?? new Decimal(0)));
  const rest = (parseDecimalInput(amount) ?? new Decimal(0)).minus(total);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {videos.map((v) => {
          const row = rows.find((r) => r.videoId === v.id);
          return (
            <li key={v.id} className="flex min-w-0 items-center gap-2 text-sm">
              <input type="checkbox" aria-label={`Allouer à ${v.reference}`} className="accent-[var(--av-accent)]" checked={!!row} onChange={(e) => setRows(e.target.checked ? [...rows, { videoId: v.id, amount: "" }] : rows.filter((r) => r.videoId !== v.id))} />
              <span className="flex-1 truncate">{v.reference} — {v.title}</span>
              {row ? <Input aria-label={`Montant ${v.reference}`} className="h-8 w-28" inputMode="decimal" value={row.amount} onChange={(e) => setRows(rows.map((r) => (r.videoId === v.id ? { ...r, amount: e.target.value } : r)))} /> : null}
            </li>
          );
        })}
      </ul>
      {videos.length === 0 ? <p className="text-sm text-subtle">Aucune vidéo candidate (missions du prestataire ou vidéos du projet).</p> : null}
      <p className={`text-sm ${rest.isNegative() ? "text-danger" : "text-subtle"}`}>Alloué {total.toFixed(2)} {currency} · non alloué {rest.toFixed(2)} {currency} (reste visible dans le résultat)</p>
      <Button className="self-start" size="sm" disabled={pending || rest.isNegative()} onClick={() => run(() => setCostAllocationsAction({ costId, allocations: rows }))}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Enregistrer l&apos;allocation
      </Button>
    </div>
  );
}
