import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/app/notice";
import { AuthCard } from "../auth-card";
import { useT } from "#i18n";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Accès refusé") };
}

export default function AccessDeniedPage() {
  const tr = useT();
  return (
    <AuthCard title={tr("Accès refusé")}>
      <Notice tone="warning">
        {tr("Votre compte ne dispose pas des droits nécessaires pour cette page. Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur de l'agence.")}</Notice>
      <div className="mt-4 flex justify-center gap-4 text-sm">
        <Link href="/" className="text-brand hover:underline">
          {tr("Retour à l'accueil")}</Link>
        <Link href="/connexion" className="text-subtle hover:text-foreground">
          {tr("Changer de compte")}</Link>
      </div>
    </AuthCard>
  );
}
