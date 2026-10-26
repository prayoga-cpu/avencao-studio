import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";

export const PAGE_SIZE = 25;

export function pageFrom(searchParams: Record<string, string | string[] | undefined>): number {
  const p = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);
  return Number.isInteger(p) && p > 0 ? p : 1;
}

export function Pagination({
  page,
  total,
  basePath,
  searchParams,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  pageSize?: number;
}) {
  const tr = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-faint">{total} {" "}{tr("résultat(s)")}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    return `${basePath}${sp.size ? `?${sp}` : ""}`;
  };
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm hover:bg-brand-soft";
  return (
    <nav aria-label={tr("Pagination")} className="mt-4 flex items-center justify-between gap-2 text-sm">
      <p className="text-xs text-faint">
        {total} {" "}{tr("résultat(s) — page")}{" "}{page}/{pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={linkCls} href={href(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> {" "}{tr("Précédent")}</Link>
        ) : null}
        {page < pages ? (
          <Link className={cn(linkCls)} href={href(page + 1)}>
            {tr("Suivant")}{" "}<ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function sp(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
