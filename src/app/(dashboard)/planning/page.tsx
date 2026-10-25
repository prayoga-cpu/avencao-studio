import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { sp } from "@/components/app/pagination";
import { Section } from "@/components/app/section";
import { StatusBadge } from "@/components/app/status-badge";
import { TabLinks } from "@/components/app/tab-links";
import { Button } from "@/components/ui/button";
import { MoveDeadlineButton } from "@/features/production/move-deadline";
import { addDays, addMonths, endOfMonth, formatDateOnly, isIsoDate, monthLabel, startOfMonth, startOfWeek } from "@/lib/dates";
import { PRIORITY, VIDEO_STATUS, enumOptions } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/policies";
import { clientOptions, editorOptions } from "@/server/queries/options";
import { getPlanning, type PlanningEvent } from "@/server/queries/planning";
import { agencyToday } from "@/server/services/common";

export const metadata: Metadata = { title: "Planning" };

const KIND = {
  client: { label: "Client", cls: "border-l-brand bg-brand-soft" },
  internal: { label: "Interne", cls: "border-l-[#4f8ff0] bg-[#4f8ff014]" },
  mission: { label: "Mission", cls: "border-l-[#ffc107] bg-[#ffc10712]" },
  unavailable: { label: "Indispo.", cls: "border-l-[#7a7a7a] bg-surface-2" },
} as const;
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default async function PlanningPage(props: PageProps<"/planning">) {
  const actor = await requirePagePermission("planning.view");
  const params = await props.searchParams;
  const today = await agencyToday();
  const mode = (["mois", "semaine", "liste"] as const).find((m) => m === params.mode) ?? "mois";
  const anchor = typeof params.date === "string" && isIsoDate(params.date) ? params.date : today;
  const range =
    mode === "mois"
      ? { from: startOfWeek(startOfMonth(anchor)), to: addDays(startOfWeek(endOfMonth(anchor)), 6) }
      : mode === "semaine"
        ? { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) }
        : { from: anchor, to: addDays(anchor, 27) };
  const staff = can(actor, "videos.readAll");
  const [{ events, load }, editors, clients] = await Promise.all([
    getPlanning(actor, range, { editor: sp(params.monteur), client: sp(params.client), priority: sp(params.priorite), status: sp(params.statut) }, today),
    staff ? editorOptions() : Promise.resolve([]),
    staff ? clientOptions() : Promise.resolve([]),
  ]);
  const canMove = can(actor, "videos.write");
  const step = mode === "mois" ? (n: number) => addMonths(anchor, n) : mode === "semaine" ? (n: number) => addDays(anchor, 7 * n) : (n: number) => addDays(anchor, 28 * n);
  const keep = new URLSearchParams();
  for (const k of ["monteur", "client", "priorite", "statut"]) if (sp(params[k])) keep.set(k, sp(params[k])!);
  const href = (date: string, m = mode) => {
    const q = new URLSearchParams(keep);
    if (m !== "mois") q.set("mode", m);
    q.set("date", date);
    return `/planning?${q.toString()}`;
  };
  const byDay = new Map<string, PlanningEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const title = mode === "mois" ? monthLabel(anchor) : `${formatDateOnly(range.from)} → ${formatDateOnly(range.to)}`;
  const extra: Record<string, string> = Object.fromEntries(keep.entries());
  if (anchor !== today) extra.date = anchor;

  const EventChip = ({ e }: { e: PlanningEvent }) => (
    <div className={cn("group flex items-start gap-1 rounded-md border-l-2 px-1.5 py-1 text-[0.72rem] leading-tight", KIND[e.kind].cls, e.overdue && "ring-1 ring-danger/60")}>
      <div className="min-w-0 flex-1">
        {e.href ? <Link href={e.href} className="block truncate font-medium hover:underline">{e.title}</Link> : <span className="block truncate font-medium">{e.title}</span>}
        <span className="block truncate text-faint">{KIND[e.kind].label}{e.overdue ? " · en retard" : ""}</span>
      </div>
      {canMove && e.videoId && (e.kind === "client" || e.kind === "internal") ? (
        <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <MoveDeadlineButton videoId={e.videoId} field={e.kind === "client" ? "VIDEO_CLIENT" : "VIDEO_INTERNAL"} current={e.date} label={`${KIND[e.kind].label} — ${e.title}`} />
        </span>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Planning"
        subtitle={staff ? "Deadlines internes et client, missions et indisponibilités. La charge se lit en heures estimées, pas en nombre de vidéos." : "Vos missions et échéances."}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon-sm"><Link href={href(step(-1))} aria-label="Période précédente"><ChevronLeft aria-hidden /></Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={href(today)}>Aujourd&apos;hui</Link></Button>
            <Button asChild variant="outline" size="icon-sm"><Link href={href(step(1))} aria-label="Période suivante"><ChevronRight aria-hidden /></Link></Button>
          </div>
        }
      >
        {staff ? (
          <FilterBar
            showSearch={false}
            filters={[
              { name: "monteur", label: "Monteur", options: editors },
              { name: "client", label: "Client", options: clients },
              { name: "priorite", label: "Priorité", options: enumOptions(PRIORITY) },
              { name: "statut", label: "Étape", options: enumOptions(VIDEO_STATUS) },
            ]}
          />
        ) : null}
      </PageHeader>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold capitalize">{title}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(KIND).map(([k, v]) => <span key={k} className={cn("rounded border-l-2 px-2 py-0.5", v.cls)}>{v.label}</span>)}
        </div>
      </div>
      <TabLinks tabs={[{ value: "mois", label: "Mois" }, { value: "semaine", label: "Semaine" }, { value: "liste", label: "Liste" }]} active={mode} basePath="/planning" param="mode" extraParams={extra} />

      {mode === "liste" ? (
        events.length === 0 ? <EmptyState title="Aucune échéance sur ces 4 semaines" /> : (
          <ol className="flex flex-col gap-4">
            {[...byDay.entries()].map(([day, list]) => (
              <li key={day}>
                <h3 className={cn("mb-1.5 text-sm font-semibold", day === today && "text-brand", day < today && "text-subtle")}>{formatDateOnly(day)}{day === today ? " · aujourd'hui" : ""}</h3>
                <ul className="flex flex-col gap-1.5">
                  {list.map((e) => (
                    <li key={e.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border-l-2 px-3 py-2 text-sm", KIND[e.kind].cls)}>
                      <span className="w-16 shrink-0 text-xs text-subtle">{KIND[e.kind].label}</span>
                      {e.href ? <Link href={e.href} className="min-w-0 flex-1 font-medium hover:underline">{e.title}</Link> : <span className="min-w-0 flex-1 font-medium">{e.title}</span>}
                      <span className="text-xs text-subtle">{e.subtitle}</span>
                      {e.status ? <StatusBadge {...VIDEO_STATUS[e.status]} /> : null}
                      {e.overdue ? <StatusBadge label="En retard" tone="danger" /> : null}
                      {canMove && e.videoId && (e.kind === "client" || e.kind === "internal") ? <MoveDeadlineButton videoId={e.videoId} field={e.kind === "client" ? "VIDEO_CLIENT" : "VIDEO_INTERNAL"} current={e.date} label={e.title} /> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )
      ) : (
        <div className="overflow-x-auto av-scroll">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {DAYS.map((d) => <div key={d} className="bg-surface-2 px-2 py-1.5 text-center text-xs font-semibold text-subtle">{d}</div>)}
            {Array.from({ length: Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1 }, (_, i) => addDays(range.from, i)).map((day) => {
              const list = byDay.get(day) ?? [];
              const outside = mode === "mois" && day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={day} className={cn("min-h-28 bg-surface p-1.5", outside && "bg-[#0d0d0d] opacity-60", mode === "semaine" && "min-h-80")}>
                  <p className={cn("mb-1 text-right text-xs", day === today ? "font-bold text-brand" : "text-faint")}>{Number(day.slice(8))}</p>
                  <div className="flex flex-col gap-1">
                    {list.slice(0, mode === "mois" ? 4 : 30).map((e) => <EventChip key={e.id} e={e} />)}
                    {mode === "mois" && list.length > 4 ? <Link href={href(day, "liste")} className="text-[0.7rem] text-brand hover:underline">+{list.length - 4} autres</Link> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {staff && load.length ? (
        <Section title="Heures réservées sur la période affichée" description="Missions actives avec échéance dans la période (heures estimées). Les heures réellement saisies sont visibles sur chaque vidéo." className="mt-5">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {load.map((l) => (
              <li key={l.name} className="rounded-lg border border-border p-2.5 text-sm">
                <p className="font-semibold">{l.name}</p>
                <p className="num text-subtle">{l.planned} h prévues</p>
                {l.missing ? <p className="text-xs text-warning">{l.missing} mission(s) sans estimation : charge incomplète</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
