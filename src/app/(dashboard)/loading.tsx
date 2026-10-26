import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "#i18n";

export default function Loading() {
  const tr = useT();
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{tr("Chargement…")}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-64 bg-surface-2" />
        <Skeleton className="h-4 w-96 max-w-full bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl bg-surface" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl bg-surface" />
    </div>
  );
}
