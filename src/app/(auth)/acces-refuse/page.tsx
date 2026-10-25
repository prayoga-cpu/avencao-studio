import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/app/notice";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Accès refusé" };

export default function AccessDeniedPage() {
  return (
    <AuthCard title="Accès refusé">
      <Notice tone="warning">
        Votre compte ne dispose pas des droits nécessaires pour cette page. Si vous pensez qu&apos;il s&apos;agit d&apos;une
        erreur, contactez l&apos;administrateur de l&apos;agence.
      </Notice>
      <div className="mt-4 flex justify-center gap-4 text-sm">
        <Link href="/" className="text-brand hover:underline">
          Retour à l&apos;accueil
        </Link>
        <Link href="/connexion" className="text-subtle hover:text-foreground">
          Changer de compte
        </Link>
      </div>
    </AuthCard>
  );
}
