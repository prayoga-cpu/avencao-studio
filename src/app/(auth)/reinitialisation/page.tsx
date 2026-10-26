import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { ResetForm } from "./reset-form";
import { useT } from "#i18n";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Réinitialisation du mot de passe") };
}

export default function ResetPage() {
  const tr = useT();
  return (
    <AuthCard title={tr("Nouveau mot de passe")}>
      <Suspense fallback={<div className="h-40" aria-busy />}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
