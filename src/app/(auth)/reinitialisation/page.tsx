import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Réinitialisation du mot de passe" };

export default function ResetPage() {
  return (
    <AuthCard title="Nouveau mot de passe">
      <Suspense fallback={<div className="h-40" aria-busy />}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
