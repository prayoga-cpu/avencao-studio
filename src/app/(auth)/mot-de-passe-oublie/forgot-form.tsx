"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/app/field";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ForgotForm() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info">
          Si un compte existe pour cette adresse et qu&apos;un serveur email est configuré, un lien valable 1 heure vient
          d&apos;être envoyé. Sinon, demandez à un administrateur de générer un lien depuis Réglages › Utilisateurs.
        </Notice>
        <Link href="/connexion" className="text-center text-sm text-brand hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
        start(async () => {
          // Réponse identique que le compte existe ou non (pas d'énumération des comptes).
          await authClient.requestPasswordReset({ email, redirectTo: "/reinitialisation" });
          setDone(true);
        });
      }}
    >
      <Field label="Email" htmlFor="email" required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Demander un lien
      </Button>
      <Link href="/connexion" className="text-center text-sm text-subtle hover:text-foreground">
        Retour à la connexion
      </Link>
    </form>
  );
}
