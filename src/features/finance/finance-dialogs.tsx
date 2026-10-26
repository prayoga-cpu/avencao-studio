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
import { useT } from "#i18n";

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
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<T>(initial);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setValues(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription asChild><div>{description}</div></DialogDescription> : null}
        </DialogHeader>
        <FormGrid>
          {fields.map((f) => (
            <Field key={f.name} label={tr(f.label)} htmlFor={`fd-${f.name}`} required={f.required} hint={f.hint}>
              {f.type === "select" ? (
                <NativeSelect value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
                </NativeSelect>
              ) : (
                <Input type={f.type === "date" ? "date" : "text"} inputMode={f.type === "decimal" ? "decimal" : undefined} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </Field>
          ))}
        </FormGrid>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>{tr("Annuler")}</Button>
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
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="sm">{tr("Marquer émise")}</Button>}
      title={tr("Facture émise")}
      description={tr("Renseignez le numéro et la date du document émis dans votre outil de facturation. Le taux de change est figé à la date d'émission.")}
      initial={{ invoiceId, number, issueDate: today, dueDate: "", manualFxRate: "" }}
      fields={[
        { name: "number", label: tr("Numéro"), required: true },
        { name: "issueDate", label: tr("Date d'émission"), type: "date", required: true },
        { name: "dueDate", label: tr("Échéance"), type: "date", hint: tr("Vide : conditions du client.") },
        { name: "manualFxRate", label: tr("Taux manuel (si devise ≠ EUR)"), type: "decimal" },
      ]}
      submitLabel={tr("Marquer émise")}
      action={issueInvoiceAction}
    />
  );
}

export function CreditNoteDialog({ invoiceId, today, defaultVat }: { invoiceId: string; today: string; defaultVat: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">{tr("Émettre un avoir")}</Button>}
      title={tr("Avoir sur cette facture")}
      description={tr("Un avoir réduit la facturation une seule fois, à sa date d'émission. Un remboursement éventuel s'enregistre ensuite comme mouvement de trésorerie.")}
      initial={{ invoiceId, number: "", issueDate: today, net: "", vatRate: defaultVat, reason: "", manualFxRate: "" }}
      fields={[
        { name: "number", label: tr("Numéro de l'avoir") },
        { name: "issueDate", label: tr("Date d'émission"), type: "date", required: true },
        { name: "net", label: tr("Montant HT"), type: "decimal", required: true },
        { name: "vatRate", label: tr("TVA %"), type: "decimal", required: true },
        { name: "reason", label: tr("Motif"), required: true },
        { name: "manualFxRate", label: tr("Taux manuel (si devise ≠ EUR)"), type: "decimal" },
      ]}
      submitLabel={tr("Enregistrer l'avoir")}
      action={createCreditNoteAction}
    />
  );
}

export function RefundDialog({ creditNoteId, paymentId, today, max, currency, label }: { creditNoteId?: string; paymentId?: string; today: string; max: string; currency: string; label: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">{label}</Button>}
      title={tr("Enregistrer un remboursement")}
      description={tr("Mouvement de trésorerie sortant déjà effectué (aucun virement déclenché). Maximum : {0} {1}. Ne réduit pas une seconde fois le CA.", [max, currency])}
      initial={{ creditNoteId: creditNoteId ?? "", paymentId: paymentId ?? "", refundedOn: today, amount: max, manualFxRate: "", method: "BANK_TRANSFER", reference: "", reason: "" }}
      fields={[
        { name: "refundedOn", label: tr("Date"), type: "date", required: true },
        { name: "amount", label: tr("Montant ({0})", [currency]), type: "decimal", required: true },
        { name: "method", label: tr("Moyen"), type: "select", options: METHOD_OPTIONS },
        { name: "reference", label: tr("Référence") },
        { name: "reason", label: tr("Motif"), required: true },
        { name: "manualFxRate", label: tr("Taux manuel (si devise ≠ EUR)"), type: "decimal" },
      ]}
      action={(v) => recordRefundAction({ ...v, method: v.method as "BANK_TRANSFER" })}
    />
  );
}

export function AllocatePaymentDialog({ invoiceId, payments, balance }: { invoiceId: string; payments: { id: string; receivedOn: string; available: string; reference: string | null }[]; balance: string }) {
  const tr = useT();
  if (payments.length === 0) return null;
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">{tr("Affecter un encaissement existant")}</Button>}
      title={tr("Affecter un encaissement")}
      description={tr("Reliquat d'un paiement déjà enregistré. Le montant ne peut dépasser ni le disponible du paiement, ni le solde de la facture.")}
      initial={{ paymentId: payments[0].id, invoiceId, amount: [payments[0].available, balance].sort((a, b) => (parseDecimalInput(a)!.lt(parseDecimalInput(b)!) ? -1 : 1))[0] }}
      fields={[
        { name: "paymentId", label: tr("Encaissement"), type: "select", options: payments.map((p) => ({ value: p.id, label: tr("{0} — disponible {1}{2}", [p.receivedOn, p.available, p.reference ? ` (${p.reference})` : ""]) })) },
        { name: "amount", label: tr("Montant"), type: "decimal", required: true },
      ]}
      action={allocateClientPaymentAction}
    />
  );
}

