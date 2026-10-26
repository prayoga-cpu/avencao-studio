import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../../auth-card";
import { CodeLinkLogin } from "./code-link-login";
import { useT } from "#i18n";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getT();
  return { title: tr("Connexion") };
}

/** Lien reçu par email : confirmation en un clic (un scanner de liens ne consomme pas le code). */
export default async function CodeLinkPage(props: PageProps<"/connexion/code">) {
  const sp = await props.searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const code = typeof sp.code === "string" && /^\d{6}$/.test(sp.code) ? sp.code : "";
  return <CodeLinkContent email={email} code={code} />;
}

function CodeLinkContent({ email, code }: { email: string; code: string }) {
  const tr = useT();
  return (
    <AuthCard title={tr("CRM Avencao")} subtitle={email && code ? tr("Confirmez la connexion à votre compte.") : tr("Lien de connexion incomplet.")}>
      {email && code ? (
        <CodeLinkLogin email={email} code={code} />
      ) : (
        <Link href="/connexion" className="block text-center text-sm text-brand hover:underline">
          {tr("Retour à la connexion")}
        </Link>
      )}
    </AuthCard>
  );
}
