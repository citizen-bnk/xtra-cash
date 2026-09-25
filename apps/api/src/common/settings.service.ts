import { Injectable } from '@nestjs/common';
import type { PlatformSettings } from '@xtra/shared';
import { platformSettings } from '../db/schema';
import type { DbOrTx } from '../db/client';
import { Db } from '../db/client';
import { InjectDb } from './db.module';

/**
 * Defaults are a starting point aligned with the National Credit Act caps as understood at build time.
 * They MUST be confirmed by a compliance officer before go-live and are editable by SUPER_ADMIN.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  affordabilityRatioBps: 3000, // up to 30% of (income - expenses) may go to XTRA-CASH installments
  maxRateBps: 500, // 5% per month (short-term credit cap, first loan)
  maxMonthlyServiceFeeCents: 6900, // R69 per month
  platformShareBps: 500, // XTRA-CASH keeps 5% of every repayment
  assistedAccreditationFeeCents: 250000, // R2 500 for assisted accreditation
  commissionConsumerActivationCents: 5000, // R50 when a referred consumer passes KYC
  commissionLenderAccreditedCents: 100000, // R1 000 when a referred lender is accredited
  commissionLoanOriginationBps: 100, // 1% of principal on loans taken by referred consumers
  minPayoutCents: 10000, // R100
  platformBankDetails: 'XTRA-CASH (Pty) Ltd · Bank: FNB · Account: 62000000000 · Branch: 250655',
};

@Injectable()
export class SettingsService {
  private cache: { value: PlatformSettings; at: number } | null = null;

  constructor(@InjectDb() private db: Db) {}

  async get(conn: DbOrTx = this.db): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.value;
    const rows = await conn.select().from(platformSettings);
    const value = { ...DEFAULT_SETTINGS } as any;
    for (const r of rows) if (r.key in DEFAULT_SETTINGS) value[r.key] = r.value;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
      await this.db
        .insert(platformSettings)
        .values({ key, value: value as any })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: value as any, updatedAt: new Date() } });
    }
    this.cache = null;
    return this.get();
  }
}
