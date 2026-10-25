"use client";

import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveDeadlineAction } from "./actions";

export function MoveDeadlineButton({ videoId, field, current, label }: { videoId: string; field: "VIDEO_INTERNAL" | "VIDEO_CLIENT"; current: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setDate(current); setReason(""); } }}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Déplacer : ${label}`} title="Déplacer l'échéance"><CalendarClock aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déplacer l&apos;échéance</DialogTitle>
          <DialogDescription>{label}. L&apos;ancienne date, la nouvelle et le motif sont conservés dans l&apos;historique de la vidéo.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="md-date" className="text-xs text-subtle">Nouvelle date</Label>
        <Input id="md-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Label htmlFor="md-reason" className="text-xs text-subtle">Motif {field === "VIDEO_CLIENT" ? "(obligatoire)" : "(facultatif)"}</Label>
        <Input id="md-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={pending || !date || (field === "VIDEO_CLIENT" && reason.trim().length < 3)} onClick={() => run(() => moveDeadlineAction({ videoId, field, newDate: date, reason }), { onSuccess: () => setOpen(false) })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Déplacer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
