import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-foreground border-white/10",
  brand: "bg-brand-soft text-[#ff6aa8] border-brand-border",
  info: "bg-[#60a5fa1a] text-[#93c5fd] border-[#60a5fa40]",
  success: "bg-[#22c55e1a] text-[#86efac] border-[#22c55e40]",
  warning: "bg-[#ffc1071a] text-[#ffd75e] border-[#ffc10740]",
  danger: "bg-[#ef44441a] text-[#fca5a5] border-[#ef444440]",
  muted: "bg-transparent text-subtle border-white/10",
};

/** Badge de statut : libellé texte toujours présent (la couleur n'est qu'un repère). */
export function StatusBadge({ label, tone = "neutral", className, title }: { label: string; tone?: Tone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
