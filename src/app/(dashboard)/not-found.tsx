import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      className="mt-10"
      title="Élément introuvable"
      description="Cet élément n'existe pas, a été archivé ou ne fait pas partie de votre périmètre."
      action={
        <Button asChild variant="outline">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      }
    />
  );
}
