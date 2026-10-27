import "server-only";
/**
 * Affectation des prestataires (missions).
 * - Le tarif négocié est COPIÉ dans la mission : une modification du catalogue ne
 *   change jamais rétroactivement un engagement.
 * - Chaque mission (hors enveloppe mensuelle) porte un coût direct unique, dont le
 *   montant peut rester « À renseigner » (null), jamais 0 par défaut.
 * - La recommandation affichée est explicable (compétences, formats, charge, coût) :
 *   aucune « IA de matching » n'est prétendue.
 */
import type { AssignmentInput, AssignmentUpdateInput, BulkAssignmentInput } from "@/features/production/schemas";
import { assignmentSchema, assignmentUpdateSchema, bulkAssignmentSchema } from "@/features/production/schemas";
import type { Currency, MinuteRounding, RateMode } from "@/generated/prisma/enums";
import { addDays, formatDateOnly, parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { ASSIGNMENT_ROLE_LABELS } from "@/lib/labels";
import { Decimal, dec, roundMoney, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { groupRefusals, refusalMessage, type BulkRefusal } from "../bulk";
import { dateOrNull, decOrNull, intOrNull, str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { computeAssignmentCost, type CostResult } from "../domain/costing";
import { computeMargin, isBelowThreshold } from "../domain/profitability";
import { ACTIVE_ASSIGNMENT_STATUSES, missionDueDate } from "../domain/schedule";
import { CLOSED_VIDEO_STATUSES as CLOSED_STATUSES } from "../domain/video-workflow";
import { convert, fxData, resolveFx } from "../fx";
import { notify } from "../notifications";
import { assertCan, can, type Actor } from "../policies";
import { getSettings } from "../settings";
import { agencyToday, lockRow } from "./common";
import { getEditorLoad, getVideosFinancials } from "./profitability";

/** Compétences attendues par rôle de production (adéquation affichée, jamais bloquante). */
const ROLE_SKILLS: Record<string, string[]> = {
  EDIT: ["PREMIERE_PRO", "DAVINCI_RESOLVE", "CAPCUT", "AFTER_EFFECTS"],
  RUSH_PREP: ["RUSH_PREP"],
  MOTION: ["MOTION_DESIGN", "AFTER_EFFECTS"],
  SUBTITLES: ["SUBTITLING"],
  COLOR: ["COLOR_GRADING", "DAVINCI_RESOLVE"],
  SOUND: ["SOUND_DESIGN"],
  THUMBNAIL: ["THUMBNAIL"],
  OTHER: [],
};

interface FrozenRate {
  rateMode: RateMode | null;
  unitPrice: Decimal | null;
  currency: Currency;
  quantity: Decimal;
  minuteRounding: MinuteRounding | null;
  rateCardId: string | null;
  includedRevisions: number | null;
}

async function freezeRate(actor: Actor, d: ReturnType<typeof assignmentSchema.parse>, editorPayCurrency: Currency): Promise<FrozenRate> {
  let rate: FrozenRate = {
    rateMode: null,
    unitPrice: null,
    currency: editorPayCurrency,
    quantity: decOrNull(d.quantity) ?? new Decimal(1),
    minuteRounding: null,
    rateCardId: null,
    includedRevisions: intOrNull(d.includedRevisions),
  };
  if (d.rateCardId) {
    const card = await prisma.rateCard.findUnique({ where: { id: d.rateCardId } });
    if (!card || card.editorId !== d.editorId || !card.active) throw new DomainError("Tarif introuvable ou inactif pour ce prestataire.");
    rate = {
      rateMode: card.mode,
      unitPrice: dec(card.unitPrice),
      currency: card.currency,
      quantity: decOrNull(d.quantity) ?? (card.defaultQuantity ? dec(card.defaultQuantity) : new Decimal(1)),
      minuteRounding: card.minuteRounding,
      rateCardId: card.id,
      includedRevisions: intOrNull(d.includedRevisions) ?? card.includedRevisions,
    };
  }
  // Prix négocié final : saisie réservée aux utilisateurs ayant l'accès coûts.
  const wantsOverride = d.rateMode !== "" || d.unitPrice !== "" || d.currency !== "";
  if (wantsOverride) {
    if (!can(actor, "costs.write")) throw new ForbiddenError("Seul un utilisateur avec accès financier peut saisir un prix négocié.");
    if (d.rateMode !== "") rate.rateMode = d.rateMode;
    if (d.unitPrice !== "") rate.unitPrice = decOrNull(d.unitPrice);
    if (d.currency !== "") rate.currency = d.currency;
    if (d.minuteRounding !== "") rate.minuteRounding = d.minuteRounding;
  }
  if (rate.rateMode === "PER_FINAL_MINUTE" && !rate.minuteRounding) {
    rate.minuteRounding = (await getSettings()).defaultMinuteRounding;
  }
  return rate;
}

function costFor(rate: FrozenRate, video: { finalDurationSec: number | null; expectedDurationSec: number | null }): CostResult {
  if (!rate.rateMode || rate.unitPrice === null) return computeAssignmentCost(null);
  return computeAssignmentCost(
    {
      mode: rate.rateMode,
      unitPrice: rate.unitPrice,
      currency: rate.currency as CurrencyCode,
      quantity: rate.quantity,
      minuteRounding: rate.minuteRounding,
    },
    { finalDurationSec: video.finalDurationSec, expectedDurationSec: video.expectedDurationSec },
  );
}

export interface AssignmentPreview {
  cost: { amount: string | null; currency: Currency; amountEur: string | null; basis: string; status: CostResult["status"]; fxMissing: boolean } | null;
  margin: {
    revenueEur: string;
    beforeEur: string;
    afterEur: string;
    ratePctBefore: string | null;
    ratePctAfter: string | null;
    belowThreshold: boolean;
    thresholdPct: string;
    incompleteAfter: boolean;
  } | null;
  load: {
    activeMissions: number;
    plannedHours: string;
    capacityHours: string | null;
    missingEstimates: number;
    overloaded: boolean;
    unavailable: boolean;
  };
  fit: { skillsMatch: boolean; formatMatch: boolean; notes: string[] };
}

/** Aperçu avant affectation : coût prévu, impact sur la marge, charge et adéquation. */
export async function previewAssignment(actor: Actor, input: AssignmentInput): Promise<AssignmentPreview> {
  assertCan(actor, "assignments.write");
  const d = assignmentSchema.parse(input);
  const [video, editor, settings] = await Promise.all([
    prisma.video.findUnique({ where: { id: d.videoId } }),
    prisma.editorProfile.findUnique({ where: { id: d.editorId } }),
    getSettings(),
  ]);
  if (!video || !editor) throw new NotFoundError();
  const today = await agencyToday();
  const load = await getEditorLoad(prisma, editor.id, today, addDays(today, 7));
  const notes: string[] = [];
  const formatMatch = editor.formats.length === 0 || editor.formats.includes(video.type);
  const needed = ROLE_SKILLS[d.role] ?? [];
  const skillsMatch = needed.length === 0 || needed.some((s) => (editor.skills as string[]).includes(s));
  if (!formatMatch) notes.push("Ce format ne figure pas dans les formats déclarés du prestataire.");
  if (!skillsMatch) notes.push("Aucune compétence déclarée ne correspond à ce rôle.");
  if (load.overloaded) notes.push("Surcharge : les heures prévues sur 7 jours dépassent la capacité indicative.");
  if (load.missingEstimates > 0) notes.push(`${load.missingEstimates} mission(s) sans estimation d'heures : charge incomplète.`);
  if (load.capacityHours === null) notes.push("Capacité hebdomadaire non renseignée : surcharge non vérifiable.");
  if (load.unavailable) notes.push("Indisponibilité déclarée sur les 7 prochains jours.");

  const loadOut = {
    activeMissions: load.activeMissions,
    plannedHours: load.plannedHours.toFixed(2),
    capacityHours: load.capacityHours?.toFixed(2) ?? null,
    missingEstimates: load.missingEstimates,
    overloaded: load.overloaded,
    unavailable: load.unavailable,
  };

  if (!can(actor, "costs.read")) {
    return { cost: null, margin: null, load: loadOut, fit: { skillsMatch, formatMatch, notes } };
  }

  // Sans droit d'écriture des coûts, l'aperçu ignore les prix saisis et suit le tarif du catalogue.
  const safeInput = can(actor, "costs.write")
    ? d
    : { ...d, rateMode: "" as const, unitPrice: "", currency: "" as const, minuteRounding: "" as const };
  const rate = await freezeRate(actor, safeInput, editor.payCurrency);
  const cost = costFor(rate, video);
  let amountEur: Decimal | null = null;
  let fxMissing = false;
  if (cost.amount) {
    try {
      const fx = await resolveFx(prisma, rate.currency, today, str(d.manualFxRate));
      amountEur = convert(cost.amount, fx);
    } catch {
      fxMissing = true;
    }
  }
  const financials = (await getVideosFinancials(prisma, [video.id])).get(video.id)!;
  const after = computeMargin(
    financials.revenueEur,
    [...financials.costItems, { amountEur: cost.status === "ENVELOPE" ? dec(0) : amountEur, stage: "COMMITTED" }],
    { uncostedAssignments: financials.envelopeWithoutAllocation + (cost.status === "ENVELOPE" ? 1 : 0) },
  );
  const threshold = dec(settings.marginThresholdPct);
  return {
    cost: {
      amount: cost.amount?.toFixed(2) ?? null,
      currency: rate.currency,
      amountEur: amountEur?.toFixed(2) ?? null,
      basis: cost.basis,
      status: cost.status,
      fxMissing,
    },
    margin: can(actor, "margins.project")
      ? {
          revenueEur: financials.revenueEur.toFixed(2),
          beforeEur: financials.marginEur.toFixed(2),
          afterEur: after.marginEur.toFixed(2),
          ratePctBefore: financials.ratePct?.toFixed(2) ?? null,
          ratePctAfter: after.ratePct?.toFixed(2) ?? null,
          belowThreshold: isBelowThreshold(after.ratePct, threshold),
          thresholdPct: threshold.toFixed(2),
          incompleteAfter: after.status === "INCOMPLETE",
        }
      : null,
    load: loadOut,
    fit: { skillsMatch, formatMatch, notes },
  };
}

export async function assignEditor(
  actor: Actor,
  input: AssignmentInput,
  opts: { notifyEditor?: boolean } = {},
): Promise<{ id: string; warnings: string[]; dueOn: Date | null }> {
  assertCan(actor, "assignments.write");
  const d = assignmentSchema.parse(input);
  const [video, editor] = await Promise.all([
    prisma.video.findUnique({ where: { id: d.videoId }, include: { project: true } }),
    prisma.editorProfile.findUnique({ where: { id: d.editorId } }),
  ]);
  if (!video) throw new NotFoundError("Vidéo introuvable.");
  if (!editor) throw new NotFoundError("Prestataire introuvable.");
  if (editor.status !== "ACTIVE") throw new DomainError("Ce prestataire n'est pas actif.");
  if (CLOSED_STATUSES.includes(video.status)) throw new DomainError("Vidéo clôturée : affectation impossible.");
  const today = await agencyToday();
  const rate = await freezeRate(actor, d, editor.payCurrency);
  const cost = costFor(rate, video);
  const warnings: string[] = [];

  let fx = null;
  if (cost.amount) fx = await resolveFx(prisma, rate.currency, today, str(d.manualFxRate));

  const result = await prisma.$transaction(async (tx) => {
    // Verrou sur la vidéo : deux affectations simultanées (double clic, deux onglets) sont sérialisées.
    await lockRow(tx, "Video", video.id);
    const duplicate = await tx.assignment.count({ where: { videoId: video.id, editorId: editor.id, role: d.role, status: { not: "CANCELLED" } } });
    if (duplicate > 0) {
      throw new DomainError(`${editor.displayName} a déjà une mission « ${ASSIGNMENT_ROLE_LABELS[d.role]} » sur cette vidéo.`);
    }
    if (d.isPrimary) {
      await tx.assignment.updateMany({ where: { videoId: video.id, isPrimary: true }, data: { isPrimary: false } });
    }
    const assignment = await tx.assignment.create({
      data: {
        videoId: video.id,
        editorId: editor.id,
        role: d.role,
        isPrimary: d.isPrimary,
        scope: str(d.scope),
        rateMode: rate.rateMode,
        unitPrice: rate.unitPrice?.toFixed(2) ?? null,
        currency: rate.rateMode ? rate.currency : null,
        quantity: rate.quantity.toFixed(3),
        minuteRounding: rate.minuteRounding,
        rateCardId: rate.rateCardId,
        includedRevisions: rate.includedRevisions,
        estimatedHours: decOrNull(d.estimatedHours)?.toFixed(2) ?? null,
        startOn: dateOrNull(d.startOn),
        // Sans date saisie : échéance de la vidéo (interne, sinon client), visible au planning du monteur.
        dueOn: missionDueDate(dateOrNull(d.dueOn), video),
      },
    });
    if (cost.status !== "ENVELOPE") {
      const amount = cost.amount;
      await tx.directCost.create({
        data: {
          kind: "ASSIGNMENT",
          stage: amount && cost.status === "OK" ? "COMMITTED" : "ESTIMATED",
          committedAt: amount && cost.status === "OK" ? new Date() : null,
          label: `Mission ${editor.displayName} — ${video.reference}`,
          editorId: editor.id,
          assignmentId: assignment.id,
          projectId: video.projectId,
          videoId: video.id,
          currency: rate.currency,
          amount: amount?.toFixed(2) ?? null,
          amountEur: amount && fx ? convert(amount, fx).toFixed(2) : null,
          ...(amount && fx ? fxData(fx) : {}),
          incurredOn: parseDateOnly(today),
          createdById: actor.id,
          notes: cost.basis,
        },
      });
      if (!amount) warnings.push("Coût à renseigner : la marge reste provisoire.");
    } else {
      warnings.push("Mission couverte par l'enveloppe mensuelle : pensez à l'allocation analytique.");
    }
    if (["TO_PREPARE", "WAITING_RUSHES", "TO_ASSIGN"].includes(video.status)) {
      await tx.video.update({ where: { id: video.id }, data: { status: "ASSIGNED", version: { increment: 1 } } });
      await tx.videoStatusEvent.create({
        data: { videoId: video.id, fromStatus: video.status, toStatus: "ASSIGNED", actorId: actor.id, reason: `Affectation de ${editor.displayName}` },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "assignment.create",
      entityType: "Assignment",
      entityId: assignment.id,
      after: { editorId: editor.id, videoId: video.id, rate },
    });
    if (editor.userId && opts.notifyEditor !== false) {
      await notify(tx, {
        userIds: [editor.userId],
        type: "ASSIGNMENT_CREATED",
        title: `Nouvelle mission : ${video.title}`,
        body: assignment.dueOn ? `${video.reference} — échéance ${formatDateOnly(assignment.dueOn)}` : `${video.reference} — sans échéance`,
        link: `/missions/${video.id}`,
        entityType: "Assignment",
        entityId: assignment.id,
        eventKey: `assignment-created:${assignment.id}`,
      });
    }
    return { id: assignment.id, dueOn: assignment.dueOn };
  });
  return { id: result.id, warnings, dueOn: result.dueOn };
}

export interface BulkAssignOutcome {
  created: number;
  refusals: BulkRefusal[];
  warnings: string[];
}

/**
 * Affectation groupée d'un prestataire : une mission par vidéo, au même tarif figé (coût
 * calculé vidéo par vidéo). Chaque vidéo est contrôlée individuellement (clôture, doublon) ;
 * le prestataire reçoit une seule notification récapitulative.
 */
export async function assignEditorBulk(actor: Actor, input: BulkAssignmentInput): Promise<BulkAssignOutcome> {
  assertCan(actor, "assignments.write");
  const d = bulkAssignmentSchema.parse(input);
  const editor = await prisma.editorProfile.findUnique({ where: { id: d.editorId }, select: { id: true, userId: true, status: true } });
  if (!editor) throw new NotFoundError("Prestataire introuvable.");
  if (editor.status !== "ACTIVE") throw new DomainError("Ce prestataire n'est pas actif.");
  const videos = await prisma.video.findMany({
    where: { id: { in: [...new Set(d.videoIds)] } },
    orderBy: { reference: "asc" },
    select: { id: true, reference: true, title: true, estimatedHours: true },
  });
  if (videos.length === 0) throw new NotFoundError("Vidéo introuvable.");
  const common = {
    editorId: d.editorId, role: d.role, isPrimary: d.isPrimary, scope: d.scope, rateCardId: d.rateCardId, rateMode: d.rateMode,
    unitPrice: d.unitPrice, currency: d.currency, quantity: d.quantity, minuteRounding: d.minuteRounding,
    includedRevisions: d.includedRevisions, startOn: d.startOn, manualFxRate: d.manualFxRate,
  };
  const refused: { ref: string; message: string }[] = [];
  const warnings = new Set<string>();
  const created: { assignmentId: string; videoId: string; reference: string; title: string }[] = [];
  for (const v of videos) {
    try {
      const r = await assignEditor(
        actor,
        {
          ...common,
          videoId: v.id,
          dueOn: d.dueMode === "FIXED" ? d.dueOn : "",
          estimatedHours: d.estimatedHours || (v.estimatedHours?.toFixed() ?? ""),
        },
        { notifyEditor: false },
      );
      created.push({ assignmentId: r.id, videoId: v.id, reference: v.reference, title: v.title });
      for (const w of r.warnings) warnings.add(w);
    } catch (e) {
      refused.push({ ref: v.reference, message: refusalMessage(e) });
    }
  }
  if (created.length > 0 && editor.userId) {
    const first = created[0];
    await notify(prisma, {
      userIds: [editor.userId],
      type: "ASSIGNMENT_CREATED",
      title: created.length === 1 ? `Nouvelle mission : ${first.title}` : `${created.length} nouvelles missions`,
      body: `${created.slice(0, 6).map((c) => c.reference).join(", ")}${created.length > 6 ? "…" : ""}`,
      link: created.length === 1 ? `/missions/${first.videoId}` : "/missions",
      entityType: "Assignment",
      entityId: first.assignmentId,
      eventKey: `assignment-bulk:${first.assignmentId}:${created.length}`,
    });
  }
  return { created: created.length, refusals: groupRefusals(refused), warnings: [...warnings] };
}

export interface BulkAssignmentPreview {
  /** Vidéos qui recevront une mission. */
  eligible: number;
  /** Vidéos ignorées (clôturées ou déjà confiées à ce prestataire pour ce rôle). */
  skipped: BulkRefusal[];
  cost: { amount: string | null; currency: Currency; amountEur: string | null; missing: number; envelope: number; fxMissing: boolean; basis: string } | null;
  load: { plannedHours: string; addedHours: string; capacityHours: string | null; overloaded: boolean; missingEstimates: number; unavailable: boolean };
  notes: string[];
}

/** Aperçu d'une affectation groupée : coût total prévu, charge sur 7 jours, adéquation. */
export async function previewBulkAssignment(actor: Actor, input: BulkAssignmentInput): Promise<BulkAssignmentPreview> {
  assertCan(actor, "assignments.write");
  const d = bulkAssignmentSchema.parse(input);
  const editor = await prisma.editorProfile.findUnique({ where: { id: d.editorId } });
  if (!editor) throw new NotFoundError("Prestataire introuvable.");
  const videos = await prisma.video.findMany({
    where: { id: { in: [...new Set(d.videoIds)] } },
    orderBy: { reference: "asc" },
    select: {
      id: true, reference: true, type: true, status: true, estimatedHours: true, internalDeadline: true, clientDeadline: true,
      finalDurationSec: true, expectedDurationSec: true,
      assignments: { where: { editorId: d.editorId, role: d.role, status: { not: "CANCELLED" } }, select: { id: true } },
    },
  });
  const skipped: { ref: string; message: string }[] = [];
  const eligible = videos.filter((v) => {
    if (CLOSED_STATUSES.includes(v.status)) skipped.push({ ref: v.reference, message: "Vidéo clôturée : affectation impossible." });
    else if (v.assignments.length > 0) skipped.push({ ref: v.reference, message: "Déjà confiée à ce prestataire pour ce rôle." });
    else return true;
    return false;
  });

  const today = await agencyToday();
  const horizon = addDays(today, 7);
  const load = await getEditorLoad(prisma, editor.id, today, horizon);
  let added = new Decimal(0);
  let missingEstimates = load.missingEstimates;
  for (const v of eligible) {
    const due = d.dueMode === "FIXED" ? d.dueOn : missionDueDate(null, { internalDeadline: v.internalDeadline && toDateOnlyString(v.internalDeadline), clientDeadline: v.clientDeadline && toDateOnlyString(v.clientDeadline) });
    if (due && due > horizon) continue;
    const hours = decOrNull(d.estimatedHours) ?? (v.estimatedHours ? dec(v.estimatedHours) : null);
    if (hours) added = added.plus(hours);
    else missingEstimates += 1;
  }
  const plannedAfter = load.plannedHours.plus(added);

  const notes: string[] = [];
  const offFormat = eligible.filter((v) => editor.formats.length > 0 && !editor.formats.includes(v.type)).length;
  if (offFormat > 0) notes.push(`${offFormat} vidéo(s) d'un format non déclaré par le prestataire.`);
  const needed = ROLE_SKILLS[d.role] ?? [];
  if (needed.length > 0 && !needed.some((s) => (editor.skills as string[]).includes(s))) notes.push("Aucune compétence déclarée ne correspond à ce rôle.");
  if (load.capacityHours !== null && plannedAfter.gt(load.capacityHours)) notes.push("Surcharge : les heures prévues sur 7 jours dépassent la capacité indicative.");
  if (load.capacityHours === null) notes.push("Capacité hebdomadaire non renseignée : surcharge non vérifiable.");
  if (load.unavailable) notes.push("Indisponibilité déclarée sur les 7 prochains jours.");

  let cost: BulkAssignmentPreview["cost"] = null;
  if (can(actor, "costs.read") && eligible.length === 0) {
    cost = { amount: null, currency: editor.payCurrency, amountEur: null, missing: 0, envelope: 0, fxMissing: false, basis: "" };
  } else if (can(actor, "costs.read")) {
    // Sans droit d'écriture des coûts, l'aperçu suit le tarif du catalogue (prix saisis ignorés).
    const base = { ...d, videoId: eligible[0].id, dueOn: "" };
    const safe = can(actor, "costs.write") ? base : { ...base, rateMode: "" as const, unitPrice: "", currency: "" as const, minuteRounding: "" as const };
    const rate = await freezeRate(actor, safe, editor.payCurrency);
    let total = new Decimal(0);
    let missing = 0;
    let envelope = 0;
    let basis = "";
    for (const v of eligible) {
      const c = costFor(rate, v);
      basis ||= c.basis;
      if (c.status === "ENVELOPE") envelope += 1;
      else if (c.amount) total = total.plus(c.amount);
      else missing += 1;
    }
    let amountEur: string | null = null;
    let fxMissing = false;
    if (total.gt(0)) {
      try {
        amountEur = convert(total, await resolveFx(prisma, rate.currency, today, str(d.manualFxRate))).toFixed(2);
      } catch {
        fxMissing = true;
      }
    }
    cost = { amount: total.gt(0) ? total.toFixed(2) : null, currency: rate.currency, amountEur, missing, envelope, fxMissing, basis };
  }
  return {
    eligible: eligible.length,
    skipped: groupRefusals(skipped),
    cost,
    load: {
      plannedHours: load.plannedHours.toFixed(1),
      addedHours: added.toFixed(1),
      capacityHours: load.capacityHours?.toFixed(1) ?? null,
      overloaded: load.capacityHours !== null && plannedAfter.gt(load.capacityHours),
      missingEstimates,
      unavailable: load.unavailable,
    },
    notes,
  };
}

/**
 * Déplacement de l'échéance d'une vidéo : les missions en cours qui la suivaient (même date,
 * ou sans date) la suivent, avec un historique de déplacement par mission.
 */
export async function followVideoDeadline(
  tx: Db,
  actor: Actor,
  videoId: string,
  before: { internalDeadline: Date | null; clientDeadline: Date | null },
  after: { internalDeadline: Date | null; clientDeadline: Date | null },
): Promise<number> {
  const oldDue = missionDueDate(null, before);
  const newDue = missionDueDate(null, after);
  if (!newDue || oldDue?.getTime() === newDue.getTime()) return 0;
  const missions = await tx.assignment.findMany({
    where: { videoId, status: { in: ACTIVE_ASSIGNMENT_STATUSES }, dueOn: oldDue },
    select: { id: true, dueOn: true },
  });
  for (const m of missions) {
    await tx.assignment.update({ where: { id: m.id }, data: { dueOn: newDue, version: { increment: 1 } } });
    await tx.deadlineChange.create({
      data: { field: "ASSIGNMENT_DUE", assignmentId: m.id, videoId, oldDate: m.dueOn, newDate: newDue, reason: "Suit l'échéance de la vidéo", actorId: actor.id },
    });
  }
  return missions.length;
}

export async function updateAssignment(actor: Actor, input: AssignmentUpdateInput) {
  assertCan(actor, "assignments.write");
  const d = assignmentUpdateSchema.parse(input);
  const current = await prisma.assignment.findUnique({ where: { id: d.id } });
  if (!current) throw new NotFoundError();
  if (d.status === "APPROVED" && current.status !== "APPROVED") {
    return validateAssignment(actor, d.id);
  }
  if (d.status === "CANCELLED" && current.status !== "CANCELLED") {
    return cancelAssignment(actor, d.id, d.deadlineReason || "Mission annulée");
  }
  const dueOn = dateOrNull(d.dueOn);
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: d.id },
      data: {
        scope: str(d.scope),
        estimatedHours: decOrNull(d.estimatedHours)?.toFixed(2) ?? null,
        startOn: dateOrNull(d.startOn),
        dueOn,
        status: d.status,
        submittedAt: d.status === "SUBMITTED" && current.status !== "SUBMITTED" ? new Date() : current.submittedAt,
        version: { increment: 1 },
      },
    });
    if ((current.dueOn?.getTime() ?? null) !== (dueOn?.getTime() ?? null)) {
      await tx.deadlineChange.create({
        data: { field: "ASSIGNMENT_DUE", assignmentId: d.id, videoId: current.videoId, oldDate: current.dueOn, newDate: dueOn, reason: str(d.deadlineReason), actorId: actor.id },
      });
    }
  });
  return { id: d.id };
}

