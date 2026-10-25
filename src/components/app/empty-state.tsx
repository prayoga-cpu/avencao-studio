import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-10 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
        {icon ?? <Inbox className="size-5" />}
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-subtle">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
