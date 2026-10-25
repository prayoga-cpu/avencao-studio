"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "./field";

export interface FilterDef {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}

/** Barre de filtres synchronisée avec l'URL (partageable, compatible retour arrière). */
export function FilterBar({
  filters = [],
  searchPlaceholder = "Rechercher…",
  showSearch = true,
  children,
}: {
  filters?: FilterDef[];
  searchPlaceholder?: string;
  showSearch?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp.toString()}` : ""}`, { scroll: false }));
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const active = filters.some((f) => params.get(f.name)) || !!params.get("q");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      {showSearch ? (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={q}
            className="pl-8"
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => update({ q: v.trim() || null }), 300);
            }}
          />
        </div>
      ) : null}
      {filters.map((f) => (
        <NativeSelect
          key={f.name}
          aria-label={f.label}
          className="sm:w-auto sm:min-w-40"
          value={params.get(f.name) ?? ""}
          onChange={(e) => update({ [f.name]: e.target.value || null })}
        >
          <option value="">{f.allLabel ?? `${f.label} : tous`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {children}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            const sp = new URLSearchParams(params.toString());
            ["q", ...filters.map((f) => f.name)].forEach((k) => sp.delete(k));
            startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp.toString()}` : ""}`, { scroll: false }));
          }}
        >
          <X aria-hidden /> Réinitialiser
        </Button>
      ) : null}
      {pending ? <Loader2 className="size-4 animate-spin text-subtle" aria-label="Chargement" /> : null}
    </div>
  );
}