/** Validation interne de la mission : le coût passe à « Validé » (payable). */
export async function validateAssignment(actor: Actor, assignmentId: string) {
  assertCan(actor, "videos.validate");
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { directCosts: true } });
  if (!a) throw new NotFoundError();
  if (a.status === "CANCELLED") throw new DomainError("Mission annulée.");
  const base = a.directCosts.find((c) => c.kind === "ASSIGNMENT");
  if (base && base.amount === null) {
    throw new DomainError("Coût de la mission à renseigner avant validation.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { status: "APPROVED", internalValidatedById: actor.id, internalValidatedAt: new Date(), version: { increment: 1 } },
    });
    for (const c of a.directCosts) {
      if (c.stage === "CANCELLED" || c.stage === "VALIDATED" || c.amount === null) continue;
      await tx.directCost.update({
        where: { id: c.id },
        data: { stage: "VALIDATED", validatedAt: new Date(), validatedById: actor.id, committedAt: c.committedAt ?? new Date(), version: { increment: 1 } },
      });
    }
    await recordAudit(tx, { actorId: actor.id, action: "assignment.validate", entityType: "Assignment", entityId: assignmentId });
  });
  return { id: assignmentId };
}

/**
 * Annulation d'une mission. Les coûts déjà engagés ou validés restent dus (dette
 * conservée) ; seul un coût encore « estimé » est annulé.
 */
