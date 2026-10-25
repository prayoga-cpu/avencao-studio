import "server-only";
import { previousPeriod, resolvePeriod, type Period, type PeriodPreset } from "@/lib/dates";
import { agencyToday } from "./services/common";

const PRESETS: PeriodPreset[] = ["month", "last-month", "quarter", "year", "last-year", "custom"];

export async function periodFromParams(searchParams: Record<string, string | string[] | undefined>): Promise<{ period: Period; previous: Period; today: string }> {
  const today = await agencyToday();
  const raw = typeof searchParams.periode === "string" ? searchParams.periode : "month";
  const preset = (PRESETS as string[]).includes(raw) ? (raw as PeriodPreset) : "month";
  const period = resolvePeriod(preset, today, {
    from: typeof searchParams.du === "string" ? searchParams.du : undefined,
    to: typeof searchParams.au === "string" ? searchParams.au : undefined,
  });
  return { period, previous: previousPeriod(period), today };
}
