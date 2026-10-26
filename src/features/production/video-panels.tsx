"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActionButton } from "@/components/app/action-button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormGrid, NativeSelect } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates";
import { CURRENCY_LABELS, FEEDBACK_CATEGORY, FEEDBACK_SOURCE_LABELS, FEEDBACK_STATUS, LINK_KIND_LABELS, VERSION_STATUS } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import type { FeedbackCategory, FeedbackSource, FeedbackStatus, LinkKind, VersionStatus } from "@/generated/prisma/enums";
import {
  acceptChangeRequestAction,
  addFeedbackAction,
  addLinkAction,
  addTimeEntryAction,
  createChangeRequestAction,
  rejectChangeRequestAction,
  removeLinkAction,
  reviewVersionAction,
  setCostAmountAction,
  setFeedbackStatusAction,
  submitVersionAction,
  toggleChecklistAction,
} from "./actions";
import { changeRequestSchema, feedbackSchema, linkSchema, timeEntrySchema, versionSchema } from "./schemas";
import { useT } from "#i18n";

// ─────────────────────────── Liens ───────────────────────────

export function LinksPanel({
  videoId,
  links,
  canManage,
  editorMode = false,
}: {
  videoId: string;
  links: { id: string; kind: LinkKind; url: string; label: string | null; editorVisible?: boolean }[];
  canManage: boolean;
  editorMode?: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {links.length === 0 ? <p className="text-sm text-subtle">{tr("Aucun lien. Les rushs et masters restent dans Drive / Dropbox / Frame.io.")}</p> : null}
      <ul className="flex flex-col gap-1.5">
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-2 hover:text-brand">
              <ExternalLink className="size-4 shrink-0 text-subtle" aria-hidden />
              <span className="shrink-0 text-xs font-semibold text-subtle">{tr(LINK_KIND_LABELS[l.kind])}</span>
              <span className="truncate">{tr(l.label) ?? l.url}</span>
            </a>
            <span className="flex items-center gap-1">
              {l.editorVisible === false ? <StatusBadge label={tr("Interne")} tone="muted" /> : null}
              {canManage && !editorMode ? (
                <ActionButton size="icon-sm" variant="ghost" ariaLabel={tr("Supprimer le lien")} action={() => removeLinkAction(l.id)}>
                  <Trash2 aria-hidden />
                </ActionButton>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">{tr("Retirer un lien du CRM ne révoque pas son partage public : gérez les droits dans Drive ou Frame.io.")}</p>
      {canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="self-start">
              <Plus aria-hidden /> {" "}{tr("Ajouter un lien")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Ajouter un lien")}</DialogTitle>
            </DialogHeader>
            {open ? <LinkForm videoId={videoId} editorMode={editorMode} onDone={() => setOpen(false)} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function LinkForm({ videoId, editorMode, onDone }: { videoId: string; editorMode: boolean; onDone: () => void }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: linkSchema,
    defaultValues: { videoId, kind: editorMode ? "REVIEW" : "RUSHES", url: "", label: "", editorVisible: true },
    action: addLinkAction,
    onSuccess: onDone,
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={tr("Type")} htmlFor="l-kind">
        <NativeSelect {...form.register("kind")}>
          {Object.entries(LINK_KIND_LABELS)
            .filter(([v]) => !editorMode || v === "REVIEW" || v === "FINAL_EXPORT")
            .map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
        </NativeSelect>
      </Field>
      <Field label={tr("Adresse")} htmlFor="l-url" required error={err("url")}><Input type="url" placeholder={tr("https://")} {...form.register("url")} /></Field>
      <Field label={tr("Libellé")} htmlFor="l-label"><Input {...form.register("label")} /></Field>
      {!editorMode ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("editorVisible")} className="accent-[var(--av-accent)]" />
          {tr("Visible par le(s) monteur(s) affecté(s)")}</label>
      ) : null}
      <FormActions pending={pending} onCancel={onDone} submitLabel={tr("Ajouter")} />
    </form>
  );
}

// ─────────────────────────── Versions ───────────────────────────

export interface VersionItem {
  id: string;
  number: number;
  url: string;
  description: string | null;
  status: VersionStatus;
  createdAt: Date;
  decisionNote: string | null;
  author?: string | null;
}

export function SubmitVersionForm({ videoId, nextNumber }: { videoId: string; nextNumber: number }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: versionSchema,
    defaultValues: { videoId, url: "", description: "" },
    action: submitVersionAction,
    onSuccess: () => form.reset({ videoId, url: "", description: "" }),
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[2fr_2fr_auto] md:items-end" noValidate>
      <Field label={tr("Lien de la V{0} (Frame.io, Drive…)", [nextNumber])} htmlFor="v-url" required error={err("url")}>
        <Input type="url" placeholder={tr("https://")} {...form.register("url")} />
      </Field>
      <Field label={tr("Description")} htmlFor="v-desc"><Input {...form.register("description")} placeholder={tr("Ce qui a changé")} /></Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Déposer la V")}{nextNumber}
      </Button>
    </form>
  );
}

export function VersionsList({ versions, canReview, videoStatus, timezone }: { versions: VersionItem[]; canReview: boolean; videoStatus: string; timezone: string }) {
  const tr = useT();
  if (versions.length === 0) return <p className="text-sm text-subtle">{tr("Aucune version déposée.")}</p>;
  return (
    <ol className="flex flex-col gap-2">
      {versions.map((v, i) => (
        <li key={v.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-soft px-2 py-0.5 text-sm font-bold text-brand">V{v.number}</span>
              <StatusBadge {...VERSION_STATUS[v.status]} />
              <span className="text-xs text-subtle">{formatDateTime(v.createdAt, timezone)}{v.author ? ` · ${v.author}` : ""}</span>
            </div>
            <a href={v.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              {tr("Ouvrir")}{" "}<ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          {v.description ? <p className="mt-1 text-sm">{v.description}</p> : null}
          {v.decisionNote ? <p className="mt-1 whitespace-pre-wrap text-xs text-subtle">{tr("Décision :")}{" "}{v.decisionNote}</p> : null}
          {canReview && i === 0 && v.status === "PENDING" && videoStatus === "INTERNAL_REVIEW" ? (
            <ReviewButtons versionId={v.id} stage="internal" />
          ) : null}
          {canReview && i === 0 && (v.status === "APPROVED_INTERNAL" || v.status === "PENDING") && videoStatus === "CLIENT_REVIEW" ? (
            <ReviewButtons versionId={v.id} stage="client" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

type Outcome = "SEND_TO_CLIENT" | "APPROVE" | "INTERNAL_CHANGES" | "CLIENT_APPROVED" | "CLIENT_CHANGES";

function ReviewButtons({ versionId, stage }: { versionId: string; stage: "internal" | "client" }) {
  const tr = useT();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("INCLUDED");
  const { pending, run } = useAction();
  const options: { value: Outcome; label: string; variant: "default" | "outline" }[] =
    stage === "internal"
      ? [
          { value: "SEND_TO_CLIENT", label: tr("Valider et envoyer au client"), variant: "default" },
          { value: "APPROVE", label: tr("Valider (sans validation client)"), variant: "outline" },
          { value: "INTERNAL_CHANGES", label: tr("Demander des retouches"), variant: "outline" },
        ]
      : [
          { value: "CLIENT_APPROVED", label: tr("Validation client reçue"), variant: "default" },
          { value: "CLIENT_CHANGES", label: tr("Retours client"), variant: "outline" },
        ];
  const needsNote = outcome === "INTERNAL_CHANGES" || outcome === "CLIENT_CHANGES";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((o) => (
        <Button key={o.value} size="sm" variant={o.variant} onClick={() => { setOutcome(o.value); setNote(""); setCategory("INCLUDED"); }}>
          {tr(o.label)}
        </Button>
      ))}
      <Dialog open={!!outcome} onOpenChange={(v) => !v && setOutcome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr(options.find((o) => o.value === outcome)?.label)}</DialogTitle>
            <DialogDescription>
              {needsNote ? tr("Les retours sont transmis au monteur affecté. Précisez leur nature pour le suivi des allers-retours.") : tr("La décision est enregistrée et tracée.")}
            </DialogDescription>
          </DialogHeader>
          {needsNote ? (
            <fieldset className="flex min-w-0 flex-col gap-2 text-sm">
              <legend className="mb-1 text-xs font-semibold text-subtle">{tr("Nature des retours")}</legend>
              {(Object.keys(FEEDBACK_CATEGORY) as FeedbackCategory[]).map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="radio" name="cat" checked={category === c} onChange={() => setCategory(c)} className="accent-[var(--av-accent)]" />
                  {tr(FEEDBACK_CATEGORY[c].label)}
                  {c === "OUT_OF_SCOPE" ? <span className="text-xs text-subtle">{tr("— à traiter par une demande hors périmètre")}</span> : null}
                  {c === "INTERNAL_ERROR" ? <span className="text-xs text-subtle">{tr("— ne consomme pas d'aller-retour")}</span> : null}
                </label>
              ))}
            </fieldset>
          ) : null}
          <Label htmlFor="review-note" className="text-xs font-semibold text-subtle">{needsNote ? tr("Retours") : tr("Commentaire (facultatif)")}</Label>
          <Textarea id="review-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcome(null)}>{tr("Annuler")}</Button>
            <Button
              disabled={pending || (needsNote && note.trim().length < 3)}
              onClick={() => outcome && run(() => reviewVersionAction({ versionId, outcome, category, note }), { onSuccess: () => setOutcome(null) })}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {tr("Confirmer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── Retours ───────────────────────────

export interface FeedbackItem {
  id: string;
  body: string;
  timecode: string | null;
  status: FeedbackStatus;
  source: FeedbackSource;
  category: FeedbackCategory;
  createdAt: Date;
  versionNumber?: number | null;
  visibleToEditor?: boolean;
  author?: string | null;
}

export function FeedbackList({ items, canResolve, canReject, timezone }: { items: FeedbackItem[]; canResolve: boolean; canReject: boolean; timezone: string }) {
  const tr = useT();
  if (items.length === 0) return <p className="text-sm text-subtle">{tr("Aucun retour.")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((f) => (
        <li key={f.id} className="rounded-xl border border-border p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-subtle">
            <StatusBadge {...FEEDBACK_STATUS[f.status]} />
            <StatusBadge {...FEEDBACK_CATEGORY[f.category]} />
            <span>{tr(FEEDBACK_SOURCE_LABELS[f.source])}</span>
            {f.versionNumber ? <span>· V{f.versionNumber}</span> : null}
            {f.timecode ? <span className="num rounded bg-surface-3 px-1.5">{f.timecode}</span> : null}
            <span>· {formatDateTime(f.createdAt, timezone)}{f.author ? ` · ${f.author}` : ""}</span>
            {f.visibleToEditor === false ? <StatusBadge label={tr("Interne uniquement")} tone="muted" /> : null}
          </div>
          <p className="whitespace-pre-wrap">{f.body}</p>
          {f.status === "OPEN" && canResolve ? (
            <div className="mt-2 flex gap-2">
              <ActionButton size="xs" action={() => setFeedbackStatusAction(f.id, "RESOLVED")}>
                <Check aria-hidden /> {" "}{tr("Traité")}</ActionButton>
              {canReject ? (
                <ActionButton size="xs" variant="ghost" action={() => setFeedbackStatusAction(f.id, "REJECTED")}>
                  {tr("Écarter")}</ActionButton>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function FeedbackForm({ videoId, versions }: { videoId: string; versions: { id: string; number: number }[] }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: feedbackSchema,
    defaultValues: { videoId, versionId: versions[0]?.id ?? "", source: "INTERNAL", body: "", timecode: "", category: "INCLUDED", visibleToEditor: true },
    action: addFeedbackAction,
    onSuccess: () => form.reset({ ...form.getValues(), body: "", timecode: "" }),
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border p-3" noValidate>
      <FormGrid className="md:grid-cols-4">
        <Field label={tr("Version")} htmlFor="f-version">
          <NativeSelect {...form.register("versionId")}>
            <option value="">—</option>
            {versions.map((v) => <option key={v.id} value={v.id}>V{v.number}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Origine")} htmlFor="f-source">
          <NativeSelect {...form.register("source")}>
            {Object.entries(FEEDBACK_SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Nature")} htmlFor="f-cat">
          <NativeSelect {...form.register("category")}>
            {Object.entries(FEEDBACK_CATEGORY).map(([v, c]) => <option key={v} value={v}>{tr(c.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tr("Timecode")} htmlFor="f-tc" error={err("timecode")}><Input {...form.register("timecode")} placeholder="00:42" /></Field>
      </FormGrid>
      <Field label={tr("Retour")} htmlFor="f-body" required error={err("body")}><Textarea rows={3} {...form.register("body")} /></Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("visibleToEditor")} className="accent-[var(--av-accent)]" />
          {tr("Visible par le monteur")}</label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {tr("Ajouter le retour")}</Button>
      </div>
    </form>
  );
}

// ─────────────────────────── Checklist ───────────────────────────

export function Checklist({ items, canCheck }: { items: { id: string; label: string; checked: boolean; checkedBy?: string | null }[]; canCheck: boolean }) {
  const tr = useT();
  const { pending, run } = useAction();
  const done = items.filter((i) => i.checked).length;
  return (
    <div>
      <p className="mb-2 text-xs text-subtle">
        {done}/{items.length} {" "}{tr("vérifications · validations humaines (aucun contrôle automatique)")}</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm has-[:checked]:border-[#22c55e60]">
              <input
                type="checkbox"
                checked={i.checked}
                disabled={!canCheck || pending}
                onChange={(e) => run(() => toggleChecklistAction(i.id, e.target.checked))}
                className="size-4 accent-[var(--av-success)]"
              />
              <span className={i.checked ? "text-subtle line-through" : undefined}>{tr(i.label)}</span>
              {i.checkedBy ? <span className="ml-auto text-xs text-faint">{i.checkedBy}</span> : null}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────── Temps ───────────────────────────

export function TimeEntryForm({
  videoId,
  assignments,
  today,
  canOwnerTime,
}: {
  videoId: string;
  assignments: { id: string; label: string }[];
  today: string;
  canOwnerTime: boolean;
}) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: timeEntrySchema,
    defaultValues: { videoId, assignmentId: assignments.length === 1 ? assignments[0].id : "", workedOn: today, hours: "", isOwnerTime: false, note: "" },
    action: addTimeEntryAction,
    onSuccess: () => form.reset({ ...form.getValues(), hours: "", note: "" }),
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-5 md:items-end" noValidate>
      <Field label={tr("Mission")} htmlFor="t-a">
        <NativeSelect {...form.register("assignmentId")}>
          <option value="">{canOwnerTime ? tr("— (temps interne)") : tr("— Choisir —")}</option>
          {assignments.map((a) => <option key={a.id} value={a.id}>{tr(a.label)}</option>)}
        </NativeSelect>
      </Field>
      <Field label={tr("Date")} htmlFor="t-d" error={err("workedOn")}><Input type="date" {...form.register("workedOn")} /></Field>
      <Field label={tr("Heures")} htmlFor="t-h" required error={err("hours")}><Input inputMode="decimal" {...form.register("hours")} placeholder="1,5" /></Field>
      <Field label={tr("Note")} htmlFor="t-n"><Input {...form.register("note")} /></Field>
      <div className="flex flex-col gap-2">
        {canOwnerTime ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" {...form.register("isOwnerTime")} className="accent-[var(--av-accent)]" />
            {tr("Mon temps (valorisé)")}</label>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {tr("Saisir")}</Button>
      </div>
    </form>
  );
}

// ─────────────────────────── Coûts ───────────────────────────

export function CostAmountDialog({ costId, currency, current, label, validated }: { costId: string; currency: string; current: string | null; label: string; validated: boolean }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(current ?? "");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant={current ? "ghost" : "outline"}>{current ? tr("Corriger") : tr("Renseigner le coût")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{tr("Montant en")}{" "}{currency}{tr(". Toute correction est tracée ; un coût déjà réglé n'est plus modifiable.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ca-amount" className="text-xs text-subtle">{tr("Montant (")}{currency})</Label>
            <Input id="ca-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {currency !== "EUR" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="ca-rate" className="text-xs text-subtle">{tr("Taux manuel (")}{currency} {" "}{tr("pour 1 €) — sinon taux de référence")}</Label>
              <Input id="ca-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ca-reason" className="text-xs text-subtle">{tr("Motif")}{" "}{validated ? tr("(obligatoire)") : tr("(facultatif)")}</Label>
            <Input id="ca-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr("Annuler")}</Button>
          <Button disabled={pending} onClick={() => run(() => setCostAmountAction({ costId, amount, manualFxRate: rate, reason }), { onSuccess: () => setOpen(false) })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {tr("Enregistrer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Demandes hors périmètre ───────────────────────────

export interface ChangeRequestItem {
  id: string;
  title: string;
  description: string | null;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  clientPrice: string | null;
  clientCurrency: string | null;
  editorCost: string | null;
  editorCurrency: string | null;
  editorName: string | null;
  acceptanceNote: string | null;
}

export function ChangeRequestsPanel({
  videoId,
  items,
  editors,
  canCreate,
  canAccept,
  showAmounts,
}: {
  videoId: string;
  items: ChangeRequestItem[];
  editors: { value: string; label: string }[];
  canCreate: boolean;
  canAccept: boolean;
  showAmounts: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? <p className="text-sm text-subtle">{tr("Aucune demande hors périmètre.")}</p> : null}
      {items.map((c) => (
        <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{c.title}</p>
            <StatusBadge label={c.status === "PROPOSED" ? tr("Proposée") : c.status === "ACCEPTED" ? tr("Acceptée") : tr("Refusée")} tone={c.status === "ACCEPTED" ? "success" : c.status === "REJECTED" ? "muted" : "warning"} />
          </div>
          {c.description ? <p className="mt-1 text-subtle">{c.description}</p> : null}
          {showAmounts ? (
            <p className="mt-1 text-xs text-subtle">
              {tr("Supplément client :")}{" "}{c.clientPrice ? <Money value={c.clientPrice} currency={c.clientCurrency as CurrencyCode} /> : "—"} {" "}{tr("· Coût monteur :")}{" "}
              {c.editorCost ? <Money value={c.editorCost} currency={c.editorCurrency as CurrencyCode} /> : "—"}
              {c.editorName ? ` (${c.editorName})` : ""}
            </p>
          ) : null}
          {c.acceptanceNote ? <p className="mt-1 text-xs text-faint">{tr("Accord :")}{" "}{c.acceptanceNote}</p> : null}
          {c.status === "PROPOSED" && canAccept ? (
            <div className="mt-2 flex gap-2">
              <ConfirmAction
                trigger={<Button size="xs">{tr("Accord client reçu")}</Button>}
                title={tr("Enregistrer l'acceptation")}
                description={tr("Crée une ligne de vente (supplément client) et/ou un coût additionnel engagé. La marge avant/après est conservée dans l'historique.")}
                reason="required"
                reasonLabel={tr("Trace de l'accord (email, date, interlocuteur)")}
                confirmLabel={tr("Accepter")}
                action={async (note) => {
                  const r = await acceptChangeRequestAction(c.id, note);
                  if (r.ok) toast.info(tr("Marge de la vidéo : {0} € → {1} €", [r.data.marginBefore, r.data.marginAfter]));
                  return r;
                }}
              />
              <ConfirmAction trigger={<Button size="xs" variant="ghost">{tr("Refuser")}</Button>} title={tr("Refuser la demande")} reason="optional" confirmLabel={tr("Refuser")} action={(note) => rejectChangeRequestAction(c.id, note)} />
            </div>
          ) : null}
        </div>
      ))}
      {canCreate ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="self-start"><Plus aria-hidden /> {" "}{tr("Demande hors périmètre")}</Button>
          </DialogTrigger>
          <DialogContent size="xl">
            <DialogHeader>
              <DialogTitle>{tr("Demande hors périmètre")}</DialogTitle>
              <DialogDescription>{tr("Aucun montant n'est modifié sans accord enregistré : la demande reste « proposée » jusqu'à l'acceptation.")}</DialogDescription>
            </DialogHeader>
            {open ? <ChangeRequestForm videoId={videoId} editors={editors} showAmounts={showAmounts} onDone={() => setOpen(false)} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function ChangeRequestForm({ videoId, editors, showAmounts, onDone }: { videoId: string; editors: { value: string; label: string }[]; showAmounts: boolean; onDone: () => void }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: changeRequestSchema,
    defaultValues: { videoId, title: "", description: "", clientPrice: "", clientCurrency: "EUR", editorCost: "", editorCurrency: "EUR", editorId: "" },
    action: createChangeRequestAction,
    onSuccess: onDone,
  });
  const { register } = form;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={tr("Intitulé")} htmlFor="cr-title" required error={err("title")}><Input {...register("title")} placeholder={tr("Ex. version 16:9 supplémentaire")} /></Field>
      <Field label={tr("Description")} htmlFor="cr-desc"><Textarea rows={2} {...register("description")} /></Field>
      {showAmounts ? (
        <FormGrid>
          <Field label={tr("Supplément client HT")} htmlFor="cr-price" error={err("clientPrice")}><Input inputMode="decimal" {...register("clientPrice")} /></Field>
          <Field label={tr("Devise")} htmlFor="cr-cc">
            <NativeSelect {...register("clientCurrency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("Coût monteur supplémentaire")} htmlFor="cr-cost" error={err("editorCost")}><Input inputMode="decimal" {...register("editorCost")} /></Field>
          <Field label={tr("Devise")} htmlFor="cr-ec">
            <NativeSelect {...register("editorCurrency")}>{Object.entries(CURRENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}</NativeSelect>
          </Field>
          <Field label={tr("Prestataire concerné")} htmlFor="cr-editor" className="md:col-span-2">
            <NativeSelect {...register("editorId")}>
              <option value="">—</option>
              {editors.map((e) => <option key={e.value} value={e.value}>{tr(e.label)}</option>)}
            </NativeSelect>
          </Field>
        </FormGrid>
      ) : (
        <p className="text-xs text-subtle">{tr("Les montants seront complétés par une personne disposant de l'accès financier.")}</p>
      )}
      <FormActions pending={pending} onCancel={onDone} submitLabel={tr("Enregistrer la demande")} />
    </form>
  );
}
