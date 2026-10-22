import { addMonths, type LendingPerformance, type LendingProduct } from '@xtra/shared';

export interface PerformanceLoan {
  principalCents: number; totalRepayableCents: number; outstandingCents: number;
  status: string; createdAt: Date; termMonths: number;
  offer: { productType: string } | null;
  installments: { dueDate: Date; amountCents: number; paidCents: number }[];
  repayments: { lenderShareCents: number }[];
}
const PRODUCTS: LendingProduct[] = ['BNPL', 'PERSONAL', 'BUSINESS', 'OTHER'];
function empty(product: LendingProduct): LendingPerformance {
  return { product, fundedLoans: 0, activeLoans: 0, outstandingCents: 0, advancedCents: 0, netReceivedCents: 0, realizedReturnCents: 0, projectedNetReturnCents: 0, estimatedAccruedMicros: 0, estimatedDailyMicros: 0 };
}

/** Contract-wide straight-line estimate; never a ledger posting or a promised return. */
export function calculatePerformance(rows: PerformanceLoan[], platformShareBps: number, now = new Date()) {
  const models = PRODUCTS.map(empty), at = now.getTime();
  for (const loan of rows) {
    const product = PRODUCTS.includes(loan.offer?.productType as LendingProduct) ? loan.offer!.productType as LendingProduct : 'OTHER';
    const model = models.find(m => m.product === product)!;
    const received = loan.repayments.reduce((sum, r) => sum + r.lenderShareCents, 0);
    const settled = loan.status === 'SETTLED';
    const projected = settled ? received - loan.principalCents : loan.totalRepayableCents - Math.floor(loan.totalRepayableCents * platformShareBps / 10000) - loan.principalCents;
    const start = loan.createdAt.getTime();
    const end = loan.installments.reduce((last, i) => Math.max(last, i.dueDate.getTime()), start) || start;
    const maturity = end > start ? end : addMonths(loan.createdAt, loan.termMonths).getTime();
    const duration = Math.max(1, maturity - start);
    const overdue = loan.installments.filter(i => i.paidCents < i.amountCents && i.dueDate.getTime() <= at).map(i => i.dueDate.getTime());
    let cutoff = Math.min(at, maturity);
    if (overdue.length) cutoff = Math.min(cutoff, ...overdue);
    if (['IN_ARREARS', 'DEFAULTED'].includes(loan.status) && !overdue.length) cutoff = start;
    const fraction = Math.max(0, Math.min(1, (cutoff - start) / duration));
    const growing = !settled && loan.status === 'ACTIVE' && !overdue.length && at >= start && at < maturity;
    model.fundedLoans++;
    if (['ACTIVE', 'IN_ARREARS'].includes(loan.status)) model.activeLoans++;
    model.advancedCents += loan.principalCents;
    if (!settled) model.outstandingCents += loan.outstandingCents;
    model.netReceivedCents += received;
    if (settled) model.realizedReturnCents += received - loan.principalCents;
    model.projectedNetReturnCents += projected;
    model.estimatedAccruedMicros += Math.trunc(projected * 10000 * (settled ? 1 : fraction));
    model.estimatedDailyMicros += growing ? Math.trunc(projected * 10000 * 86400000 / duration) : 0;
  }
  const { product: _product, ...totals } = empty('OTHER');
  for (const model of models) for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += model[key];
  return { models, totals };
}
