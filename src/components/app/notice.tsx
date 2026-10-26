import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "#i18n";
import { trNode } from "@/lib/i18n/translate";

const STYLES = {
  info: { icon: Info, cls: "border-[#60a5fa40] bg-[#60a5fa12] text-[#bfdbfe]" },
  warning: { icon: AlertTriangle, cls: "border-[#ffc10740] bg-[#ffc10712] text-[#ffe08a]" },
  danger: { icon: OctagonAlert, cls: "border-[#ef444440] bg-[#ef444412] text-[#fecaca]" },
  success: { icon: CheckCircle2, cls: "border-[#22c55e40] bg-[#22c55e12] text-[#bbf7d0]" },
} as const;

/** Alerte en ligne (complétude, avertissements métier, droits). */
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof STYLES;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tr = useT();
  const { icon: Icon, cls } = STYLES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{trNode(tr, title)}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-[0.8125rem] opacity-90")}>{trNode(tr, children)}</div> : null}
      </div>
    </div>
  );
}
