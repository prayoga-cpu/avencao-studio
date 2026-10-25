"use client";

import { useState } from "react";
import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VIDEO_STATUS } from "@/lib/labels";
import type { VideoStatus } from "@/generated/prisma/enums";
import { setBlockedAction, transitionVideoAction } from "./actions";

export interface TransitionOption {
  to: VideoStatus;
  requiresReason: boolean;
  hint?: string;
}

/** Boutons d'étape : seules les transitions autorisées par le workflow et le rôle sont proposées. */
export function WorkflowActions({ videoId, options, hasRevenue }: { videoId: string; options: TransitionOption[]; hasRevenue: boolean }) {
  const [target, setTarget] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const [revenue, setRevenue] = useState<"KEEP" | "CANCEL">("CANCEL");
  const { pending, run } = useAction();
  if (options.length === 0) return <p className="text-sm text-subtle">Aucune transition disponible depuis cette étape pour votre rôle.</p>;
  const go = (opt: TransitionOption) => {
    if (opt.requiresReason || opt.to === "CANCELLED") {
      setReason("");
      setTarget(opt);
      return;
    }
    run(() => transitionVideoAction({ videoId, to: opt.to, reason: "" }));
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.to}
            size="sm"
            variant={o.to === "CANCELLED" ? "destructive" : o.requiresReason ? "outline" : "default"}
            disabled={pending}
            onClick={() => go(o)}
            title={o.hint}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {o.to === "CANCELLED" ? <Ban aria-hidden /> : null}
            {o.to === "CANCELLED" ? "Annuler la vidéo" : `→ ${VIDEO_STATUS[o.to].label}`}
          </Button>
        ))}
      </div>
      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.to === "CANCELLED" ? "Annuler la vidéo" : `Passer à « ${target ? VIDEO_STATUS[target.to].label : ""} »`}</DialogTitle>
            <DialogDescription>
              {target?.hint ?? "Cette transition est tracée avec son motif dans l'historique de la vidéo."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wf-reason" className="text-xs font-semibold text-subtle">Motif <span className="text-brand">*</span></Label>
            <Textarea id="wf-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {target?.to === "CANCELLED" ? (
            <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 text-sm">
              <legend className="px-1 text-xs font-semibold text-subtle">Revenu (selon l&apos;accord client)</legend>
              <p className="text-xs text-faint">Les coûts déjà engagés ou validés restent dus au prestataire.</p>
              <label className="flex items-start gap-2">
                <input type="radio" name="rev" checked={revenue === "CANCEL"} onChange={() => setRevenue("CANCEL")} className="mt-1 accent-[var(--av-accent)]" />
                <span>Annuler la part de vente allouée à cette vidéo {hasRevenue ? "" : "(aucune vente allouée)"}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="rev" checked={revenue === "KEEP"} onChange={() => setRevenue("KEEP")} className="mt-1 accent-[var(--av-accent)]" />
                <span>Maintenir le revenu (le client paie malgré l&apos;annulation)</span>
              </label>
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>Retour</Button>
            <Button
              variant={target?.to === "CANCELLED" ? "destructive" : "default"}
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                target &&
                run(() => transitionVideoAction({ videoId, to: target.to, reason, revenueTreatment: target.to === "CANCELLED" ? revenue : undefined }), {
                  onSuccess: () => setTarget(null),
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BlockToggle({ videoId, isBlocked, reason }: { videoId: string; isBlocked: boolean; reason: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  if (isBlocked) {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setBlockedAction({ videoId, blocked: false, reason: "", ownerId: "" }))} title={reason ?? undefined}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldAlert aria-hidden />} Lever le blocage
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ShieldAlert aria-hidden /> Signaler un blocage
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaler un blocage</DialogTitle>
            <DialogDescription>Indicateur séparé : l&apos;étape en cours est conservée.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="block-reason" className="text-xs font-semibold text-subtle">Motif</Label>
          <Input id="block-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex. rushs manquants, attente validation script…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button disabled={pending || text.trim().length < 3} onClick={() => run(() => setBlockedAction({ videoId, blocked: true, reason: text, ownerId: "" }), { onSuccess: () => { setOpen(false); setText(""); } })}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
