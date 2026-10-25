import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Notice } from "@/components/app/notice";
import { findValidToken } from "@/server/users";
import { AuthCard } from "../../auth-card";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Définir mon mot de passe" };

async function TokenGate({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await findValidToken(token);
  if (!row) {
    return (
      <AuthCard title="Lien invalide ou expiré">
        <Notice tone="warning">
          Ce lien n&apos;est plus valable (déjà utilisé, expiré ou révoqué). Demandez un nouveau lien à un administrateur.
        </Notice>
        <Link href="/connexion" className="mt-4 block text-center text-sm text-brand hover:underline">
          Retour à la connexion
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={row.purpose === "INVITE" ? "Bienvenue sur Avencao" : "Nouveau mot de passe"}
      subtitle={`Compte : ${row.user.email}`}
    >
      <SetPasswordForm token={token} />
    </AuthCard>
  );
}

export default function SetPasswordPage(props: PageProps<"/mot-de-passe/[token]">) {
  return (
    <Suspense fallback={<div className="av-panel h-80 animate-pulse" aria-busy />}>
      <TokenGate params={props.params} />
    </Suspense>
  );
}
