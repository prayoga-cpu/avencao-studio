import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <AuthCard title="Mot de passe oublié" subtitle="Un lien vous sera envoyé si un serveur email est configuré.">
      <ForgotForm />
    </AuthCard>
  );
}
