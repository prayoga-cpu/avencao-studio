import Link from "next/link";

export default function GlobalNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <p className="text-subtle">Cette page n&apos;existe pas.</p>
      <Link href="/" className="text-sm text-brand hover:underline">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
