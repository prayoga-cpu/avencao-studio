"use client";

import { useState, type ReactNode } from "react";
import { useT } from "#i18n";

/** Connexion par mot de passe (si activée) : repliée sous le formulaire par code. */
export function PasswordLoginToggle({ children }: { children: ReactNode }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 border-t border-border pt-4">
      {open ? (
        children
      ) : (
        <button type="button" className="w-full text-center text-sm text-subtle hover:text-foreground" onClick={() => setOpen(true)}>
          {tr("Connexion par mot de passe")}
        </button>
      )}
    </div>
  );
}
