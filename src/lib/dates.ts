/**
 * Dates : les instants sont stockés en UTC (timestamptz) ; les échéances sont des
 * DATE locales (sans heure) interprétées dans le fuseau de l'agence.
 * Une DATE Prisma revient comme un objet Date à minuit UTC : on la lit toujours en UTC.
 */

export const DEFAULT_TIMEZONE = "Asia/Makassar";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** « 2026-10-24 » → Date à minuit UTC (valeur attendue par les colonnes @db.Date). */
export function parseDateOnly(value: string): Date {
  if (!isIsoDate(value)) throw new Error(`Date invalide : ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function parseDateOnlyOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  return parseDateOnly(value);
}

/** Date (minuit UTC) → « 2026-10-24 ». */
export function toDateOnlyString(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

/** Date du jour dans un fuseau donné, au format « YYYY-MM-DD ». */
export function todayInTimezone(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = parseDateOnly(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnlyString(d);
}

export function diffInDays(fromIso: string, toIso: string): number {
  return Math.round((parseDateOnly(toIso).getTime() - parseDateOnly(fromIso).getTime()) / 86_400_000);
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return toDateOnlyString(last);
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toDateOnlyString(target);
}

/** Début de semaine (lundi). */
export function startOfWeek(isoDate: string): string {
  const d = parseDateOnly(isoDate);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return toDateOnlyString(d);
}

export type PeriodPreset = "month" | "last-month" | "quarter" | "year" | "last-year" | "custom";

export interface Period {
  from: string;
  to: string;
  label: string;
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

export function resolvePeriod(
  preset: PeriodPreset,
  today: string,
  custom?: { from?: string; to?: string },
): Period {
  switch (preset) {
    case "last-month": {
      const from = startOfMonth(addMonths(startOfMonth(today), -1));
      return { from, to: endOfMonth(from), label: monthLabel(from) };
    }
    case "quarter": {
      const [y, m] = today.split("-").map(Number);
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const from = `${y}-${String(qStart).padStart(2, "0")}-01`;
      return { from, to: endOfMonth(addMonths(from, 2)), label: `T${(qStart + 2) / 3} ${y}` };
    }
    case "year": {
      const y = today.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}` };
    }
    case "last-year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}` };
    }
    case "custom": {
      const from = custom?.from && isIsoDate(custom.from) ? custom.from : startOfMonth(today);
      const to = custom?.to && isIsoDate(custom.to) ? custom.to : endOfMonth(today);
      return from <= to
        ? { from, to, label: `${formatDateOnly(from)} → ${formatDateOnly(to)}` }
        : { from: to, to: from, label: `${formatDateOnly(to)} → ${formatDateOnly(from)}` };
    }
    case "month":
    default: {
      const from = startOfMonth(today);
      return { from, to: endOfMonth(today), label: monthLabel(from) };
    }
  }
}

/** Période précédente de même durée (comparaison sur périodes comparables). */
export function previousPeriod(period: Period): Period {
  const isFullMonth = period.from.endsWith("-01") && period.to === endOfMonth(period.from);
  if (isFullMonth) {
    const from = addMonths(period.from, -1);
    return { from, to: endOfMonth(from), label: monthLabel(from) };
  }
  const length = diffInDays(period.from, period.to) + 1;
  const to = addDays(period.from, -1);
  const from = addDays(to, -(length - 1));
  return { from, to, label: `${formatDateOnly(from)} → ${formatDateOnly(to)}` };
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Affiche une DATE (échéance) au format français : 24/10/2026. */
export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? (isIsoDate(value) ? parseDateOnly(value) : new Date(value)) : value;
  return dateFormatter.format(d);
}

/** Affiche un instant dans le fuseau de l'agence : 24/10/2026 14:05. */
export function formatDateTime(value: Date | string | null | undefined, timezone: string = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDurationSeconds(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** « 1:30 » ou « 90 » (secondes) → secondes. */
export function parseDurationInput(input: string): number | null {
  const v = input.trim();
  if (v === "") return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(\d+):([0-5]\d)$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
