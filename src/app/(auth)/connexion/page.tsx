import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <AuthCard title="CRM Avencao" subtitle="Connectez-vous avec le compte créé par votre administrateur.">
      <LoginForm />
    </AuthCard>
  );
}