export function CancelLineDialog({ lineId, max, today }: { lineId: string; max: string; today: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="xs" variant="ghost">{tr("Annuler (partiellement)")}</Button>}
      title={tr("Annulation de vente")}
      description={tr("Réduit les ventes signées à la date d'annulation (net restant : {0}). Les allocations sont recalculées au prorata.", [max])}
      initial={{ lineId, amount: max, cancelledOn: today, reason: "" }}
      fields={[
        { name: "amount", label: tr("Montant HT annulé"), type: "decimal", required: true },
        { name: "cancelledOn", label: tr("Date"), type: "date", required: true },
        { name: "reason", label: tr("Motif / accord client"), required: true },
      ]}
      action={cancelSalesLineAction}
    />
  );
}

export function MarkExpensePaidButton({ id, today }: { id: string; today: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">{tr("Marquer payée")}</Button>}
      title={tr("Charge payée")}
      initial={{ paidOn: today }}
      fields={[{ name: "paidOn", label: tr("Date de paiement"), type: "date", required: true }]}
      action={(v) => markExpensePaidAction(id, v.paidOn)}
    />
  );
}

export function GenerateRetainerButton({ retainerId, month }: { retainerId: string; month: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="sm">{tr("Générer une période")}</Button>}
      title={tr("Générer la période du forfait")}
      description={tr("Idempotent : si la période existe déjà, rien n'est recréé (ni vente, ni facture brouillon).")}
      initial={{ month }}
      fields={[{ name: "month", label: tr("Mois (n'importe quel jour du mois)"), type: "date", required: true }]}
      action={async (v) => {
        const r = await generateRetainerPeriodAction(retainerId, v.month);
        if (r.ok) toast[r.data.created ? "success" : "info"](r.data.created ? "Période générée." : `Aucune création : ${"reason" in r.data ? r.data.reason : "déjà fait"}.`);
        return r;
      }}
    />
  );
}

export function UseCreditForm({ periodId, videos }: { periodId: string; videos: { id: string; reference: string; title: string; type: string }[] }) {
  const tr = useT();
  if (videos.length === 0) return null;
  return (
    <FormDialog
      trigger={<Button size="xs" variant="outline">{tr("Consommer un crédit")}</Button>}
      title={tr("Consommer un crédit")}
      description={tr("Rattache une vidéo du client à la période. N'a aucun effet sur les encaissements.")}
      initial={{ videoId: videos[0].id }}
      fields={[{ name: "videoId", label: tr("Vidéo"), type: "select", options: videos.map((v) => ({ value: v.id, label: `${v.reference} — ${v.title}` })) }]}
      action={(v) => consumeRetainerCreditAction(periodId, v.videoId)}
    />
  );
}

