import { formatMoney, formatPercent, signOf } from "@/lib/format";
import type { CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Montant formaté (chaîne décimale exacte) avec unité visible. null → « À renseigner ». */
export function Money({
  value,
  currency = "EUR",
  className,
  colorize = false,
  empty,
}: {
  value: string | null | undefined;
  currency?: CurrencyCode;
  className?: string;
  colorize?: boolean;
  empty?: string;
}) {
  const missing = value === null || value === undefined || value === "";
  const sign = signOf(value);
  return (
    <span
      className={cn(
        "num",
        missing && "italic text-warning",
        colorize && !missing && sign < 0 && "text-danger",
        colorize && !missing && sign > 0 && "text-success",
        className,
      )}
    >
      {formatMoney(value, currency, { empty })}
    </span>
  );
}

export function Percent({ value, className }: { value: string | null | undefined; className?: string }) {
  return <span className={cn("num", (value === null || value === undefined) && "italic text-subtle", className)}>{formatPercent(value)}</span>;
}
