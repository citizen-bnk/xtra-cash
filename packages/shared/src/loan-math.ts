/**
 * Loan maths shared by the API (source of truth) and the apps (for previews).
 * All amounts are integer cents. Rates are monthly, in basis points.
 */

export interface LoanTerms {
  monthlyInterestRateBps: number;
  termMonths: number;
  initiationFeeCents: number;
  monthlyServiceFeeCents: number;
}

export interface ScheduledInstallment {
  seq: number;
  principalCents: number;
  interestCents: number;
  serviceFeeCents: number;
  amountCents: number;
}

export interface LoanQuote {
  principalCents: number; // amount advanced to the purchase
  financedCents: number; // principal + initiation fee
  monthlyInstallmentCents: number; // first installment (all but last are equal)
  totalRepayableCents: number;
  costOfCreditCents: number; // total repayable - principal
  schedule: ScheduledInstallment[];
}

export function amortisedPaymentCents(financedCents: number, rateBps: number, n: number): number {
  if (n <= 0) throw new Error('termMonths must be positive');
  if (financedCents <= 0) return 0;
  const r = rateBps / 10_000;
  if (r === 0) return Math.ceil(financedCents / n);
  return Math.ceil((financedCents * r) / (1 - Math.pow(1 + r, -n)));
}

export function quoteLoan(principalCents: number, terms: LoanTerms): LoanQuote {
  if (!Number.isInteger(principalCents) || principalCents <= 0) throw new Error('principal must be a positive integer (cents)');
  const n = terms.termMonths;
  const r = terms.monthlyInterestRateBps / 10_000;
  const financed = principalCents + terms.initiationFeeCents;
  const pmt = amortisedPaymentCents(financed, terms.monthlyInterestRateBps, n);

  const schedule: ScheduledInstallment[] = [];
  let balance = financed;
  for (let seq = 1; seq <= n; seq++) {
    const interest = Math.round(balance * r);
    const principalPart = seq === n ? balance : Math.min(balance, pmt - interest);
    balance -= principalPart;
    schedule.push({
      seq,
      principalCents: principalPart,
      interestCents: interest,
      serviceFeeCents: terms.monthlyServiceFeeCents,
      amountCents: principalPart + interest + terms.monthlyServiceFeeCents,
    });
  }
  const total = schedule.reduce((s, i) => s + i.amountCents, 0);
  return {
    principalCents,
    financedCents: financed,
    monthlyInstallmentCents: schedule[0].amountCents,
    totalRepayableCents: total,
    costOfCreditCents: total - principalCents,
    schedule,
  };
}

/**
 * Largest principal whose monthly installment does not exceed `maxInstallmentCents`.
 * Used for affordability-capped XTRA-Balance.
 */
export function maxPrincipalForInstallment(maxInstallmentCents: number, terms: LoanTerms): number {
  const available = maxInstallmentCents - terms.monthlyServiceFeeCents;
  if (available <= 0) return 0;
  const r = terms.monthlyInterestRateBps / 10_000;
  const n = terms.termMonths;
  const pv = r === 0 ? available * n : (available * (1 - Math.pow(1 + r, -n))) / r;
  // Leave a small rounding margin (1 cent per installment) so the quote never exceeds the cap.
  let principal = Math.floor(pv) - terms.initiationFeeCents - n;
  if (principal <= 0) return 0;
  // Final guard against rounding drift.
  while (principal > 0 && quoteLoan(principal, terms).monthlyInstallmentCents > maxInstallmentCents) principal -= 100;
  return Math.max(0, principal);
}

/** Adds whole calendar months, clamping to the end of shorter months. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
