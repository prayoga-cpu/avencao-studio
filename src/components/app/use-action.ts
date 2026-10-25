"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Exécute une Server Action avec état de chargement, retour clair et rafraîchissement. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    options: { onSuccess?: (data: T) => void; onError?: (result: Extract<ActionResult<T>, { ok: false }>) => void; refresh?: boolean; successMessage?: string } = {},
  ) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (result.ok) {
          const msg = result.message ?? options.successMessage;
          if (msg) toast.success(msg);
          options.onSuccess?.(result.data);
          if (options.refresh !== false) router.refresh();
        } else {
          toast.error(result.error);
          options.onError?.(result);
        }
      } catch {
        toast.error("Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.");
      }
    });
  }

  return { pending, run };
}
