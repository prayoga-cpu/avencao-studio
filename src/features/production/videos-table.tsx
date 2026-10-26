"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDownUp, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/app/field";
import { Money, Percent } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateOnly } from "@/lib/dates";
import { PRIORITY, VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Priority, VideoStatus } from "@/generated/prisma/enums";
import type { VideoListRow } from "@/server/queries/production";
import { bulkVideoAction } from "./actions";
import { useT } from "#i18n";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, VideoListRow>();

export function VideosTable({ rows, showFinance, canBulk }: { rows: VideoListRow[]; showFinance: boolean; canBulk: boolean }) {
  const tr = useT();
  const columns = useMemo(
    () =>
      helper.columns([
        ...(canBulk
          ? [
              helper.display({
                id: "select",
                header: ({ table }) => (
                  <input
                    type="checkbox"
                    aria-label={tr("Tout sélectionner")}
                    className="size-4 accent-[var(--av-accent)]"
                    checked={table.getIsAllRowsSelected()}
                    onChange={() => table.toggleAllRowsSelected()}
                  />
                ),
                cell: ({ row }) => (
                  <input
                    type="checkbox"
                    aria-label={tr("Sélectionner {0}", [row.original.reference])}
                    className="size-4 accent-[var(--av-accent)]"
                    checked={row.getIsSelected()}
                    onChange={() => row.toggleSelected()}
                  />
                ),
              }),
            ]
          : []),
        helper.accessor("reference", {
          header: tr("Vidéo"),
          sortFn: "alphanumeric",
          cell: ({ row }) => (
            <Link href={`/videos/${row.original.id}`} className="hover:text-brand hover:underline">
              <span className="text-xs text-faint">{row.original.reference} · {tr(VIDEO_TYPE_LABELS[row.original.type])}</span>
              <span className="block font-medium text-foreground">{row.original.title}</span>
            </Link>
          ),
        }),
        helper.accessor((r) => r.client.displayName, { id: "client", header: tr("Client"), sortFn: "text" }),
        helper.accessor("status", {
          header: tr("Étape"),
          cell: ({ row }) => (
            <span className="flex flex-wrap gap-1">
              <StatusBadge {...VIDEO_STATUS[row.original.status]} />
              {row.original.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" title={row.original.blockedReason ?? undefined} /> : null}
            </span>
          ),
        }),
        helper.accessor("priority", { header: tr("Priorité"), cell: ({ row }) => <StatusBadge {...PRIORITY[row.original.priority]} /> }),
        helper.accessor((r) => r.editors.join(", "), { id: "editors", header: tr("Monteur(s)"), cell: ({ getValue }) => getValue() || <span className="text-warning">{tr("non attribuée")}</span> }),
        helper.accessor((r) => r.clientDeadline ?? "9999", {
          id: "deadline",
          header: tr("Deadline client"),
          sortFn: "alphanumeric",
          cell: ({ row }) => (
            <span className="flex flex-col">
              <span className={cn("num", row.original.overdue ? "font-semibold text-danger" : row.original.dueSoon && "text-warning")}>
                {formatDateOnly(row.original.clientDeadline)}
                {row.original.overdue ? tr(" · retard") : ""}
              </span>
              <span className="num text-xs text-faint">{tr("Interne :")}{" "}{formatDateOnly(row.original.internalDeadline)}</span>
            </span>
          ),
        }),
        ...(showFinance
          ? [
              helper.accessor((r) => r.finance?.revenueEur ?? "0", { id: "revenue", header: tr("Revenu alloué"), cell: ({ row }) => <Money value={row.original.finance?.revenueEur} /> }),
              helper.accessor((r) => r.finance?.marginEur ?? "0", {
                id: "margin",
                header: tr("Marge"),
                cell: ({ row }) =>
                  row.original.finance ? (
                    <span className="flex flex-col items-end">
                      <Money value={row.original.finance.marginEur} colorize />
                      <span className={cn("text-xs", row.original.finance.missing ? "text-warning" : "text-subtle")}>
                        {row.original.finance.missing ? tr("{0} coût(s) manquant(s)", [row.original.finance.missing]) : <Percent value={row.original.finance.ratePct} />}
                      </span>
                    </span>
                  ) : null,
              }),
            ]
          : []),
      ]),
    [canBulk, showFinance, tr],
  );

  const table = useTable({ features, columns, data: rows, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="flex flex-col gap-3">
      {canBulk && selected.length > 0 ? <BulkBar selected={selected} onDone={() => table.resetRowSelection()} /> : null}
      <div className="hidden overflow-x-auto rounded-xl border border-brand-border md:block av-scroll">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">{tr("Liste des vidéos")}</caption>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id} className="bg-bordeaux">
                {g.headers.map((h) => {
                  const sortable = h.column.getCanSort() && h.id !== "select";
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                      className={cn(
                        "border-b border-brand-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#ffc2db]",
                        (h.id === "revenue" || h.id === "margin") && "text-right",
                      )}
                    >
                      {sortable ? (
                        <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-white" onClick={h.column.getToggleSortingHandler()}>
                          <table.FlexRender header={h} />
                          <ArrowDownUp className="size-3 opacity-60" aria-hidden />
                        </button>
                      ) : (
                        <table.FlexRender header={h} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn("border-b border-white/5 hover:bg-brand-soft/40", row.getIsSelected() && "bg-brand-soft/50")}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cn("px-3 py-2 align-middle", (cell.column.id === "revenue" || cell.column.id === "margin") && "text-right")}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-brand-border bg-surface p-3">
            <Link href={`/videos/${r.id}`} className="block">
              <span className="text-xs text-faint">{r.reference} · {r.client.displayName}</span>
              <span className="block font-semibold">{r.title}</span>
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <StatusBadge {...VIDEO_STATUS[r.status]} />
              {r.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" /> : null}
              <span className={cn("num", r.overdue ? "font-semibold text-danger" : "text-subtle")}>{tr("Client :")}{" "}{formatDateOnly(r.clientDeadline)}</span>
              <span className="text-subtle">· {r.editors.join(", ") || tr("non attribuée")}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BULK_TARGETS: VideoStatus[] = ["WAITING_RUSHES", "TO_ASSIGN", "EDITING", "CLIENT_REVIEW", "APPROVED", "DELIVERED", "ARCHIVED"];

function BulkBar({ selected, onDone }: { selected: VideoListRow[]; onDone: () => void }) {
  const tr = useT();
  const [priority, setPriority] = useState<Priority | "">("");
  const [to, setTo] = useState<VideoStatus | "">("");
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  return (
    <div role="region" aria-label={tr("Actions groupées")} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand bg-brand-soft p-3 text-sm">
      <span className="font-semibold">{selected.length} {" "}{tr("sélectionnée(s)")}</span>
      <NativeSelect aria-label={tr("Priorité")} className="w-auto" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
        <option value="">{tr("Changer la priorité…")}</option>
        {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{tr(p.label)}</option>)}
      </NativeSelect>
      <NativeSelect aria-label={tr("Étape")} className="w-auto" value={to} onChange={(e) => setTo(e.target.value as VideoStatus | "")}>
        <option value="">{tr("Passer à l'étape…")}</option>
        {BULK_TARGETS.map((s) => <option key={s} value={s}>{tr(VIDEO_STATUS[s].label)}</option>)}
      </NativeSelect>
      {to ? <Input aria-label={tr("Motif")} className="w-56" placeholder={tr("Motif (si exigé)")} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
      <Button
        size="sm"
        disabled={pending || (!priority && !to)}
        onClick={() =>
          run(() => bulkVideoAction({ ids: selected.map((s) => s.id), priority: priority || undefined, to: to || undefined, reason }), {
            onSuccess: (r) => {
              toast.success(tr("{0} mise(s) à jour.", [r.ok]));
              if (r.errors.length) toast.warning(tr("{0} refus : {1}{2}", [r.errors.length, r.errors.slice(0, 3).join(" · "), r.errors.length > 3 ? "…" : ""]), { duration: 10000 });
              onDone();
            },
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldAlert aria-hidden />}
        {tr("Appliquer")}</Button>
      <p className="w-full text-xs text-subtle">{tr("Chaque vidéo est vérifiée individuellement (droits et workflow) : les refus sont listés.")}</p>
    </div>
  );
}
