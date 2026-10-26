"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useT } from "#i18n";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/** Bascule FR / EN : mémorisée dans un cookie du navigateur, appliquée à toute l'interface. */
export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="group"
      aria-label={tr("Langue de l'interface")}
      className={cn("inline-flex shrink-0 items-center rounded-lg border border-white/10 bg-black/30 p-0.5 text-[0.7rem] font-bold", pending && "opacity-60", className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={tr(LOCALE_LABELS[l])}
          aria-pressed={locale === l}
          disabled={pending}
          onClick={() => {
            if (l === locale) return;
            start(async () => {
              await setLocaleAction(l);
              router.refresh();
            });
          }}
          className={cn(
            "min-w-8 rounded-md px-2 py-1 uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-brand",
            locale === l ? "bg-brand text-white" : "text-subtle hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
