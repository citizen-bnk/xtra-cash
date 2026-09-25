import { createHash, randomUUID } from 'crypto';

/**
 * Credit bureau adapter. Production: TransUnion, Experian, XDS or Compuscan (via their SA APIs),
 * called only with the consumer's recorded consent as required by the NCA and POPIA.
 */
export interface CreditBureau {
  fetchScore(input: { idNumber: string; firstName: string; lastName: string }): Promise<{ score: number; reference: string }>;
}

/** Deterministic mock: the same ID number always gets the same score (520–780). */
export class MockCreditBureau implements CreditBureau {
  async fetchScore({ idNumber }: { idNumber: string }) {
    const h = createHash('sha256').update(idNumber).digest();
    return { score: 520 + (h.readUInt16BE(0) % 261), reference: `MOCK-${randomUUID().slice(0, 8)}` };
  }
}
