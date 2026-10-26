import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Colonnes numériques : alignées à droite, chiffres tabulaires. */
  numeric?: boolean;
  className?: string;
  /** Masquée dans la vue « cartes » mobile. */
  hideOnCard?: boolean;
}

/**
 * Tableau serveur accessible ; sous 768 px il devient une liste de cartes lisible.
 * La première colonne sert de titre de carte.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  empty,
  caption,
  footer,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const tr = useT();
  if (rows.length === 0 && empty) return <>{trNode(tr, empty)}</>;
  const [first, ...rest] = columns;
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-xl border border-brand-border md:block av-scroll">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {caption ? <caption className="sr-only">{tr(caption)}</caption> : null}
          <thead>
            <tr className="bg-bordeaux">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "border-b border-brand-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#ffc2db]",
                    c.numeric && "text-right",
                    c.className,
                  )}
                >
                  {trNode(tr, c.header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/5 transition-colors last:border-0 hover:bg-brand-soft/40">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle text-[#e6e6e6]", c.numeric && "num text-right", c.className)}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="font-medium text-foreground hover:text-brand hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="border-t border-brand-border bg-surface-2/60">{footer}</tfoot> : null}
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl border border-brand-border bg-surface p-3">
            <div className="mb-2 font-semibold">
              {rowHref ? (
                <Link href={rowHref(row)} className="hover:text-brand">
                  {first.cell(row)}
                </Link>
              ) : (
                first.cell(row)
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {rest
                .filter((c) => !c.hideOnCard)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[0.7rem] uppercase tracking-wide text-faint">{trNode(tr, c.header)}</dt>
                    <dd className={cn("break-words", c.numeric && "num")}>{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-2 md:hidden">{/* totaux affichés dans le pied desktop */}</div> : null}
    </div>
  );
}
