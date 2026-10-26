"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useT } from "#i18n";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      aria-label={tr("Se déconnecter")}
      title={tr("Se déconnecter")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await authClient.signOut();
          if (res.error) {
            toast.error(tr("Déconnexion impossible, réessayez."));
            return;
          }
          router.replace("/connexion");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      {compact ? null : tr("Déconnexion")}
    </Button>
  );
}
