/**
 * Pure credit decision logic — no database access, fully unit-tested.
 *
 * 1. Eligibility: an offer matches a consumer when every lender criterion is met.
 * 2. Affordability (NCA s81): new installments may not exceed a share of disposable income
 *    after declared expenses and existing XTRA-CASH installments.
 * 3. Allocation: a purchase shortfall is funded from the cheapest eligible offers first,
 *    splitting across lenders if needed, and each lender's capacity is respected.
 */
import { ageOn, LoanTerms, maxPrincipalForInstallment, quoteLoan } from '@xtra/shared';

export interface ConsumerProfile {
  dateOfBirth: Date;
  province: string;
  employmentStatus: string;
  monthlyIncomeCents: number;
  monthlyExpensesCents: number;
  creditScore: number | null;
}

export interface CandidateOffer extends LoanTerms {
  offerId: string;
  offerName: string;
  lenderId: string;
  lenderName: string;
  minAmountCents: number;
  maxAmountPerUserCents: number;
  minMonthlyIncomeCents: number;
  minCreditScore: number;
  minAge: number;
  maxAge: number;
  employmentStatuses: string[];
  provinces: string[];
  /** Lender's uncommitted funds */
  lenderAvailableCents: number;
  /** Principal this consumer still owes on open loans from this offer */
  userOpenPrincipalCents: number;
}

export function ineligibilityReason(p: ConsumerProfile, o: CandidateOffer, now = new Date()): string | null {
  const age = ageOn(p.dateOfBirth, now);
  if (age < o.minAge || age > o.maxAge) return 'age';
  if (p.monthlyIncomeCents < o.minMonthlyIncomeCents) return 'income';
  if ((p.creditScore ?? 0) < o.minCreditScore) return 'credit_score';
  if (o.employmentStatuses.length && !o.employmentStatuses.includes(p.employmentStatus)) return 'employment';
  if (o.provinces.length && !o.provinces.includes(p.province)) return 'province';
  return null;
}

export function affordableInstallmentCents(p: ConsumerProfile, existingInstallmentsCents: number, ratioBps: number): number {
  const disposable = p.monthlyIncomeCents - p.monthlyExpensesCents;
  if (disposable <= 0) return 0;
  return Math.max(0, Math.floor((disposable * ratioBps) / 10_000) - existingInstallmentsCents);
}

/** Total cost of a reference R1 000 loan — used to rank offers cheapest-first. */
export function costRank(o: LoanTerms): number {
  return quoteLoan(100_000, o).totalRepayableCents;
}

export function offerCapacity(o: CandidateOffer, remainingInstallmentCents: number): number {
  const perUser = o.maxAmountPerUserCents - o.userOpenPrincipalCents;
  const cap = Math.min(perUser, o.lenderAvailableCents, maxPrincipalForInstallment(remainingInstallmentCents, o));
  return cap >= o.minAmountCents ? cap : 0;
}

export interface Allocation {
  offer: CandidateOffer;
  principalCents: number;
  monthlyInstallmentCents: number;
}

/**
 * Greedily funds `amountCents` (use Infinity to compute total capacity) from the cheapest offers.
 * Returns the allocations and any unfunded remainder.
 */
export function allocate(
  eligible: CandidateOffer[],
  amountCents: number,
  affordableCents: number,
): { allocations: Allocation[]; fundedCents: number; remainderCents: number } {
  const sorted = [...eligible].sort((a, b) => costRank(a) - costRank(b));
  const allocations: Allocation[] = [];
  let remaining = amountCents;
  let installmentLeft = affordableCents;

  for (let i = 0; i < sorted.length; i++) {
    const offer = sorted[i];
    if (remaining <= 0) break;
    const cap = offerCapacity(offer, installmentLeft);
    if (cap <= 0) continue;
    let take = Math.min(cap, remaining);
    // If this lender can't cover everything, leave at least the next lender's minimum for them.
    const leftover = remaining - take;
    if (Number.isFinite(leftover) && leftover > 0 && i < sorted.length - 1) {
      const nextMin = Math.min(...sorted.slice(i + 1).map((o) => o.minAmountCents));
      if (leftover < nextMin && take - (nextMin - leftover) >= offer.minAmountCents) take -= nextMin - leftover;
    }
    if (take < offer.minAmountCents) {
      // The remainder is below this lender's minimum; borrow the minimum only if the purchase is
      // tiny overall (never over-lend beyond the purchase). Otherwise try the next lender.
      continue;
    }
    const q = quoteLoan(take, offer);
    allocations.push({ offer, principalCents: take, monthlyInstallmentCents: q.monthlyInstallmentCents });
    remaining -= take;
    installmentLeft -= q.monthlyInstallmentCents;
  }
  const funded = allocations.reduce((s, a) => s + a.principalCents, 0);
  return { allocations, fundedCents: funded, remainderCents: Number.isFinite(amountCents) ? amountCents - funded : 0 };
}
