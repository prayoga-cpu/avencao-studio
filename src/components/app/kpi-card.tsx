import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  /** Base de calcul affichée sous la valeur (périmètre et date utilisée). */
  basis: string;
  href?: string;
  delta?: { label: string; direction: "up" | "down" | "flat"; favorable?: boolean } | null;
  warning?: string | null;
  className?: string;
}

/** Carte KPI : valeur, base de calcul explicite, complétude et lien vers la liste filtrée. */
export function KpiCard({ label, value, basis, href, delta, warning, className }: KpiCardProps) {
  const tr = useT();
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col gap-2 rounded-xl border border-brand-border bg-surface p-4 transition-colors",
        href && "hover:border-brand/50 hover:bg-[#151515]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{trNode(tr, label)}</p>
        {href ? <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-brand" aria-hidden /> : null}
      </div>
      <div className="num text-2xl font-bold text-foreground">{value}</div>
      {delta ? (
        <p
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            delta.direction === "flat" ? "text-subtle" : delta.favorable ? "text-success" : "text-danger",
          )}
        >
          {delta.direction === "up" ? <ArrowUpRight className="size-3.5" aria-hidden /> : null}
          {delta.direction === "down" ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
          {tr(delta.label)}
        </p>
      ) : null}
      <p className="mt-auto text-xs leading-relaxed text-faint">{trNode(tr, basis)}</p>
      {warning ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-2" aria-label={tr("{0} — voir le détail", [label])}>
      {body}
    </Link>
  ) : (
    body
  );
}
