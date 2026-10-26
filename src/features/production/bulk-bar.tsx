"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/app/field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITY, VIDEO_STATUS, VIDEO_STATUSES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Priority, VideoStatus } from "@/generated/prisma/enums";
import { bulkTargetOptions, transitionNeedsReason } from "@/server/domain/video-workflow";
import type { BulkRefusal } from "@/server/bulk";
import { bulkVideoAction } from "./actions";
import type { EditorChoice } from "./assign-dialog";
import { BulkAssignDialog } from "./bulk-assign-dialog";
import { useT } from "#i18n";

export interface BulkRow {
  id: string;
  reference: string;
  title: string;
  status: VideoStatus;
}

/**
 * Barre d'actions groupées (priorité, étape, attribution). Seules les étapes que le workflow
 * autorise pour au moins une vidéo sélectionnée sont proposées, avec leur couverture
 * (« 7/7 ») ; un administrateur peut forcer une étape avec un motif (tracé).
 * Sous 768 px, la barre est fixée en bas de l'écran.
 */
export function BulkBar({
  selected,
  onDone,
  onClear,
  canForce,
  assign,
}: {
  selected: BulkRow[];
  /** Fin d'action : identifiants à garder sélectionnés (vidéos refusées). */
  onDone: (keepIds: string[]) => void;
  onClear: () => void;
  canForce: boolean;
  assign: { editors: EditorChoice[]; canSetPrice: boolean } | null;
}) {
  const tr = useT();
  const [priority, setPriority] = useState<Priority | "">("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [refusals, setRefusals] = useState<BulkRefusal[]>([]);
  const { pending, run } = useAction();

  const options = useMemo(() => bulkTargetOptions(selected.map((s) => s.status), VIDEO_STATUSES), [selected]);
  const [mode, to] = target ? (target.split(":") as ["step" | "force", VideoStatus]) : [null, null];
  const force = mode === "force";
  const needsReason = !!to && (force || selected.some((s) => transitionNeedsReason(s.status, to)));
  const blocked = pending || (!priority && !to) || (needsReason && !reason.trim());
  // Forçage proposé seulement là où le workflow ne couvre pas toute la sélection.
  const forceTargets = canForce
    ? VIDEO_STATUSES.filter((s) => {
        const o = options.find((x) => x.to === s);
        const covered = (o?.eligible ?? 0) + selected.filter((x) => x.status === s).length;
        return covered < selected.length;
      })
    : [];
  const idsByRef = new Map(selected.map((s) => [s.reference, s.id]));

  function keepRefused(groups: BulkRefusal[]) {
    setRefusals(groups);
    onDone(groups.flatMap((g) => g.refs).map((ref) => idsByRef.get(ref)).filter((id): id is string => !!id));
  }

  function apply() {
    run(
      () => bulkVideoAction({ ids: selected.map((s) => s.id), priority: priority || undefined, to: to ?? undefined, reason, force }),
      {
        onSuccess: (r) => {
          const refused = r.refusals.reduce((n, g) => n + g.refs.length, 0);
          const parts = [
            r.moved ? tr("{0} vidéo(s) passée(s) à « {1} »", [r.moved, to ? tr(VIDEO_STATUS[to].label) : ""]) : null,
            r.prioritized ? tr("{0} priorité(s) modifiée(s)", [r.prioritized]) : null,
          ].filter(Boolean);
          const summary = parts.join(" · ");
          const description = r.refusals.map((g) => `${g.message} (${g.refs.length})`).join(" · ");
          if (refused === 0) toast.success(summary || tr("Rien à modifier."));
          else if (parts.length) toast.warning(tr("{0} — {1} refus", [summary, refused]), { description, duration: 12000 });
          else toast.error(tr("Aucune vidéo mise à jour : {0} refus", [refused]), { description, duration: 12000 });
          setPriority("");
          setTarget("");
          setReason("");
          keepRefused(r.refusals);
        },
      },
    );
  }

  return (
    <div
      role="region"
      aria-label={tr("Actions groupées")}
      className={cn(
        "z-40 flex flex-col gap-2 border-brand bg-[#1a0610f2] p-3 text-sm backdrop-blur",
        // Mobile : barre fixée en bas (zone sûre iOS) ; tablette et bureau : bandeau au-dessus de la liste.
        "fixed inset-x-0 bottom-0 rounded-t-2xl border-t pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(0,0,0,0.5)]",
        "md:static md:rounded-xl md:border md:bg-brand-soft md:pb-3 md:shadow-none",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{tr("{0} sélectionnée(s)", [selected.length])}</span>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          {assign ? <BulkAssignDialog videos={selected} editors={assign.editors} canSetPrice={assign.canSetPrice} onDone={keepRefused} /> : null}
          <Button size="icon-sm" variant="ghost" aria-label={tr("Désélectionner")} onClick={onClear}><X aria-hidden /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <NativeSelect aria-label={tr("Priorité")} className="md:w-auto" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
          <option value="">{tr("Changer la priorité…")}</option>
          {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{tr(p.label)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label={tr("Étape")} className="md:w-auto md:max-w-72" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{tr("Passer à l'étape…")}</option>
          {options.length ? (
            <optgroup label={tr("Étapes possibles (vidéos concernées)")}>
              {options.map((o) => <option key={o.to} value={`step:${o.to}`}>{`${tr(VIDEO_STATUS[o.to].label)} · ${o.eligible}/${o.total}`}</option>)}
            </optgroup>
          ) : (
            <option value="" disabled>{tr("Aucune étape commune autorisée")}</option>
          )}
          {forceTargets.length ? (
            <optgroup label={tr("Forcer l'étape (administrateur, motif obligatoire)")}>
              {forceTargets.map((s) => <option key={s} value={`force:${s}`}>{tr(VIDEO_STATUS[s].label)}</option>)}
            </optgroup>
          ) : null}
        </NativeSelect>
        {to && needsReason ? (
          <Input
            aria-label={tr("Motif")}
            className="col-span-2 md:w-64"
            placeholder={force ? tr("Motif de l'exception (obligatoire)") : tr("Motif (obligatoire)")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        <Button size="sm" className="col-span-2 max-md:h-10" disabled={blocked} onClick={apply}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {tr("Appliquer")}</Button>
        <div className="hidden items-center gap-2 md:ml-auto md:flex">
          {assign ? <BulkAssignDialog videos={selected} editors={assign.editors} canSetPrice={assign.canSetPrice} onDone={keepRefused} /> : null}
          <Button size="sm" variant="ghost" onClick={onClear}><X aria-hidden /> {" "}{tr("Désélectionner")}</Button>
        </div>
      </div>
      {force ? <p className="text-xs text-warning">{tr("Étape forcée hors workflow : réservée aux administrateurs, enregistrée comme exception avec votre motif.")}</p> : null}
      {refusals.length ? (
        <div className="rounded-lg border border-[#ffc10740] bg-[#ffc10712] p-2 text-xs text-[#ffe08a]" role="status">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{tr("Refus (vidéos restées sélectionnées)")}</p>
            <button type="button" className="text-subtle hover:text-foreground" aria-label={tr("Fermer")} onClick={() => setRefusals([])}><X className="size-3.5" aria-hidden /></button>
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {refusals.map((g) => (
              <li key={g.message}>
                <span className="font-medium">{g.message}</span> <span className="text-subtle">— {g.refs.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hidden text-xs text-subtle md:block">{tr("Chaque vidéo est vérifiée individuellement (droits et workflow) : seules les étapes autorisées sont proposées, les refus sont listés.")}</p>
      )}
    </div>
  );
}
