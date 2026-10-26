import Link from "next/link";
import { useT } from "#i18n";

export default function GlobalNotFound() {
  const tr = useT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <p className="text-subtle">{tr("Cette page n'existe pas.")}</p>
      <Link href="/" className="text-sm text-brand hover:underline">
        {tr("Retour à l'accueil")}</Link>
    </main>
  );
}
