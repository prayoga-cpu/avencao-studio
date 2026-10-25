"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/app/field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { legacyTargetsAction, qualifyLegacyAction } from "./legacy-actions";

export function LegacyQualifyButtons({ id, clientId }: { id: string; clientId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"LINKED_INVOICE" | "LINKED_PAYMENT" | "ARCHIVED">("ARCHIVED");
  const [targets, setTargets] = useState<{ invoices: { id: string; label: string }[]; payments: { id: string; label: string }[] } | null>(null);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [loading, start] = useTransition();
  const { pending, run } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !targets) start(async () => {
          const r = await legacyTargetsAction(clientId);
          if (r.ok) setTargets(r.data);
          else toast.error(r.error);
        });
      }}
    >
      <DialogTrigger asChild><Button size="xs" variant="outline">Qualifier</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qualifier ce paiement historique</DialogTitle>
          <DialogDescription>Rattachez-le à une facture ou un encaissement déjà saisis dans le nouveau CRM, ou archivez-le comme information. Aucun montant n&apos;est créé.</DialogDescription>
        </DialogHeader>
        {loading ? <Loader2 className="animate-spin" aria-label="Chargement" /> : null}
        <NativeSelect aria-label="Qualification" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setTarget(""); }}>
          <option value="ARCHIVED">Archiver (informatif, hors totaux)</option>
          <option value="LINKED_INVOICE">Rattacher à une facture</option>
          <option value="LINKED_PAYMENT">Rattacher à un encaissement</option>
        </NativeSelect>
        {status !== "ARCHIVED" && targets ? (
          <NativeSelect aria-label="Cible" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Choisir —</option>
            {(status === "LINKED_INVOICE" ? targets.invoices : targets.payments).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </NativeSelect>
        ) : null}
        <Label htmlFor="lq-note" className="text-xs text-subtle">Justification</Label>
        <Input id="lq-note" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            disabled={pending || note.trim().length < 3 || (status !== "ARCHIVED" && !target)}
            onClick={() => run(() => qualifyLegacyAction({ id, status, note, invoiceId: status === "LINKED_INVOICE" ? target : undefined, paymentId: status === "LINKED_PAYMENT" ? target : undefined }), { onSuccess: () => setOpen(false) })}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