export function ExchangeRateDialog({ today }: { today: string }) {
  const tr = useT();
  return (
    <FormDialog
      trigger={<Button size="sm">{tr("Ajouter un taux")}</Button>}
      title={tr("Taux de change de référence")}
      description={tr("Unités de devise pour 1 €. Utilisé par défaut à partir de sa date ; les opérations passées gardent leur taux figé.")}
      initial={{ date: today, currency: "IDR", unitsPerEur: "", note: "" }}
      fields={[
        { name: "date", label: tr("Date d'effet"), type: "date", required: true },
        { name: "currency", label: tr("Devise"), type: "select", options: [{ value: "IDR", label: tr("IDR") }, { value: "USD", label: tr("USD") }] },
        { name: "unitsPerEur", label: tr("Unités pour 1 €"), type: "decimal", required: true },
        { name: "note", label: tr("Source / note") },
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
  autoAllocate = false,
  hasProject = false,
}: {
  lineId: string;
  method: "EQUAL" | "WEIGHTED" | "MANUAL";
  current: { videoId: string; weight: string | null; amount: string }[];
  videos: { id: string; reference: string; title: string }[];
  net: string;
  /** Forfait : parts égales sur toutes les vidéos actives du projet, recalculées automatiquement. */
  autoAllocate?: boolean;
  hasProject?: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(autoAllocate);
  const [m, setM] = useState<"EQUAL" | "WEIGHTED" | "MANUAL" | "NONE">(method);
  const [rows, setRows] = useState(current.map((c) => ({ videoId: c.videoId, value: m === "MANUAL" ? c.amount : (c.weight ?? "") })));
  const { pending, run } = useAction();
  const manualTotal = sum(rows.map((r) => parseDecimalInput(r.value) ?? new Decimal(0)));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="xs" variant="outline">{tr("Répartir")}</Button></DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{tr("Répartition analytique")}</DialogTitle>
          <DialogDescription>{tr("Net à répartir :")}{" "}{net}{tr(". Somme exacte garantie ; n'affecte ni les ventes signées ni la facturation.")}</DialogDescription>
        </DialogHeader>
        {hasProject ? (
          <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1 accent-[var(--av-accent)]" />
            <span>
              <span className="block font-semibold">{tr("Répartition automatique (forfait)")}</span>
              <span className="block text-xs text-subtle">{tr("Parts égales sur toutes les vidéos actives du projet, recalculées quand une vidéo est ajoutée ou annulée.")}</span>
            </span>
          </label>
        ) : null}
        {!auto ? (
          <NativeSelect aria-label={tr("Méthode")} value={m} onChange={(e) => setM(e.target.value as typeof m)}>
            <option value="EQUAL">{tr("Parts égales")}</option>
            <option value="WEIGHTED">{tr("Pondération")}</option>
            <option value="MANUAL">{tr("Montants manuels")}</option>
            <option value="NONE">{tr("Retirer la répartition")}</option>
          </NativeSelect>
        ) : null}
        {!auto && m !== "NONE" ? (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto av-scroll">
            {videos.map((v) => {
              const row = rows.find((r) => r.videoId === v.id);
              return (
                <li key={v.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <input type="checkbox" aria-label={tr("Inclure {0}", [v.reference])} className="accent-[var(--av-accent)]" checked={!!row} onChange={(e) => setRows(e.target.checked ? [...rows, { videoId: v.id, value: "" }] : rows.filter((r) => r.videoId !== v.id))} />
                  <span className="flex-1 truncate">{v.reference} — {v.title}</span>
                  {row && m !== "EQUAL" ? <Input aria-label={tr("Valeur {0}", [v.reference])} className="h-7 w-24" inputMode="decimal" value={row.value} onChange={(e) => setRows(rows.map((r) => (r.videoId === v.id ? { ...r, value: e.target.value } : r)))} /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {!auto && m === "MANUAL" ? <p className="text-xs text-subtle">{tr("Total saisi :")}{" "}{manualTotal.toFixed(2)} / {net}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr("Annuler")}</Button>
          <Button
            disabled={pending}
            onClick={() =>
              run(() => reallocateLineAction(auto ? { lineId, allocationMethod: "EQUAL", allocations: [], autoAllocate: true } : { lineId, allocationMethod: m, allocations: m === "NONE" ? [] : rows }), {
                onSuccess: () => setOpen(false),
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {tr("Enregistrer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Allocation analytique d'un coût (enveloppe mensuelle, achat projet). */
export function CostAllocationEditor({ costId, amount, currency, current, videos }: { costId: string; amount: string; currency: string; current: { videoId: string; amount: string }[]; videos: { id: string; reference: string; title: string }[] }) {
  const tr = useT();
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
              <input type="checkbox" aria-label={tr("Allouer à {0}", [v.reference])} className="accent-[var(--av-accent)]" checked={!!row} onChange={(e) => setRows(e.target.checked ? [...rows, { videoId: v.id, amount: "" }] : rows.filter((r) => r.videoId !== v.id))} />
              <span className="flex-1 truncate">{v.reference} — {v.title}</span>
              {row ? <Input aria-label={tr("Montant {0}", [v.reference])} className="h-8 w-28" inputMode="decimal" value={row.amount} onChange={(e) => setRows(rows.map((r) => (r.videoId === v.id ? { ...r, amount: e.target.value } : r)))} /> : null}
            </li>
          );
        })}
      </ul>
      {videos.length === 0 ? <p className="text-sm text-subtle">{tr("Aucune vidéo candidate (missions du prestataire ou vidéos du projet).")}</p> : null}
      <p className={`text-sm ${rest.isNegative() ? "text-danger" : "text-subtle"}`}>{tr("Alloué")}{" "}{total.toFixed(2)} {currency} {" "}{tr("· non alloué")}{" "}{rest.toFixed(2)} {currency} {" "}{tr("(reste visible dans le résultat)")}</p>
      <Button className="self-start" size="sm" disabled={pending || rest.isNegative()} onClick={() => run(() => setCostAllocationsAction({ costId, allocations: rows }))}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Enregistrer l'allocation")}</Button>
    </div>
  );
}
