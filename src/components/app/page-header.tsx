import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** En-tête de page : titre, sous-titre utile, actions et filtres. */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("av-panel-header -mx-4 -mt-4 mb-6 px-4 pb-4 pt-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-6 lg:px-8 lg:pt-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-subtle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
