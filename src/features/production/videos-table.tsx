"use client";

import Link from "next/link";
import { useMemo } from "react";
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
import { ArrowDownUp } from "lucide-react";
import { Money, Percent } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateOnly } from "@/lib/dates";
import { PRIORITY, VIDEO_STATUS, VIDEO_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { VideoListRow } from "@/server/queries/production";
import type { EditorChoice } from "./assign-dialog";
import { BulkBar } from "./bulk-bar";
import { useT } from "#i18n";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, VideoListRow>();

export function VideosTable({
  rows,
  showFinance,
  canBulk,
  canForce = false,
  assign = null,
}: {
  rows: VideoListRow[];
  showFinance: boolean;
  canBulk: boolean;
  /** Administrateur : peut forcer une étape hors workflow (motif obligatoire). */
  canForce?: boolean;
  /** Attribution groupée (droit d'affectation) : prestataires proposés. */
  assign?: { editors: EditorChoice[]; canSetPrice: boolean } | null;
}) {
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
              <span className="whitespace-nowrap text-xs text-faint">{row.original.reference} · {tr(VIDEO_TYPE_LABELS[row.original.type])}</span>
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
            <span className="flex flex-col whitespace-nowrap">
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
                cell: ({ row }) => (row.original.finance ? <MarginCell finance={row.original.finance} /> : null),
              }),
            ]
          : []),
      ]),
    [canBulk, showFinance, tr],
  );

  const table = useTable({ features, columns, data: rows, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const sortedRows = table.getRowModel().rows;

  return (
    <div className={cn("flex flex-col gap-3", canBulk && selected.length > 0 && "max-md:pb-60")}>
      {canBulk && selected.length > 0 ? (
        <BulkBar
          selected={selected}
          canForce={canForce}
          assign={assign}
          onClear={() => table.resetRowSelection()}
          onDone={(keep) => table.setRowSelection(Object.fromEntries(keep.map((id) => [id, true])))}
        />
      ) : null}
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
                        "border-b border-brand-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-[#ffc2db]",
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
            {sortedRows.map((row) => (
              <tr key={row.id} className={cn("border-b border-white/5 hover:bg-brand-soft/40", row.getIsSelected() && "bg-brand-soft/50")}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cn("px-3 py-2 align-middle", (cell.column.id === "revenue" || cell.column.id === "margin") && "text-right whitespace-nowrap")}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes sélectionnables (actions groupées disponibles aussi sur téléphone). */}
      <div className="flex flex-col gap-2 md:hidden">
        {canBulk ? (
          <label className="flex items-center gap-2 px-1 text-sm text-subtle">
            <input
              type="checkbox"
              className="size-5 accent-[var(--av-accent)]"
              checked={table.getIsAllRowsSelected()}
              onChange={() => table.toggleAllRowsSelected()}
            />
            {tr("Tout sélectionner ({0})", [rows.length])}
          </label>
        ) : null}
        <ul className="flex flex-col gap-2">
          {sortedRows.map((row) => {
            const r = row.original;
            return (
              <li key={r.id} className={cn("flex gap-3 rounded-xl border border-brand-border bg-surface p-3", row.getIsSelected() && "border-brand bg-brand-soft/40")}>
                {canBulk ? (
                  <input
                    type="checkbox"
                    aria-label={tr("Sélectionner {0}", [r.reference])}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--av-accent)]"
                    checked={row.getIsSelected()}
                    onChange={() => row.toggleSelected()}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link href={`/videos/${r.id}`} className="block">
                    <span className="block truncate text-xs text-faint"><span className="num whitespace-nowrap">{r.reference}</span> · {r.client.displayName}</span>
                    <span className="block font-semibold">{r.title}</span>
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <StatusBadge {...VIDEO_STATUS[r.status]} />
                    {r.isBlocked ? <StatusBadge label={tr("Bloquée")} tone="danger" /> : null}
                    {r.priority !== "NORMAL" ? <StatusBadge {...PRIORITY[r.priority]} /> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={cn("num whitespace-nowrap", r.overdue ? "font-semibold text-danger" : "text-subtle")}>{tr("Client :")}{" "}{formatDateOnly(r.clientDeadline)}{r.overdue ? tr(" · retard") : ""}</span>
                    <span className={r.editors.length ? "text-subtle" : "text-warning"}>{r.editors.join(", ") || tr("non attribuée")}</span>
                    {showFinance && r.finance ? <span className="ml-auto"><Money value={r.finance.marginEur} colorize /></span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function MarginCell({ finance }: { finance: NonNullable<VideoListRow["finance"]> }) {
  const tr = useT();
  return (
    <span className="flex flex-col items-end">
      <Money value={finance.marginEur} colorize />
      <span className={cn("text-xs", finance.missing ? "text-warning" : "text-subtle")}>
        {finance.missing ? tr("{0} coût(s) manquant(s)", [finance.missing]) : <Percent value={finance.ratePct} />}
      </span>
    </span>
  );
}
