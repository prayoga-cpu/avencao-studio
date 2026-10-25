"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      aria-label="Se déconnecter"
      title="Se déconnecter"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await authClient.signOut();
          if (res.error) {
            toast.error("Déconnexion impossible, réessayez.");
            return;
          }
          router.replace("/connexion");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      {compact ? null : "Déconnexion"}
    </Button>
  );
}
