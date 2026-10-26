"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { useAction } from "./use-action";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

/** Bouton + dialogue de confirmation, avec motif facultatif ou obligatoire. */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirmer",
  reason = "none",
  reasonLabel = "Motif",
  destructive = false,
  action,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  reason?: "none" | "optional" | "required";
  reasonLabel?: string;
  destructive?: boolean;
  action: (reason: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  const missingReason = reason === "required" && text.trim().length < 3;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setText(""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr(title)}</DialogTitle>
          {description ? <DialogDescription asChild><div>{trNode(tr, description)}</div></DialogDescription> : null}
        </DialogHeader>
        {reason !== "none" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-reason" className="text-xs font-semibold text-subtle">
              {tr(reasonLabel)}
              {reason === "required" ? <span className="text-brand"> *</span> : tr(" (facultatif)")}
            </Label>
            <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {tr("Annuler")}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || missingReason}
            onClick={() =>
              run(() => action(text.trim()), {
                onSuccess: () => {
                  setOpen(false);
                  setText("");
                  onDone?.();
                },
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {tr(confirmLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
