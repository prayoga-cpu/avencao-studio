import Link from "next/link";
import { cn } from "@/lib/utils";

/** Onglets sous forme de liens (état dans l'URL, navigation clavier native). */
export function TabLinks({
  tabs,
  active,
  basePath,
  param = "onglet",
  extraParams,
}: {
  tabs: { value: string; label: string; count?: number | null }[];
  active: string;
  basePath: string;
  param?: string;
  extraParams?: Record<string, string>;
}) {
  return (
    <nav aria-label="Onglets" className="-mx-1 mb-5 overflow-x-auto av-scroll">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {tabs.map((t) => {
          const sp = new URLSearchParams(extraParams);
          if (t.value !== tabs[0].value) sp.set(param, t.value);
          const href = `${basePath}${sp.size ? `?${sp.toString()}` : ""}`;
          const isActive = t.value === active;
          return (
            <li key={t.value}>
              <Link
                href={href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "border-brand text-foreground" : "border-transparent text-subtle hover:text-foreground",
                )}
              >
                {t.label}
                {t.count !== undefined && t.count !== null ? (
                  <span className="num rounded-full bg-surface-3 px-1.5 text-[0.7rem] text-subtle">{t.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
