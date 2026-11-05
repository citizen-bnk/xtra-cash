import { z } from "zod";
const ref = z.string().trim().min(1).max(500);
export const approveInput = z
  .object({
    offerId: z.string().min(1).max(100),
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
