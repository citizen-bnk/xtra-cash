import { calculatePerformance, type PerformanceLoan } from './performance';
const start = new Date('2026-01-01T00:00:00Z'), day = 86400000;
function loan(patch: Partial<PerformanceLoan> = {}): PerformanceLoan {
  return { principalCents: 10000, totalRepayableCents: 12000, outstandingCents: 12000, status: 'ACTIVE', createdAt: start, termMonths: 2, offer: { productType: 'BNPL' }, installments: [{ dueDate: new Date(+start + 60 * day), amountCents: 12000, paidCents: 0 }], repayments: [], ...patch };
}
describe('lender performance estimates', () => {
  it('keeps unfunded streams at zero', () => {
    const result = calculatePerformance([], 500, start);
    expect(result.models.map(m => m.product)).toEqual(['BNPL', 'PERSONAL', 'BUSINESS', 'OTHER']);
    expect(Object.values(result.totals).every(v => v === 0)).toBe(true);
  });
  it('uses scheduled net return after platform deductions, with real five-second movement', () => {
    const at = new Date(+start + 30 * day);
    const a = calculatePerformance([loan()], 500, at).totals;
    const b = calculatePerformance([loan()], 500, new Date(+at + 5000)).totals;
    expect(a.projectedNetReturnCents).toBe(1400); expect(a.estimatedAccruedMicros).toBe(7000000);
    expect(b.estimatedAccruedMicros - a.estimatedAccruedMicros).toBeGreaterThan(0);
    expect(a.realizedReturnCents).toBe(0);
  });
  it('does not present principal returned as realised profit', () => {
    const result = calculatePerformance([loan({ repayments: [{ lenderShareCents: 9000 }] })], 500, start).totals;
    expect(result.netReceivedCents).toBe(9000); expect(result.realizedReturnCents).toBe(0);
  });
  it('uses actual receipts for closed loans and never continues their accrual', () => {
    const result = calculatePerformance([loan({ status: 'SETTLED', outstandingCents: 0, repayments: [{ lenderShareCents: 11300 }] })], 500, new Date(+start + 90 * day)).totals;
    expect(result.realizedReturnCents).toBe(1300); expect(result.estimatedAccruedMicros).toBe(13000000); expect(result.estimatedDailyMicros).toBe(0);
  });
  it('freezes an overdue loan at its first unpaid due date', () => {
    const overdue = loan({ status: 'IN_ARREARS', installments: [{ dueDate: new Date(+start + 30 * day), amountCents: 6000, paidCents: 1000 }, { dueDate: new Date(+start + 60 * day), amountCents: 6000, paidCents: 0 }] });
    const a = calculatePerformance([overdue], 500, new Date(+start + 45 * day)).totals;
    const b = calculatePerformance([overdue], 500, new Date(+start + 50 * day)).totals;
    expect(a.estimatedAccruedMicros).toBe(b.estimatedAccruedMicros); expect(a.estimatedDailyMicros).toBe(0);
  });
  it('separates funded product streams, including imported business loans', () => {
    const result = calculatePerformance(['BNPL', 'PERSONAL', 'BUSINESS', 'UNCLASSIFIED'].map(productType => loan({ offer: { productType } })), 500, start);
    expect(result.models.every(m => m.fundedLoans === 1)).toBe(true); expect(result.totals.advancedCents).toBe(40000);
  });
  it('does not invent a positive return on a loss-making contract or a future loan', () => {
    const negative = calculatePerformance([loan({ totalRepayableCents: 10000 })], 500, new Date(+start + 30 * day)).totals;
    expect(negative.estimatedAccruedMicros).toBeLessThan(0);
    const future = calculatePerformance([loan()], 500, new Date(+start - day)).totals;
    expect(future.estimatedAccruedMicros).toBe(0); expect(future.estimatedDailyMicros).toBe(0);
  });
});
