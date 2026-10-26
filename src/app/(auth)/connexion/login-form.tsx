"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/app/field";
import { Notice } from "@/components/app/notice";
import { PasswordInput } from "@/components/app/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useT } from "#i18n";

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const tr = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const email = String(data.get("email") ?? "").trim();
        const password = String(data.get("password") ?? "");
        setError(null);
        start(async () => {
          const res = await authClient.signIn.email({ email, password, rememberMe: remember });
          if (res.error) {
            setError(
              res.error.status === 429
                ? tr("Trop de tentatives. Patientez une minute avant de réessayer.")
                : tr("Identifiants incorrects ou accès désactivé."),
            );
            return;
          }
          // Accueil direct (un monteur est redirigé vers ses missions par la page elle-même).
          router.replace(next);
          router.refresh();
        });
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={tr("Email")} htmlFor="email" required>
        <Input name="email" type="email" autoComplete="email" autoFocus required />
      </Field>
      <Field label={tr("Mot de passe")} htmlFor="password" required>
        <PasswordInput name="password" autoComplete="current-password" required minLength={10} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <Label htmlFor="remember" className="text-sm text-subtle">
            {tr("Rester connecté")}</Label>
        </div>
        <Link href="/mot-de-passe-oublie" className="text-sm text-brand hover:text-brand-hover hover:underline">
          {tr("Mot de passe oublié ?")}</Link>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Se connecter")}
      </Button>
      <p className="text-center text-xs text-faint">
        {tr("Pas d'inscription publique : les accès sont créés sur invitation.")}</p>
    </form>
  );
}
