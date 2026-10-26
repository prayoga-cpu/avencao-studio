import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { useT } from "#i18n";

export default function NotFound() {
  const tr = useT();
  return (
    <EmptyState
      className="mt-10"
      title={tr("Élément introuvable")}
      description={tr("Cet élément n'existe pas, a été archivé ou ne fait pas partie de votre périmètre.")}
      action={
        <Button asChild variant="outline">
          <Link href="/">{tr("Retour à l'accueil")}</Link>
        </Button>
      }
    />
  );
}
