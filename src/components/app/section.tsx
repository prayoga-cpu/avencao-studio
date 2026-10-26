import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

/** Carte de section (coins 16 px, bordure discrète rose). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const tr = useT();
  return (
    <section id={id} className={cn("rounded-xl border border-brand-border bg-surface", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-bold text-foreground">{trNode(tr, title)}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-subtle">{trNode(tr, description)}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DefinitionList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  const tr = useT();
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-subtle">{tr(item.label)}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
