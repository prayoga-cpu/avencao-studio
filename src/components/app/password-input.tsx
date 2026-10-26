"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";

/**
 * Champ mot de passe avec bouton « Afficher / Masquer » (utile pour vérifier un mot de passe
 * collé : espaces, guillemets). Toutes les props (dont l'`id` injecté par <Field>) vont à
 * l'<input>, pas au conteneur : le libellé reste relié au champ.
 */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const tr = useT();
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? tr("Masquer le mot de passe") : tr("Afficher le mot de passe")}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
