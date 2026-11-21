import { z } from "zod";
const ref = z.string().trim().min(1).max(500);
export const manualOfferInput = z.object({
  lenderId: z.string().min(1).max(100).optional(),
  amountCents: z.number().int().min(50000).max(10000000),
  termMonths: z.number().int().min(1).max(24),
  monthlyInterestRateBps: z.number().int().min(0).max(10000),
  initiationFeeCents: z.number().int().min(0).max(200000),
  monthlyServiceFeeCents: z.number().int().min(0).max(100000),
}).strict();

export const approveInput = z
  .object({
    offerId: z.string().min(1).max(100),
    applicationOnly: z.literal(true).optional(),
    assessmentReference: ref.optional(),
    mandateReference: ref.optional(),
    legalReference: ref.optional(),
    assessedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    agreementTerms: z.string().trim().min(1).max(20000).optional(),
    responsibleLendingConfirmed: z.literal(true),
  })
  .strict();
export const acceptInput = z
  .object({
    digest: z.string().length(64),
    acknowledged: z.literal(true),
    signature: z.string().max(180000),
    password: z.string().min(1).max(128),
  })
  .strict();
export const beneficiaryInput = z
  .object({
    bankCode: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/),
    accountNumber: z.string().regex(/^\d{6,20}$/),
    accountType: z.enum(["CURRENT", "SAVINGS", "TRANSMISSION"]),
    password: z.string().min(1).max(128),
  })
  .strict();
export const withdrawInput = z
  .object({
    beneficiaryId: z.string().min(1).max(100),
    amountCents: z.number().int().min(100).max(10000000),
    clientKey: z.string().min(8).max(100),
    password: z.string().min(1).max(128),
  })
  .strict();
export const updateReview = z
  .object({ message: z.string().trim().min(3).max(500) })
  .strict();
export const externalPaymentInput = z.object({
  confirmed: z.literal(true),
  note: z.string().trim().min(3).max(1000),
}).strict();
