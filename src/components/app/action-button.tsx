"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useAction } from "./use-action";

/** Bouton déclenchant une Server Action, avec état de chargement et retour visible. */
export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "default",
  className,
  disabled,
  ariaLabel,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "xs" | "lg" | "icon" | "icon-sm";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { pending, run } = useAction();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      onClick={() => run(action)}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
