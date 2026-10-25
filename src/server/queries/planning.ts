import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Priority, VideoStatus } from "@/generated/prisma/enums";
import { toDateOnlyString } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { CLOSED_VIDEO_STATUSES } from "../domain/video-workflow";
import { can, type Actor } from "../policies";

export interface PlanningEvent {
  id: string;
  date: string;
  kind: "client" | "internal" | "mission" | "unavailable";
  title: string;
  subtitle: string;
  href: string | null;
  status?: VideoStatus;
  priority?: Priority;
  overdue: boolean;
  videoId?: string;
}

/** Échéances internes et client, missions et indisponibilités sur une plage de dates. */
export async function getPlanning(actor: Actor, range: { from: string; to: string }, f: { editor?: string; client?: string; priority?: string; status?: string }, today: string) {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const staff = can(actor, "videos.readAll");
  const editorScope = staff ? f.editor : (actor.editorId ?? "__none__");
  const videoWhere: Prisma.VideoWhereInput = {
    status: f.status ? (f.status as VideoStatus) : { notIn: ["ARCHIVED"] },
    ...(f.priority ? { priority: f.priority as Priority } : {}),
    ...(f.client ? { project: { clientId: f.client } } : {}),
    ...(editorScope ? { assignments: { some: { editorId: editorScope, status: { not: "CANCELLED" } } } } : {}),
    OR: [{ clientDeadline: { gte: from, lte: to } }, { internalDeadline: { gte: from, lte: to } }],
  };
  const [videos, assignments, unavailable] = await Promise.all([
    prisma.video.findMany({
      where: videoWhere,
      select: { id: true, reference: true, title: true, status: true, priority: true, clientDeadline: true, internalDeadline: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
    prisma.assignment.findMany({
      where: {
        status: { in: ["PLANNED", "IN_PROGRESS", "SUBMITTED"] },
        dueOn: { gte: from, lte: to },
        ...(editorScope ? { editorId: editorScope } : {}),
        ...(f.client ? { video: { project: { clientId: f.client } } } : {}),
      },
      select: { id: true, dueOn: true, estimatedHours: true, role: true, editor: { select: { id: true, displayName: true } }, video: { select: { id: true, reference: true, title: true, status: true } } },
    }),
    prisma.editorUnavailability.findMany({
      where: { startsOn: { lte: to }, endsOn: { gte: from }, ...(editorScope ? { editorId: editorScope } : {}) },
      include: { editor: { select: { displayName: true } } },
    }),
  ]);
  const events: PlanningEvent[] = [];
  const closed = (s: VideoStatus) => CLOSED_VIDEO_STATUSES.includes(s) || s === "APPROVED";
  for (const v of videos) {
    const base = staff ? `/videos/${v.id}` : `/missions/${v.id}`;
    if (v.clientDeadline && staff) {
      const d = toDateOnlyString(v.clientDeadline);
      if (d >= range.from && d <= range.to) events.push({ id: `c-${v.id}`, date: d, kind: "client", title: `${v.reference} ${v.title}`, subtitle: `Deadline client · ${v.project.client.displayName}`, href: base, status: v.status, priority: v.priority, overdue: !closed(v.status) && d < today, videoId: v.id });
    }
    if (v.internalDeadline) {
      const d = toDateOnlyString(v.internalDeadline);
      if (d >= range.from && d <= range.to) events.push({ id: `i-${v.id}`, date: d, kind: "internal", title: `${v.reference} ${v.title}`, subtitle: `Deadline interne · ${v.project.client.displayName}`, href: base, status: v.status, priority: v.priority, overdue: !closed(v.status) && d < today, videoId: v.id });
    }
  }
  for (const a of assignments) {
    const d = toDateOnlyString(a.dueOn!);
    events.push({ id: `a-${a.id}`, date: d, kind: "mission", title: `${a.video.reference} ${a.video.title}`, subtitle: `Mission ${a.editor.displayName}${a.estimatedHours ? ` · ${a.estimatedHours.toFixed()} h` : " · heures non estimées"}`, href: staff ? `/videos/${a.video.id}` : `/missions/${a.video.id}`, status: a.video.status, overdue: d < today, videoId: a.video.id });
  }
  for (const u of unavailable) {
    const start = toDateOnlyString(u.startsOn) < range.from ? range.from : toDateOnlyString(u.startsOn);
    events.push({ id: `u-${u.id}`, date: start, kind: "unavailable", title: `${u.editor.displayName} indisponible`, subtitle: `${toDateOnlyString(u.startsOn)} → ${toDateOnlyString(u.endsOn)}${u.reason ? ` · ${u.reason}` : ""}`, href: staff ? `/monteurs/${u.editorId}` : null, overdue: false });
  }
  events.sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : a.date < b.date ? -1 : 1));
  // Charge par prestataire sur la plage : heures prévues (réservées) vs saisies.
  const loadByEditor = new Map<string, { name: string; planned: string; missing: number }>();
  for (const a of assignments) {
    const e = loadByEditor.get(a.editor.id) ?? { name: a.editor.displayName, planned: "0", missing: 0 };
    if (a.estimatedHours) e.planned = sum([dec(e.planned), dec(a.estimatedHours)]).toFixed(1);
    else e.missing += 1;
    loadByEditor.set(a.editor.id, e);
  }
  return { events, load: [...loadByEditor.values()] };
}
