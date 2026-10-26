"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateOnly } from "@/lib/dates";
import { OPPORTUNITY_STAGE, OPPORTUNITY_STAGES } from "@/lib/labels";
import type { CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/generated/prisma/enums";
import { moveOpportunityAction } from "./actions";
import { useT } from "#i18n";

export interface OppCard {
  id: string;
  title: string;
  client: string;
  stage: OpportunityStage;
  amount: string | null;
  currency: string;
  probability: string | null;
  followUpOn: string | null;
  overdueFollowUp: boolean;
}

export function PipelineBoard({ items: initial }: { items: OppCard[] }) {
  const tr = useT();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [prev, setPrev] = useState(initial);
  if (initial !== prev) {
    setPrev(initial);
    setItems(initial);
  }
  const [lost, setLost] = useState<{ id: string; from: OpportunityStage } | null>(null);
  const [reason, setReason] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function move(id: string, from: OpportunityStage, to: OpportunityStage, why = "") {
    setItems((list) => list.map((o) => (o.id === id ? { ...o, stage: to } : o)));
    start(async () => {
      const r = await moveOpportunityAction(id, to, why);
      if (!r.ok) {
        setItems((list) => list.map((o) => (o.id === id ? { ...o, stage: from } : o)));
        toast.error(r.error);
      } else router.refresh();
    });
  }
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const to = e.over?.id as OpportunityStage | undefined;
    const item = items.find((o) => o.id === id);
    if (!item || !to || to === item.stage) return;
    if (to === "LOST") {
      setReason("");
      setLost({ id, from: item.stage });
      return;
    }
    move(id, item.stage, to);
  }
  return (
    <>
      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 av-scroll">
          {OPPORTUNITY_STAGES.map((stage) => (
            <StageColumn key={stage} stage={stage} items={items.filter((o) => o.stage === stage)} />
          ))}
        </div>
      </DndContext>
      <Dialog open={!!lost} onOpenChange={(v) => !v && setLost(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Motif de perte")}</DialogTitle></DialogHeader>
          <Label htmlFor="lost-reason" className="text-xs text-subtle">{tr("Pourquoi cette opportunité est-elle perdue ?")}</Label>
          <Input id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLost(null)}>{tr("Annuler")}</Button>
            <Button disabled={reason.trim().length < 3} onClick={() => { if (lost) move(lost.id, lost.from, "LOST", reason); setLost(null); }}>{tr("Confirmer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StageColumn({ stage, items }: { stage: OpportunityStage; items: OppCard[] }) {
  const tr = useT();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} aria-label={tr(OPPORTUNITY_STAGE[stage].label)} className={cn("flex w-60 shrink-0 flex-col rounded-xl border border-border bg-surface/80", isOver && "border-brand bg-brand-soft")}>
      <header className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-semibold">
        {tr(OPPORTUNITY_STAGE[stage].label)}
        <span className="num text-xs text-subtle">{items.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2 p-2">
        {items.map((o) => <Card key={o.id} item={o} />)}
      </div>
    </section>
  );
}

function Card({ item }: { item: OppCard }) {
  const tr = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <article ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none rounded-lg border border-white/10 bg-[#161616] p-2.5 text-sm", isDragging && "opacity-60 ring-1 ring-brand")}>
      <p className="text-[0.7rem] text-faint">{item.client}</p>
      <Link href={`/prospection/${item.id}`} className="font-medium hover:text-brand" onPointerDown={(e) => e.stopPropagation()}>{item.title}</Link>
      <p className="mt-1 text-xs text-subtle">
        <Money value={item.amount} currency={item.currency as CurrencyCode} empty={tr("montant ?")} />
        {item.probability ? ` · ${item.probability} %` : ""}
      </p>
      {item.followUpOn ? <p className={cn("text-xs", item.overdueFollowUp ? "font-semibold text-warning" : "text-faint")}>{tr("Relance")}{" "}{formatDateOnly(item.followUpOn)}</p> : null}
    </article>
  );
}
