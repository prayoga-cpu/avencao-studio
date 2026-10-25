import "server-only";
import type { OpportunityStage } from "@/generated/prisma/enums";
import type { OpportunityInput } from "@/features/prospection/schemas";
import { moveStageSchema, opportunitySchema } from "@/features/prospection/schemas";
import { OPPORTUNITY_STAGE } from "@/lib/labels";
import { recordAudit } from "../audit";
import { dateOrNull, decOrNull, str } from "../convert";
import { prisma } from "../db";
import { DomainError, NotFoundError } from "../errors";
import { assertCan, type Actor } from "../policies";
import { assertVersion } from "./common";

function oppData(d: ReturnType<typeof opportunitySchema.parse>) {
  return {
    clientId: d.clientId,
    title: d.title,
    stage: d.stage,
    services: d.services,
    servicesNote: str(d.servicesNote),
    estimatedAmount: decOrNull(d.estimatedAmount)?.toFixed(2) ?? null,
    currency: d.currency,
    probability: decOrNull(d.probability)?.toFixed(2) ?? null,
    expectedCloseOn: dateOrNull(d.expectedCloseOn),
    nextAction: str(d.nextAction),
    followUpOn: dateOrNull(d.followUpOn),
    lostReason: str(d.lostReason),
    ownerId: str(d.ownerId),
  };
}

function stageTimestamps(stage: OpportunityStage, prev?: OpportunityStage) {
  if (stage === prev) return {};
  return {
    wonAt: stage === "WON" ? new Date() : null,
    lostAt: stage === "LOST" ? new Date() : null,
  };
}

export async function createOpportunity(actor: Actor, input: OpportunityInput) {
  assertCan(actor, "prospection.write");
  const d = opportunitySchema.parse(input);
  if (d.stage === "LOST" && !str(d.lostReason)) throw new DomainError("Indiquez le motif de perte.");
  const opp = await prisma.opportunity.create({ data: { ...oppData(d), ...stageTimestamps(d.stage) } });
  await prisma.activity.create({
    data: { clientId: d.clientId, opportunityId: opp.id, type: "STAGE_CHANGE", subject: `Opportunité créée : ${OPPORTUNITY_STAGE[d.stage].label}`, authorId: actor.id },
  });
  return { id: opp.id };
}

export async function updateOpportunity(actor: Actor, id: string, input: OpportunityInput) {
  assertCan(actor, "prospection.write");
  const d = opportunitySchema.parse(input);
  const current = await prisma.opportunity.findUnique({ where: { id } });
  if (!current) throw new NotFoundError();
  assertVersion(current.version, d.version);
  if (d.stage === "LOST" && !str(d.lostReason)) throw new DomainError("Indiquez le motif de perte.");
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id },
      data: { ...oppData(d), ...stageTimestamps(d.stage, current.stage), version: { increment: 1 } },
    });
    if (current.stage !== d.stage) {
      await tx.activity.create({
        data: {
          clientId: current.clientId,
          opportunityId: id,
          type: "STAGE_CHANGE",
          subject: `${OPPORTUNITY_STAGE[current.stage].label} → ${OPPORTUNITY_STAGE[d.stage].label}`,
          body: d.stage === "LOST" ? `Motif : ${d.lostReason}` : null,
          authorId: actor.id,
        },
      });
    }
  });
  return { id };
}

/** Déplacement Kanban : validé côté serveur et historisé. */
export async function moveOpportunityStage(actor: Actor, input: { id: string; stage: OpportunityStage; lostReason?: string }) {
  assertCan(actor, "prospection.write");
  const d = moveStageSchema.parse({ lostReason: "", ...input });
  const current = await prisma.opportunity.findUnique({ where: { id: d.id } });
  if (!current) throw new NotFoundError();
  if (current.stage === d.stage) return { id: d.id };
  if (d.stage === "LOST" && !str(d.lostReason) && !current.lostReason) {
    throw new DomainError("Indiquez le motif de perte avant de classer l'opportunité en « Perdu ».");
  }
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: d.id },
      data: {
        stage: d.stage,
        lostReason: d.stage === "LOST" ? (str(d.lostReason) ?? current.lostReason) : current.lostReason,
        ...stageTimestamps(d.stage, current.stage),
        version: { increment: 1 },
      },
    });
    await tx.activity.create({
      data: {
        clientId: current.clientId,
        opportunityId: d.id,
        type: "STAGE_CHANGE",
        subject: `${OPPORTUNITY_STAGE[current.stage].label} → ${OPPORTUNITY_STAGE[d.stage].label}`,
        authorId: actor.id,
      },
    });
  });
  return { id: d.id };
}

/**
 * Opportunité gagnée → projet. Reprend client, intitulé et prestations. Ne crée ni
 * facture émise ni encaissement : la vente se saisit ensuite explicitement.
 */
export async function convertOpportunityToProject(actor: Actor, opportunityId: string) {
  assertCan(actor, "projects.write");
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { client: true } });
  if (!opp) throw new NotFoundError();
  if (opp.stage !== "WON") throw new DomainError("Seule une opportunité gagnée peut devenir un projet.");
  if (opp.projectId) throw new DomainError("Un projet existe déjà pour cette opportunité.");
  const { createProject } = await import("./projects");
  const project = await createProject(actor, {
    clientId: opp.clientId,
    title: opp.title,
    description: [opp.servicesNote, opp.nextAction ? `Prochaine action : ${opp.nextAction}` : null].filter(Boolean).join("\n"),
    ownerId: opp.ownerId ?? actor.id,
    startOn: "",
    clientDeadline: opp.expectedCloseOn ? opp.expectedCloseOn.toISOString().slice(0, 10) : "",
    status: "ACTIVE",
    priority: "NORMAL",
    driveUrl: opp.client.driveUrl ?? "",
    otherLinks: "",
    includedRevisionRounds: "",
    revisionRoundDefinition: "",
    productionErrorPolicy: "",
    templateId: "",
    videoCount: "",
  });
  await prisma.opportunity.update({ where: { id: opportunityId }, data: { projectId: project.id } });
  if (opp.client.status === "PROSPECT") {
    await prisma.client.update({ where: { id: opp.clientId }, data: { status: "ACTIVE" } });
  }
  await recordAudit(prisma, { actorId: actor.id, action: "opportunity.convert", entityType: "Opportunity", entityId: opportunityId, after: { projectId: project.id } });
  return project;
}
