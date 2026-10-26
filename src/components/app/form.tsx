"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

/**
 * Formulaire React Hook Form + Zod : validation immédiate côté navigateur, revalidation
 * côté serveur (Server Action), erreurs serveur replacées sur les champs, état de chargement.
 */
export function useServerForm<TSchema extends z.ZodType<FieldValues, FieldValues>, TResult>({
  schema,
  defaultValues,
  action,
  onSuccess,
  successMessage,
  refresh = true,
}: {
  schema: TSchema;
  defaultValues: DefaultValues<z.input<TSchema>>;
  action: (values: z.input<TSchema>) => Promise<ActionResult<TResult>>;
  onSuccess?: (data: TResult) => void;
  successMessage?: string;
  refresh?: boolean;
}) {
  const router = useRouter();
  const tr = useT();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<TSchema>, unknown, z.input<TSchema>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
    defaultValues,
    mode: "onBlur",
  });
  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        const result = await action(values);
        if (!result.ok) {
          for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
            if (messages?.[0]) form.setError(field as Path<z.input<TSchema>>, { message: messages[0] });
          }
          toast.error(tr(result.error));
          return;
        }
        const msg = result.message ?? successMessage;
        if (msg) toast.success(tr(msg));
        onSuccess?.(result.data);
        if (refresh) router.refresh();
      } catch {
        toast.error(tr("Connexion au serveur impossible. Vos saisies sont conservées : réessayez."));
      }
    });
  });
  const err = (name: string): string | undefined => {
    const parts = name.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = form.formState.errors;
    for (const p of parts) cur = cur?.[p];
    return cur?.message as string | undefined;
  };
  return { form, onSubmit, pending, err };
}

export function FormActions({
  pending,
  submitLabel = "Enregistrer",
  onCancel,
  cancelHref,
  extra,
}: {
  pending: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  cancelHref?: string;
  extra?: ReactNode;
}) {
  const tr = useT();
  const router = useRouter();
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
      {extra}
      {onCancel || cancelHref ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => (onCancel ? onCancel() : router.push(cancelHref!))}>
          {tr("Annuler")}</Button>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {trNode(tr, submitLabel)}
      </Button>
    </div>
  );
}
