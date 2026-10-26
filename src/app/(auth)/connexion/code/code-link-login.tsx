"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "#i18n";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function CodeLinkLogin({ email, code }: { email: string; code: string }) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        size="lg"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await authClient.signIn.emailOtp({ email: email.toLowerCase(), otp: code });
            if (res.error) {
              setError(res.error.status === 429 ? tr("Trop de tentatives. Patientez une minute avant de réessayer.") : tr("Lien expiré ou déjà utilisé. Demandez un nouveau code."));
              return;
            }
            router.replace("/dashboard");
            router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {tr("Se connecter en tant que {0}", [email])}
      </Button>
      <Link href="/connexion" className="text-center text-sm text-subtle hover:text-foreground">
        {tr("Demander un nouveau code")}
      </Link>
    </div>
  );
}
