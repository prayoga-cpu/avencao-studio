"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/field";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/app/password-input";
import { authClient } from "@/lib/auth-client";
import { useT } from "#i18n";

/** Lien reçu par email (flux Better Auth) : jeton à durée limitée. */
export function ResetForm() {
  const tr = useT();
  const params = useSearchParams();
  const token = params.get("token");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!token || params.get("error")) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warning">{tr("Lien invalide ou expiré. Refaites une demande ou contactez un administrateur.")}</Notice>
        <Link href="/mot-de-passe-oublie" className="text-center text-sm text-brand hover:underline">
          {tr("Nouvelle demande")}</Link>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password") ?? "");
        if (password !== String(fd.get("confirm") ?? "")) {
          setError(tr("Les mots de passe ne correspondent pas."));
          return;
        }
        start(async () => {
          const res = await authClient.resetPassword({ newPassword: password, token });
          if (res.error) {
            setError(tr("Lien invalide ou expiré."));
            return;
          }
          toast.success(tr("Mot de passe modifié. Connectez-vous."));
          router.replace("/connexion");
        });
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={tr("Nouveau mot de passe")} htmlFor="password" required hint={tr("10 caractères minimum.")}>
        <PasswordInput name="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label={tr("Confirmation")} htmlFor="confirm" required>
        <PasswordInput name="confirm" autoComplete="new-password" minLength={10} required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Enregistrer")}</Button>
    </form>
  );
}
