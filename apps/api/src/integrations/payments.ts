import { randomBytes } from 'crypto';

/**
 * Pay-in gateway adapter (wallet top-ups, loan repayments, accreditation fees).
 * Production: Ozow / PayFast / Peach Payments / Stitch, confirmed by signed webhook,
 * plus DebiCheck mandates for scheduled repayment collection.
 */
export interface PaymentGateway {
  collect(input: { amountCents: number; reference: string; payerUserId: string }): Promise<{ success: boolean; providerRef: string }>;
}

export class MockPaymentGateway implements PaymentGateway {
  async collect() {
    return { success: true, providerRef: `mock_pay_${randomBytes(6).toString('hex')}` };
  }
}
