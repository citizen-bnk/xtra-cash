import { makeSaId, parseSaId, quoteLoan, maxPrincipalForInstallment, addMonths } from '@xtra/shared';
import { affordableInstallmentCents, allocate, CandidateOffer, ConsumerProfile, ineligibilityReason } from './credit-engine';

const profile: ConsumerProfile = {
  dateOfBirth: new Date(Date.UTC(1994, 2, 14)),
  province: 'Gauteng',
  employmentStatus: 'EMPLOYED_FULL_TIME',
  monthlyIncomeCents: 1_800_000,
  monthlyExpensesCents: 900_000,
  creditScore: 650,
};

const offer = (o: Partial<CandidateOffer> = {}): CandidateOffer => ({
  offerId: 'o1',
  offerName: 'Test',
  lenderId: 'l1',
  lenderName: 'Lender',
  monthlyInterestRateBps: 300,
  termMonths: 3,
  initiationFeeCents: 5_000,
  monthlyServiceFeeCents: 2_500,
  minAmountCents: 10_000,
  maxAmountPerUserCents: 300_000,
  minMonthlyIncomeCents: 0,
  minCreditScore: 0,
  minAge: 18,
  maxAge: 75,
  employmentStatuses: [],
  provinces: [],
  lenderAvailableCents: 10_000_000,
  userOpenPrincipalCents: 0,
  ...o,
});

describe('loan maths', () => {
  it('builds a schedule whose installments sum to the total and fully amortise', () => {
    const q = quoteLoan(135_000, { monthlyInterestRateBps: 300, termMonths: 3, initiationFeeCents: 5_000, monthlyServiceFeeCents: 2_500 });
    expect(q.schedule).toHaveLength(3);
    expect(q.schedule.reduce((s, i) => s + i.amountCents, 0)).toBe(q.totalRepayableCents);
    expect(q.schedule.reduce((s, i) => s + i.principalCents, 0)).toBe(q.financedCents);
    expect(q.costOfCreditCents).toBe(q.totalRepayableCents - 135_000);
  });

  it('handles 0% interest', () => {
    const q = quoteLoan(90_000, { monthlyInterestRateBps: 0, termMonths: 3, initiationFeeCents: 0, monthlyServiceFeeCents: 0 });
    expect(q.totalRepayableCents).toBe(90_000);
    expect(q.monthlyInstallmentCents).toBe(30_000);
  });

  it('maxPrincipalForInstallment never exceeds the installment cap', () => {
    const terms = { monthlyInterestRateBps: 450, termMonths: 6, initiationFeeCents: 15_000, monthlyServiceFeeCents: 6_900 };
    for (const cap of [10_000, 55_555, 123_456, 1_000_000]) {
      const p = maxPrincipalForInstallment(cap, terms);
      if (p > 0) expect(quoteLoan(p, terms).monthlyInstallmentCents).toBeLessThanOrEqual(cap);
    }
    expect(maxPrincipalForInstallment(1_000, terms)).toBe(0);
  });

  it('adds months without overflowing short months', () => {
    expect(addMonths(new Date(Date.UTC(2026, 0, 31)), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('SA ID numbers', () => {
  it('round-trips generated IDs', () => {
    const id = makeSaId(new Date(Date.UTC(1990, 4, 17)), 5010);
    const info = parseSaId(id, new Date(Date.UTC(2026, 0, 1)));
    expect(info.valid).toBe(true);
    expect(info.dateOfBirth?.toISOString().slice(0, 10)).toBe('1990-05-17');
    expect(info.gender).toBe('M');
  });
  it('rejects a bad check digit and bad dates', () => {
    const id = makeSaId(new Date(Date.UTC(1990, 4, 17)));
    const wrong = id.slice(0, 12) + ((Number(id[12]) + 1) % 10);
    expect(parseSaId(wrong).valid).toBe(false);
    expect(parseSaId('9013320000081').valid).toBe(false);
    expect(parseSaId('123').valid).toBe(false);
  });
});

describe('credit engine', () => {
  it('applies every lender criterion', () => {
    expect(ineligibilityReason(profile, offer())).toBeNull();
    expect(ineligibilityReason(profile, offer({ minMonthlyIncomeCents: 2_000_000 }))).toBe('income');
    expect(ineligibilityReason(profile, offer({ minCreditScore: 700 }))).toBe('credit_score');
    expect(ineligibilityReason(profile, offer({ employmentStatuses: ['GIG_WORKER'] }))).toBe('employment');
    expect(ineligibilityReason(profile, offer({ provinces: ['Limpopo'] }))).toBe('province');
    expect(ineligibilityReason(profile, offer({ maxAge: 25 }), new Date(Date.UTC(2026, 0, 1)))).toBe('age');
  });

  it('caps new installments at the affordability ratio minus existing debt', () => {
    expect(affordableInstallmentCents(profile, 0, 3000)).toBe(270_000);
    expect(affordableInstallmentCents(profile, 200_000, 3000)).toBe(70_000);
    expect(affordableInstallmentCents({ ...profile, monthlyExpensesCents: 2_000_000 }, 0, 3000)).toBe(0);
  });

  it('funds from the cheapest lender first and splits across lenders', () => {
    const cheap = offer({ offerId: 'cheap', lenderId: 'A', monthlyInterestRateBps: 100, maxAmountPerUserCents: 50_000 });
    const pricey = offer({ offerId: 'pricey', lenderId: 'B', monthlyInterestRateBps: 500 });
    const r = allocate([pricey, cheap], 80_000, 1_000_000);
    expect(r.remainderCents).toBe(0);
    expect(r.allocations.map((a) => [a.offer.offerId, a.principalCents])).toEqual([
      ['cheap', 50_000],
      ['pricey', 30_000],
    ]);
  });

  it('never exceeds lender liquidity, per-user caps or affordability', () => {
    const o = offer({ lenderAvailableCents: 20_000, maxAmountPerUserCents: 300_000 });
    expect(allocate([o], Infinity, 1_000_000).fundedCents).toBe(20_000);
    expect(allocate([offer({ userOpenPrincipalCents: 290_000 })], Infinity, 1_000_000).fundedCents).toBe(10_000);
    expect(allocate([offer({ userOpenPrincipalCents: 295_000 })], Infinity, 1_000_000).fundedCents).toBe(0); // below lender minimum
    const tight = allocate([offer()], Infinity, 20_000);
    expect(tight.allocations[0].monthlyInstallmentCents).toBeLessThanOrEqual(20_000);
  });

  it('leaves room for the next lender minimum rather than stranding a remainder', () => {
    const a = offer({ offerId: 'a', lenderId: 'A', monthlyInterestRateBps: 100, maxAmountPerUserCents: 100_000 });
    const b = offer({ offerId: 'b', lenderId: 'B', monthlyInterestRateBps: 400, minAmountCents: 10_000 });
    const r = allocate([a, b], 105_000, 1_000_000);
    expect(r.remainderCents).toBe(0);
    expect(r.allocations.map((x) => x.principalCents)).toEqual([95_000, 10_000]);
  });
});
