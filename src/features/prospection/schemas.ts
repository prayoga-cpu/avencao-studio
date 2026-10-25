import { z } from "zod";
import { VIDEO_TYPES } from "@/features/editors/schemas";
import { zCurrency, zDate, zMoney, zPercent, zRequired, zText } from "@/lib/validation";

export const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"] as const;

export const opportunitySchema = z.object({
  clientId: zRequired("Client", 64),
  title: zRequired("Intitulé", 160),
  stage: z.enum(STAGES),
  services: z.array(z.enum(VIDEO_TYPES)),
  servicesNote: zText(500),
  estimatedAmount: zMoney,
  currency: zCurrency,
  probability: zPercent,
  expectedCloseOn: zDate,
  nextAction: zText(300),
  followUpOn: zDate,
  lostReason: zText(300),
  ownerId: zText(64),
  version: z.number().int().optional(),
});
export type OpportunityInput = z.input<typeof opportunitySchema>;

export const moveStageSchema = z.object({
  id: zRequired("Opportunité", 64),
  stage: z.enum(STAGES),
  lostReason: zText(300),
});
