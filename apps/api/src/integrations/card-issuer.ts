import { randomBytes, randomInt } from 'crypto';

/**
 * Card issuing adapter. Production: a BIN sponsor / issuer-processor that supports
 * Just-In-Time (JIT) funding webhooks, so XTRA-CASH decides each authorisation in real time
 * (see CardNetworkController). The full PAN never touches XTRA-CASH servers (PCI-DSS scope).
 */
export interface CardIssuer {
  issueVirtualCard(input: { userId: string; nameOnCard: string }): Promise<{
    processorRef: string;
    last4: string;
    maskedPan: string;
    expiryMonth: number;
    expiryYear: number;
  }>;
  setStatus(processorRef: string, status: 'ACTIVE' | 'FROZEN' | 'CANCELLED'): Promise<void>;
}

export class MockCardIssuer implements CardIssuer {
  async issueVirtualCard() {
    const last4 = String(randomInt(0, 10000)).padStart(4, '0');
    const now = new Date();
    return {
      processorRef: `mock_card_${randomBytes(8).toString('hex')}`,
      last4,
      maskedPan: `5399 99•• •••• ${last4}`,
      expiryMonth: now.getUTCMonth() + 1,
      expiryYear: now.getUTCFullYear() + 4,
    };
  }
  async setStatus() {}
}
