import { BadRequestException } from '@nestjs/common';
import type { DbOrTx } from '../db/client';
import { loanOffers, type personalLoanApplications } from '../db/schema';

export async function createApplicationOffer(
  tx: DbOrTx,
  template: typeof loanOffers.$inferSelect,
  application: typeof personalLoanApplications.$inferSelect,
) {
  if (!template.active || template.applicationId || template.productType !== 'PERSONAL')
    throw new BadRequestException('Select an active personal product as the pricing and eligibility template.');

  const [offer] = await tx.insert(loanOffers).values({
    applicationId: application.id,
    lenderId: template.lenderId,
    name: `${template.name.slice(0, 62)} · Once-off`,
    productType: 'PERSONAL',
    active: true,
    locationTarget: template.locationTarget,
    monthlyInterestRateBps: template.monthlyInterestRateBps,
    termMonths: application.termMonths,
    initiationFeeCents: template.initiationFeeCents,
    monthlyServiceFeeCents: template.monthlyServiceFeeCents,
    minAmountCents: application.amountCents,
    maxAmountPerUserCents: application.amountCents,
    minMonthlyIncomeCents: template.minMonthlyIncomeCents,
    incomeMultiple: template.incomeMultiple,
    minCreditScore: template.minCreditScore,
    minAge: template.minAge,
    maxAge: template.maxAge,
    employmentStatuses: template.employmentStatuses,
    provinces: template.provinces,
  }).returning();
  return offer;
}
