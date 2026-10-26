import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";
import { useT } from "#i18n";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Mot de passe oublié") };
}

export default function ForgotPage() {
  const tr = useT();
  return (
    <AuthCard title={tr("Mot de passe oublié")} subtitle={tr("Un lien vous sera envoyé si un serveur email est configuré.")}>
      <ForgotForm />
    </AuthCard>
  );
}
