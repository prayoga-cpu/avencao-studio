"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "./field";
import { useT } from "#i18n";

const PRESETS = [
  { value: "month", label: "Ce mois" },
  { value: "last-month", label: "Mois dernier" },
  { value: "quarter", label: "Ce trimestre" },
  { value: "year", label: "Cette année" },
  { value: "last-year", label: "Année dernière" },
  { value: "custom", label: "Personnalisée" },
];

/** Filtre de période partagé (dashboard, finances, rapports). */
export function PeriodFilter({ label }: { label?: string }) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const preset = params.get("periode") ?? "month";
  function set(next: Record<string, string | null>) {
    const s = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    start(() => router.replace(`${pathname}?${s.toString()}`, { scroll: false }));
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label={tr("Période")} className="w-auto" value={preset} onChange={(e) => set({ periode: e.target.value === "month" ? null : e.target.value })}>
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {tr(p.label)}
          </option>
        ))}
      </NativeSelect>
      {preset === "custom" ? (
        <>
          <Input type="date" aria-label={tr("Du")} className="w-auto" defaultValue={params.get("du") ?? ""} onChange={(e) => set({ du: e.target.value || null })} />
          <Input type="date" aria-label={tr("Au")} className="w-auto" defaultValue={params.get("au") ?? ""} onChange={(e) => set({ au: e.target.value || null })} />
        </>
      ) : null}
      {label ? <span className="text-xs text-subtle">{label}</span> : null}
      {pending ? <Loader2 className="size-4 animate-spin text-subtle" aria-label={tr("Chargement")} /> : null}
    </div>
  );
}
