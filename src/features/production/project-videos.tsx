"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Money, Percent } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateOnly } from "@/lib/dates";
import { VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { VideoStatus, VideoType } from "@/generated/prisma/enums";
import type { EditorChoice } from "./assign-dialog";
import { BulkBar } from "./bulk-bar";
import { useT } from "#i18n";

export interface ProjectVideoRow {
  id: string;
  reference: string;
  title: string;
  type: VideoType;
  status: VideoStatus;
  isBlocked: boolean;
  editors: string[];
  clientDeadline: string | null;
  overdue: boolean;
  finance: { revenueEur: string; marginEur: string; ratePct: string | null; missing: number } | null;
}

/**
 * Vidéos d'un projet, sélectionnables : attribution groupée à un prestataire, changement
 * d'étape ou de priorité pour tout ou partie du projet. Cartes sous 768 px.
 */
export function ProjectVideos({
  rows,
  showFinance,
  canBulk,
  canForce,
  assign,
  empty,
}: {
  rows: ProjectVideoRow[];
  showFinance: boolean;
  canBulk: boolean;
  canForce: boolean;
  assign: { editors: EditorChoice[]; canSetPrice: boolean } | null;
  empty: ReactNode;
}) {
  const tr = useT();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (rows.length === 0) return <>{empty}</>;
  const selected = rows.filter((r) => picked.has(r.id));
  const allPicked = selected.length === rows.length;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  const editorsCell = (r: ProjectVideoRow) => (r.editors.length ? r.editors.join(", ") : <span className="text-warning">{tr("à attribuer")}</span>);
  const deadlineCell = (r: ProjectVideoRow) => (
    <span className={cn("num whitespace-nowrap", r.overdue && "font-semibold text-danger")}>
      {formatDateOnly(r.clientDeadline)}
      {r.overdue ? tr(" · retard") : ""}
    </span>
  );
  const marginCell = (r: ProjectVideoRow) =>
    r.finance ? (
      <span className="flex flex-col items-end">
        <Money value={r.finance.marginEur} colorize />
        <span className={r.finance.missing ? "text-xs text-warning" : "text-xs text-subtle"}>{r.finance.missing ? tr("coût manquant") : <Percent value={r.finance.ratePct} />}</span>
      </span>
    ) : null;

  return (
    <div className={cn("flex flex-col gap-3", canBulk && selected.length > 0 && "max-md:pb-60")}>
      {canBulk && selected.length > 0 ? (
        <BulkBar
          selected={selected}
          canForce={canForce}
          assign={assign}
          onClear={() => setPicked(new Set())}
          onDone={(keep) => setPicked(new Set(keep))}
        />
      ) : null}

      <div className="hidden overflow-x-auto rounded-xl border border-brand-border md:block av-scroll">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <caption className="sr-only">{tr("Vidéos du projet")}</caption>
          <thead>
            <tr className="bg-bordeaux text-left text-xs font-semibold uppercase tracking-wide text-[#ffc2db]">
              {canBulk ? (
                <th scope="col" className="w-10 border-b border-brand-border px-3 py-2.5">
                  <input type="checkbox" aria-label={tr("Tout sélectionner")} className="size-4 accent-[var(--av-accent)]" checked={allPicked} onChange={toggleAll} />
                </th>
              ) : null}
              <th scope="col" className="border-b border-brand-border px-3 py-2.5">{tr("Vidéo")}</th>
              <th scope="col" className="hidden border-b border-brand-border px-3 py-2.5 lg:table-cell">{tr("Type")}</th>
              <th scope="col" className="border-b border-brand-border px-3 py-2.5">{tr("Étape")}</th>
              <th scope="col" className="border-b border-brand-border px-3 py-2.5">{tr("Prestataires")}</th>
              <th scope="col" className="border-b border-brand-border px-3 py-2.5 whitespace-nowrap">{tr("Deadline client")}</th>
              {showFinance ? (
                <>
                  <th scope="col" className="border-b border-brand-border px-3 py-2.5 text-right whitespace-nowrap">{tr("Revenu alloué")}</th>
                  <th scope="col" className="border-b border-brand-border px-3 py-2.5 text-right">{tr("Marge")}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-b border-white/5 last:border-0 hover:bg-brand-soft/40", picked.has(r.id) && "bg-brand-soft/50")}>
                {canBulk ? (
                  <td className="px-3 py-2.5 align-middle">
                    <input type="checkbox" aria-label={tr("Sélectionner {0}", [r.reference])} className="size-4 accent-[var(--av-accent)]" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                ) : null}
                <td className="px-3 py-2.5 align-middle">
                  <Link href={`/videos/${r.id}`} className="font-medium text-foreground hover:text-brand hover:underline">
                    <span className="num block whitespace-nowrap text-xs text-faint">{r.reference}</span>
                    <span className="block">{r.title}</span>
                  </Link>
                </td>
                <td className="hidden px-3 py-2.5 align-middle text-[#e6e6e6] lg:table-cell">{tr(VIDEO_TYPE_LABELS[r.type])}</td>
                <td className="px-3 py-2.5 align-middle">
                  <span className="flex flex-wrap gap-1"><StatusBadge {...VIDEO_STATUS[r.status]} />{r.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" /> : null}</span>
                </td>
                <td className="px-3 py-2.5 align-middle text-[#e6e6e6]">{editorsCell(r)}</td>
                <td className="px-3 py-2.5 align-middle text-[#e6e6e6]">{deadlineCell(r)}</td>
                {showFinance ? (
                  <>
                    <td className="num px-3 py-2.5 text-right align-middle whitespace-nowrap"><Money value={r.finance?.revenueEur} /></td>
                    <td className="num px-3 py-2.5 text-right align-middle whitespace-nowrap">{marginCell(r)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {canBulk ? (
          <label className="flex items-center gap-2 px-1 text-sm text-subtle">
            <input type="checkbox" className="size-5 accent-[var(--av-accent)]" checked={allPicked} onChange={toggleAll} />
            {tr("Tout sélectionner ({0})", [rows.length])}
          </label>
        ) : null}
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className={cn("flex gap-3 rounded-xl border border-brand-border bg-surface p-3", picked.has(r.id) && "border-brand bg-brand-soft/40")}>
              {canBulk ? (
                <input type="checkbox" aria-label={tr("Sélectionner {0}", [r.reference])} className="mt-0.5 size-5 shrink-0 accent-[var(--av-accent)]" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link href={`/videos/${r.id}`} className="block">
                  <span className="block text-xs text-faint"><span className="num whitespace-nowrap">{r.reference}</span> · {tr(VIDEO_TYPE_LABELS[r.type])}</span>
                  <span className="block font-semibold">{r.title}</span>
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge {...VIDEO_STATUS[r.status]} />
                  {r.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" /> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                  <span>{deadlineCell(r)}</span>
                  <span>{editorsCell(r)}</span>
                  {showFinance && r.finance ? <span className="ml-auto"><Money value={r.finance.marginEur} colorize /></span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
