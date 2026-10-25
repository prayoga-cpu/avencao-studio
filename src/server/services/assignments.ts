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
import type { AssignmentInput, AssignmentUpdateInput } from "@/features/production/schemas";
import { assignmentSchema, assignmentUpdateSchema } from "@/features/production/schemas";
import type { Currency, MinuteRounding, RateMode } from "@/generated/prisma/enums";
import { addDays, parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { Decimal, dec, roundMoney, type CurrencyCode } from "@/lib/money";
import { recordAudit } from "../audit";
import { dateOrNull, decOrNull, intOrNull, str } from "../convert";
import { prisma, type Db } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { computeAssignmentCost, type CostResult } from "../domain/costing";
import { computeMargin, isBelowThreshold } from "../domain/profitability";
import { convert, fxData, resolveFx } from "../fx";
import { notify } from "../notifications";
import { assertCan, can, type Actor } from "../policies";
import { getSettings } from "../settings";
import { agencyToday } from "./common";
import { getEditorLoad, getVideosFinancials } from "./profitability";

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
  const roleSkill: Record<string, string[]> = {
    EDIT: ["PREMIERE_PRO", "DAVINCI_RESOLVE", "CAPCUT", "AFTER_EFFECTS"],
    RUSH_PREP: ["RUSH_PREP"],
    MOTION: ["MOTION_DESIGN", "AFTER_EFFECTS"],
    SUBTITLES: ["SUBTITLING"],
    COLOR: ["COLOR_GRADING", "DAVINCI_RESOLVE"],
    SOUND: ["SOUND_DESIGN"],
    THUMBNAIL: ["THUMBNAIL"],
    OTHER: [],
  };
  const needed = roleSkill[d.role] ?? [];
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

export async function assignEditor(actor: Actor, input: AssignmentInput): Promise<{ id: string; warnings: string[] }> {
  assertCan(actor, "assignments.write");
  const d = assignmentSchema.parse(input);
  const [video, editor] = await Promise.all([
    prisma.video.findUnique({ where: { id: d.videoId }, include: { project: true } }),
    prisma.editorProfile.findUnique({ where: { id: d.editorId } }),
  ]);
  if (!video) throw new NotFoundError("Vidéo introuvable.");
  if (!editor) throw new NotFoundError("Prestataire introuvable.");
  if (editor.status !== "ACTIVE") throw new DomainError("Ce prestataire n'est pas actif.");
  if (["DELIVERED", "ARCHIVED", "CANCELLED"].includes(video.status)) throw new DomainError("Vidéo clôturée : affectation impossible.");
  const today = await agencyToday();
  const rate = await freezeRate(actor, d, editor.payCurrency);
  const cost = costFor(rate, video);
  const warnings: string[] = [];

  let fx = null;
  if (cost.amount) fx = await resolveFx(prisma, rate.currency, today, str(d.manualFxRate));

  const id = await prisma.$transaction(async (tx) => {
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
        dueOn: dateOrNull(d.dueOn) ?? video.internalDeadline,
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
    if (editor.userId) {
      await notify(tx, {
        userIds: [editor.userId],
        type: "ASSIGNMENT_CREATED",
        title: `Nouvelle mission : ${video.title}`,
        body: `${video.reference} — échéance ${toDateOnlyString(assignment.dueOn ?? new Date())}`,
        link: `/missions/${video.id}`,
        entityType: "Assignment",
        entityId: assignment.id,
        eventKey: `assignment-created:${assignment.id}`,
      });
    }
    return assignment.id;
  });
  return { id, warnings };
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

/** Saisie du montant d'un coût « À renseigner » ou correction d'un coût non payé (avec trace). */
export async function setCostAmount(actor: Actor, input: { costId: string; amount: string; manualFxRate: string; reason: string }) {
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
