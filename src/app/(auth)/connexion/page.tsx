import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";
import { OtpLoginForm } from "./otp-login-form";
import { PasswordLoginToggle } from "./password-login-toggle";
import { useT } from "#i18n";
import { getT } from "@/lib/i18n/server";
import { loginAllowlist, passwordLoginEnabled } from "@/server/auth/login-policy";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Connexion") };
}

export default async function LoginPage() {
  // Configuration lue à l'exécution (variables d'environnement du déploiement).
  await connection();
  return <LoginContent emails={loginAllowlist()} withPassword={passwordLoginEnabled()} />;
}

function LoginContent({ emails, withPassword }: { emails: string[] | null; withPassword: boolean }) {
  const tr = useT();
  return (
    <AuthCard
      title={tr("CRM Avencao")}
      subtitle={emails ? tr("CRM interne : choisissez votre adresse pour recevoir un code de connexion.") : tr("Connectez-vous avec le compte créé par votre administrateur.")}
    >
      <OtpLoginForm emails={emails} />
      {withPassword ? (
        <PasswordLoginToggle>
          <LoginForm />
        </PasswordLoginToggle>
      ) : null}
    </AuthCard>
  );
}
