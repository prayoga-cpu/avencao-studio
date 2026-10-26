import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Notice } from "@/components/app/notice";
import { findValidToken } from "@/server/users";
import { AuthCard } from "../../auth-card";
import { SetPasswordForm } from "./set-password-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Définir mon mot de passe") };
}

async function TokenGate({ params }: { params: Promise<{ token: string }> }) {
  const tr = await getT();
  const { token } = await params;
  const row = await findValidToken(token);
  if (!row) {
    return (
      <AuthCard title={tr("Lien invalide ou expiré")}>
        <Notice tone="warning">
          {tr("Ce lien n'est plus valable (déjà utilisé, expiré ou révoqué). Demandez un nouveau lien à un administrateur.")}</Notice>
        <Link href="/connexion" className="mt-4 block text-center text-sm text-brand hover:underline">
          {tr("Retour à la connexion")}</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={row.purpose === "INVITE" ? tr("Bienvenue sur Avencao") : tr("Nouveau mot de passe")}
      subtitle={tr("Compte : {0}", [row.user.email])}
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
