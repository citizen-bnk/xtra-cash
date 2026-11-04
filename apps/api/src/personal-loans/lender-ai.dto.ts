import { z } from "zod";
export const decisionChatInput = z
  .object({
    message: z.string().trim().min(1).max(24000),
    version: z.number().int().min(0),
    clientKey: z.string().min(8).max(100),
  })
  .strict();
export const decisionAdvanceInput = z
  .object({
    version: z.number().int().positive(),
    draftDigest: z.string().length(64),
    confirmed: z.literal(true),
  })
  .strict();
export const lenderPolicyInput = z
  .object({
    version: z.number().int().min(0),
    mode: z.enum(["MANUAL", "AUTO_ENGAGE", "AUTO_OFFER"]),
    offerId: z.string().max(100),
    amountLimitCents: z.number().int().min(50000).max(10000000),
    dailyOfferLimit: z.number().int().min(1).max(100),
    expiryHours: z.number().int().min(1).max(72),
    legalReference: z.string().max(500),
    agreementTerms: z.string().max(20000),
    automationReviewReference: z.string().max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const assessmentEventInput = z
  .object({
    eventId: z.string().min(8).max(150),
    applicationId: z.string().min(1).max(100),
    lenderId: z.string().min(1).max(100),
    offerId: z.string().min(1).max(100),
    assessmentReference: z.string().min(5).max(500),
    mandateReference: z.string().min(5).max(500),
    assessedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    decision: z.enum(["APPROVED", "REFER_TO_HUMAN"]),
    checks: z
      .object({
        identity: z.boolean(),
        income: z.boolean(),
        credit: z.boolean(),
        affordability: z.boolean(),
        mandate: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const decisionOutput = z.object({
  message: z.string().min(1).max(3000),
  nextAction: z.enum([
    "PREPARE_OFFER",
    "REQUEST_INFORMATION",
    "REVIEW",
    "RESOLVE_HUMAN_REVIEW",
  ]),
  informationMessage: z.string().max(500).nullable(),
  updates: z
    .array(
      z.object({
        field: z.enum([
          "offerId",
          "assessmentReference",
          "mandateReference",
          "legalReference",
          "assessedAt",
          "agreementTerms",
        ]),
        value: z.string().max(20000),
        sourceQuote: z.string().max(24000),
      }),
    )
    .max(6),
});
