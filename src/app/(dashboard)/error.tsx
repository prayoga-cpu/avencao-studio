"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { useT } from "#i18n";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tr = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col gap-4">
      <Notice tone="danger" title={tr("Cette page n'a pas pu être affichée")}>
        {tr("Une erreur est survenue côté serveur. Aucune donnée n'a été modifiée.")}{error.digest ? <span className="mt-1 block text-xs opacity-70">{tr("Référence :")}{" "}{error.digest}</span> : null}
      </Notice>
      <Button onClick={reset} className="self-start">
        <RotateCcw aria-hidden /> {" "}{tr("Réessayer")}</Button>
    </div>
  );
}