export async function cancelAssignment(actor: Actor, assignmentId: string, reason: string) {
  assertCan(actor, "assignments.write");
  if (!reason.trim()) throw new DomainError("Motif obligatoire.");
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { directCosts: true } });
  if (!a) throw new NotFoundError();
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "CANCELLED", version: { increment: 1 } } });
    for (const c of a.directCosts) {
      if (c.stage === "ESTIMATED") {
        await tx.directCost.update({
          where: { id: c.id },
          data: { stage: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, version: { increment: 1 } },
        });
      }
    }
    await recordAudit(tx, { actorId: actor.id, action: "assignment.cancel", entityType: "Assignment", entityId: assignmentId, reason });
  });
  return { id: assignmentId };
}

/**
 * Recalcule les coûts « à la minute finale » non validés quand la durée change
 * (le tarif figé n'est pas modifié ; seul le volume facturable évolue).
 */
export async function repriceMinuteCostsForVideo(tx: Db, actor: Actor, videoId: string) {
  const video = await tx.video.findUnique({ where: { id: videoId } });
  if (!video) return;
  const assignments = await tx.assignment.findMany({
    where: { videoId, rateMode: "PER_FINAL_MINUTE", status: { not: "CANCELLED" } },
    include: { directCosts: { where: { kind: "ASSIGNMENT", stage: { in: ["ESTIMATED", "COMMITTED"] } } } },
  });
  const today = (await agencyToday());
  for (const a of assignments) {
    const cost = a.directCosts[0];
    if (!cost || !a.unitPrice || !a.currency) continue;
    const result = computeAssignmentCost(
      { mode: "PER_FINAL_MINUTE", unitPrice: a.unitPrice, currency: a.currency, quantity: a.quantity, minuteRounding: a.minuteRounding },
      { finalDurationSec: video.finalDurationSec, expectedDurationSec: video.expectedDurationSec },
    );
    let amountEur: string | null = null;
    let fxFields = {};
    if (result.amount) {
      const fx = cost.fxUnitsPerEur
        ? { unitsPerEur: dec(cost.fxUnitsPerEur), rateDate: cost.fxRateDate ?? parseDateOnly(today), source: cost.fxSource ?? "MANUAL" as const }
        : await resolveFx(tx, a.currency, today).catch(() => null);
      if (fx) {
        amountEur = convert(result.amount, fx).toFixed(2);
        fxFields = fxData(fx);
      }
    }
    await tx.directCost.update({
      where: { id: cost.id },
      data: {
        amount: amountEur ? result.amount!.toFixed(2) : null,
        amountEur,
        ...fxFields,
        stage: result.status === "OK" && amountEur ? "COMMITTED" : "ESTIMATED",
        notes: result.basis,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cost.reprice_duration",
      entityType: "DirectCost",
      entityId: cost.id,
      before: { amount: cost.amount },
      after: { amount: result.amount?.toFixed(2) ?? null, basis: result.basis },
    });
  }
}

/**
 * Saisie du montant d'un coût « À renseigner » ou correction d'un coût non payé (avec trace).
 * `documentRef` : numéro de la facture du prestataire, si connu (détection des doublons).
 */
export async function setCostAmount(actor: Actor, input: { costId: string; amount: string; manualFxRate: string; reason: string; documentRef?: string }) {
  assertCan(actor, "costs.write");
  const cost = await prisma.directCost.findUnique({ where: { id: input.costId }, include: { paymentAllocations: { where: { reversedAt: null } } } });
  if (!cost) throw new NotFoundError();
  if (cost.stage === "CANCELLED") throw new DomainError("Coût annulé.");
  if (cost.paymentAllocations.length > 0) throw new DomainError("Coût déjà (partiellement) réglé : correction impossible, enregistrez un coût additionnel.");
  if (cost.stage === "VALIDATED" && !input.reason.trim()) throw new DomainError("Motif obligatoire pour corriger un coût validé.");
  const amount = decOrNull(input.amount);
  const today = await agencyToday();
  const fx = amount ? await resolveFx(prisma, cost.currency, today, str(input.manualFxRate)) : null;
  const rounded = amount ? roundMoney(amount, cost.currency as CurrencyCode) : null;
  if (cost.kind === "ENVELOPE" && rounded) {
    const allocated = await prisma.costAllocation.aggregate({ where: { directCostId: cost.id }, _sum: { amount: true } });
    if (dec(allocated._sum.amount ?? 0).gt(rounded)) throw new DomainError("Le montant est inférieur aux allocations déjà réalisées.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.directCost.update({
      where: { id: cost.id },
      data: {
        amount: rounded?.toFixed(2) ?? null,
        amountEur: rounded && fx ? convert(rounded, fx).toFixed(2) : null,
        ...(fx ? fxData(fx) : { fxUnitsPerEur: null, fxRateDate: null, fxSource: null }),
        stage: rounded && cost.stage === "ESTIMATED" ? "COMMITTED" : cost.stage,
        committedAt: rounded && !cost.committedAt ? new Date() : cost.committedAt,
        ...(input.documentRef !== undefined ? { documentRef: str(input.documentRef) } : {}),
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "cost.set_amount",
      entityType: "DirectCost",
      entityId: cost.id,
      before: { amount: cost.amount, amountEur: cost.amountEur },
      after: { amount: rounded?.toFixed(2) ?? null },
      reason: str(input.reason),
    });
  });
  return { id: cost.id };
}
