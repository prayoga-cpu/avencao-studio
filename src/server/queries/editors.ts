import "server-only";
import type { EditorStatus, Skill, VideoType } from "@/generated/prisma/enums";
import { addDays, toDateOnlyString } from "@/lib/dates";
import { dec, sum } from "@/lib/money";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { can, type Actor } from "../policies";
import { getEditorBalances } from "../services/billing";
import { agencyToday } from "../services/common";
import type { EditorChoice } from "@/features/production/assign-dialog";

export async function listEditors(actor: Actor, filters: { q?: string; status?: string; skill?: string; format?: string }) {
  const today = await agencyToday();
  const horizon = addDays(today, 7);
  const editors = await prisma.editorProfile.findMany({
    where: {
      status: filters.status ? (filters.status as EditorStatus) : { not: "ARCHIVED" },
      ...(filters.skill ? { skills: { has: filters.skill as Skill } } : {}),
      ...(filters.format ? { formats: { has: filters.format as VideoType } } : {}),
      ...(filters.q ? { OR: [{ displayName: { contains: filters.q, mode: "insensitive" } }, { email: { contains: filters.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { displayName: "asc" },
    include: {
      user: { select: { id: true, status: true } },
      assignments: {
        where: { status: { in: ["PLANNED", "IN_PROGRESS", "SUBMITTED"] } },
        select: { estimatedHours: true, dueOn: true },
      },
    },
  });
  const balances = can(actor, "supplierPayments.read") ? await getEditorBalances(prisma, editors.map((e) => e.id)) : null;
  return editors.map((e) => {
    const inWindow = e.assignments.filter((a) => !a.dueOn || toDateOnlyString(a.dueOn) <= horizon);
    const planned = sum(inWindow.filter((a) => a.estimatedHours).map((a) => dec(a.estimatedHours)));
    return {
      id: e.id,
      displayName: e.displayName,
      status: e.status,
      country: e.country,
      skills: e.skills,
      formats: e.formats,
      level: e.level,
      payCurrency: e.payCurrency,
      hasAccount: !!e.user,
      activeMissions: e.assignments.length,
      plannedHours7d: planned.toFixed(1),
      missingEstimates: inWindow.filter((a) => !a.estimatedHours).length,
      capacity: e.weeklyCapacityHours?.toFixed(1) ?? null,
      overloaded: e.weeklyCapacityHours ? planned.gt(dec(e.weeklyCapacityHours)) : false,
      dueEur: balances ? (balances.get(e.id)?.dueEur.toFixed(2) ?? "0.00") : null,
    };
  });
}

export async function getEditorDetail(actor: Actor, id: string) {
  const editor = await prisma.editorProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, status: true, role: true } },
      unavailabilities: { orderBy: { startsOn: "desc" }, take: 20 },
      rateCards: can(actor, "rates.read") ? { orderBy: [{ active: "desc" }, { validFrom: "desc" }] } : false,
    },
  });
  if (!editor) throw new NotFoundError();
  const showCosts = can(actor, "costs.read");
  const [current, delivered, versions] = await Promise.all([
    prisma.assignment.findMany({
      where: { editorId: id, status: { in: ["PLANNED", "IN_PROGRESS", "SUBMITTED"] } },
      orderBy: [{ dueOn: "asc" }],
      include: {
        video: { select: { id: true, reference: true, title: true, status: true, project: { select: { client: { select: { displayName: true } } } } } },
        directCosts: showCosts ? { where: { kind: { in: ["ASSIGNMENT", "ADDITIONAL"] } }, select: { amount: true, currency: true, stage: true } } : false,
      },
    }),
    prisma.assignment.findMany({
      where: { editorId: id, status: "APPROVED" },
      orderBy: { internalValidatedAt: "desc" },
      take: 30,
      select: { id: true, dueOn: true, submittedAt: true, internalValidatedAt: true, role: true, video: { select: { id: true, reference: true, title: true } } },
    }),
    prisma.videoVersion.findMany({ where: { editorId: id }, select: { status: true, changesCategory: true } }),
  ]);
  const timed = delivered.filter((a) => a.dueOn && a.submittedAt);
  const onTime = timed.filter((a) => toDateOnlyString(a.submittedAt!) <= toDateOnlyString(a.dueOn!)).length;
  const balances = can(actor, "supplierPayments.read") ? (await getEditorBalances(prisma, [id])).get(id) : null;
  return {
    editor: {
      ...editor,
      privateAppraisal: can(actor, "editors.appraisal") ? editor.privateAppraisal : null,
    },
    current,
    delivered,
    stats: {
      deliveredCount: delivered.length,
      punctuality: timed.length ? { onTime, total: timed.length } : null,
      versions: versions.length,
      internalErrors: versions.filter((v) => v.changesCategory === "INTERNAL_ERROR").length,
      includedRounds: versions.filter((v) => v.changesCategory === "INCLUDED").length,
    },
    balances: balances
      ? [...balances.byCurrency.entries()].map(([currency, b]) => ({
          currency,
          committed: b.committed.toFixed(2),
          validated: b.validated.toFixed(2),
          paid: b.paid.toFixed(2),
          due: b.due.toFixed(2),
          payable: b.payable.toFixed(2),
        }))
      : null,
    showCosts,
  };
}

/**
 * Prestataires actifs proposés à l'affectation (unitaire ou groupée) : compétences, formats et
 * tarifs actifs ; les prix ne sont transmis qu'avec l'accès aux tarifs. Filtre facultatif sur
 * le type de vidéo (tarifs génériques ou propres à ce type).
 */
export async function getEditorChoices(actor: Actor, videoType?: VideoType): Promise<EditorChoice[]> {
  const editors = await prisma.editorProfile.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: {
      id: true, displayName: true, skills: true, formats: true, payCurrency: true,
      rateCards: { where: { active: true }, select: { id: true, label: true, mode: true, unitPrice: true, currency: true, videoType: true } },
    },
  });
  const showRates = can(actor, "rates.read");
  return editors.map((e) => ({
    id: e.id,
    name: e.displayName,
    skills: e.skills,
    formats: e.formats,
    payCurrency: e.payCurrency,
    rateCards: e.rateCards
      .filter((r) => !videoType || !r.videoType || r.videoType === videoType)
      .map((r) => ({ id: r.id, label: r.label, mode: r.mode, unitPrice: showRates ? r.unitPrice.toFixed(2) : null, currency: r.currency, videoType: r.videoType })),
  }));
}
