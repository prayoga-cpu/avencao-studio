"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateOnly } from "@/lib/dates";
import { PRIORITY, VIDEO_STATUS, VIDEO_STATUSES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/generated/prisma/enums";
import { transitionNeedsReason } from "@/server/domain/video-workflow";
import type { VideoListRow } from "@/server/queries/production";
import { transitionVideoAction } from "./actions";
import { useT } from "#i18n";

/** Motif exigé : règles du workflow (source unique), plus toute annulation. */
function needsReason(from: VideoStatus, to: VideoStatus) {
  return to === "CANCELLED" || transitionNeedsReason(from, to);
}

/**
 * Kanban : les déplacements sont enregistrés côté serveur (workflow + droits). En cas
 * de refus, la carte revient visuellement à sa colonne d'origine.
 */
export function VideosKanban({ rows, showCancelled }: { rows: VideoListRow[]; showCancelled: boolean }) {
  const tr = useT();
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: string; from: VideoStatus; to: VideoStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const columns = VIDEO_STATUSES.filter((s) => s !== "ARCHIVED" && (showCancelled || s !== "CANCELLED"));

  // Resynchronise quand le serveur renvoie de nouvelles données.
  const [lastRows, setLastRows] = useState(rows);
  if (rows !== lastRows) {
    setLastRows(rows);
    setItems(rows);
  }

  function commit(id: string, from: VideoStatus, to: VideoStatus, why: string) {
    setItems((prev) => prev.map((v) => (v.id === id ? { ...v, status: to } : v)));
    start(async () => {
      const res = await transitionVideoAction({ videoId: id, to, reason: why });
      if (!res.ok) {
        setItems((prev) => prev.map((v) => (v.id === id ? { ...v, status: from } : v)));
        toast.error(res.error);
        return;
      }
      toast.success(tr("Déplacée vers « {0} ».", [tr(VIDEO_STATUS[to].label)]));
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as VideoStatus | undefined;
    const video = items.find((v) => v.id === id);
    if (!video || !to || to === video.status) return;
    if (!video.allowed.includes(to)) {
      toast.error(tr("Transition non autorisée : {0} → {1}.", [tr(VIDEO_STATUS[video.status].label), tr(VIDEO_STATUS[to].label)]));
      return;
    }
    if (needsReason(video.status, to)) {
      setReason("");
      setPendingMove({ id, from: video.status, to });
      return;
    }
    commit(id, video.status, to, "");
  }

  const active = items.find((v) => v.id === activeId);
  return (
    <>
      <p className="mb-2 text-xs text-subtle">
        {tr("Glissez une carte vers une colonne autorisée (souris, tactile ou clavier : Espace pour saisir, flèches, Espace pour déposer).")}{saving ? <Loader2 className="ml-2 inline size-3.5 animate-spin" aria-label={tr("Enregistrement")} /> : null}
      </p>
      <DndContext id="videos-kanban" sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto pb-4 av-scroll">
          {columns.map((status) => (
            <Column key={status} status={status} items={items.filter((v) => v.status === status)} activeStatus={active?.status} allowed={active?.allowed ?? []} />
          ))}
        </div>
        <DragOverlay>{active ? <Card video={active} dragging /> : null}</DragOverlay>
      </DndContext>
      <Dialog open={!!pendingMove} onOpenChange={(v) => !v && setPendingMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingMove ? `${tr(VIDEO_STATUS[pendingMove.from].label)} → ${tr(VIDEO_STATUS[pendingMove.to].label)}` : ""}</DialogTitle>
            <DialogDescription>{tr("Un motif est obligatoire pour cette transition ; il est conservé dans l'historique. Pour une annulation avec choix du revenu, utilisez la fiche vidéo.")}</DialogDescription>
          </DialogHeader>
          <Label htmlFor="kb-reason" className="text-xs font-semibold text-subtle">{tr("Motif")}</Label>
          <Textarea id="kb-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMove(null)}>{tr("Annuler")}</Button>
            <Button
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (pendingMove) commit(pendingMove.id, pendingMove.from, pendingMove.to, reason);
                setPendingMove(null);
              }}
            >
              {tr("Confirmer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({ status, items, activeStatus, allowed }: { status: VideoStatus; items: VideoListRow[]; activeStatus?: VideoStatus; allowed: VideoStatus[] }) {
  const tr = useT();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dropAllowed = activeStatus ? allowed.includes(status) : false;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${tr(VIDEO_STATUS[status].label)} (${items.length})`}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-xl border border-border bg-surface/80",
        activeStatus && !dropAllowed && activeStatus !== status && "opacity-40",
        isOver && dropAllowed && "border-brand bg-brand-soft",
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <StatusBadge {...VIDEO_STATUS[status]} />
        <span className="num text-xs text-subtle">{items.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2 p-2">
        {items.map((v) => (
          <DraggableCard key={v.id} video={v} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({ video }: { video: VideoListRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: video.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-30")}>
      <Card video={video} />
    </div>
  );
}

function Card({ video, dragging }: { video: VideoListRow; dragging?: boolean }) {
  const tr = useT();
  return (
    <article className={cn("rounded-lg border border-white/10 bg-[#161616] p-2.5 text-sm shadow-sm", dragging && "rotate-2 border-brand shadow-lg")}>
      <p className="text-[0.7rem] text-faint">{video.reference} · {video.client.displayName}</p>
      <Link href={`/videos/${video.id}`} className="font-medium leading-snug hover:text-brand" onPointerDown={(e) => e.stopPropagation()}>
        {video.title}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[0.7rem]">
        {video.priority === "HIGH" || video.priority === "URGENT" ? <StatusBadge {...PRIORITY[video.priority]} /> : null}
        {video.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" /> : null}
        <span className={cn("num", video.overdue ? "font-semibold text-danger" : "text-subtle")}>{formatDateOnly(video.clientDeadline)}</span>
      </div>
      <p className="mt-1 truncate text-[0.7rem] text-subtle">{video.editors.join(", ") || tr("Non attribuée")}</p>
    </article>
  );
}
