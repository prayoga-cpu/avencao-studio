"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col gap-4">
      <Notice tone="danger" title="Cette page n'a pas pu être affichée">
        Une erreur est survenue côté serveur. Aucune donnée n&apos;a été modifiée.
        {error.digest ? <span className="mt-1 block text-xs opacity-70">Référence : {error.digest}</span> : null}
      </Notice>
      <Button onClick={reset} className="self-start">
        <RotateCcw aria-hidden /> Réessayer
      </Button>
    </div>
  );
}
