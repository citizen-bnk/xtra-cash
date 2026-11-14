import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { PAYDAY_STAGES } from '@xtra/shared';
const text = (max = 200) => z.string().trim().min(1).max(max);
const date = z.string().datetime({ offset: true });
const money = z.number().int().min(0).max(100000000);
export const leadInput = z.object({ clientKey: text(100), legalName: text(), registrationNumber: text(40), contactName: text(100), contactChannel: text(120), address: text(), headcount: z.number().int().min(1).max(1000000), permissionReference: text(), nextAction: text(), followUpAt: date, ownerId: text(80).optional(), meetingId: z.string().uuid().optional(), meetingNotes: z.string().trim().max(6000).optional() }).strict();
export const leadUpdate = z.object({ version: z.number().int().positive(), stage: z.enum(PAYDAY_STAGES), nextAction: text(), followUpAt: date, ownerId: text(80).optional(), agreementReference: text().optional(), lenderReference: text().optional(), payrollReference: text().optional() }).strict();
export const visitInput = z.object({ clientKey: text(100), employerId: text(80), outcome: text(100), notes: text(1000), nextAction: text(), followUpAt: date }).strict();
export const entryInput = z.object({ kind: z.enum(['RECEIPT', 'COST']), amountCents: money.refine(n => n > 0), reference: text(120), evidence: text(500), lenderId: text(80).optional(), settledAt: date, earnedPlatformRevenue: z.literal(true) }).strict();
export const reversalInput = z.object({ reference: text(120), evidence: text(500), settledAt: date }).strict();
export const employeeInput = z.object({ email: z.string().trim().toLowerCase().email(), firstName: text(80), lastName: text(80), phone: text(30), initialPassword: z.string().min(12).max(128).optional(), employeeNumber: text(40), territory: text(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), employmentReference: text(300) }).strict();
export const employeeUpdate = z.object({ status: z.enum(['ONBOARDING', 'ACTIVE', 'INACTIVE']), territory: text(), employmentReference: text(300), basicCents: money, weeklyHours: z.number().int().min(1).max(45) }).strict();
export const trainingInput = z.object({ title: text(120), content: text(16000), required: z.boolean() }).strict();
export const completionInput = z.object({ revision: z.number().int().positive(), acknowledged: z.literal(true) }).strict();
export const kitInput = z.object({ userId: text(80), item: text(120), quantity: z.number().int().min(1).max(1000) }).strict();
export const statementInput = z.object({ userId: text(80), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), basicCents: money, otherCents: money, deductions: z.array(z.object({ label: text(120), cents: money })).max(20), awardIds: z.array(text(80)).max(100), payrollEvidence: text(500) }).strict();
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export const passwordInput = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict();
export const referenceInput = z.object({ reference: text(120) }).strict();
