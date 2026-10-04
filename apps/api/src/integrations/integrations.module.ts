import { Global, Module } from '@nestjs/common';
import { MockCreditBureau } from './credit-bureau';
import { MockCardIssuer } from './card-issuer';
import { MockPaymentGateway } from './payments';
import { DatabaseFileStorage } from './storage';
import { DB } from '../common/db.module';
import type { Db } from '../db/client';

export const CREDIT_BUREAU = 'CREDIT_BUREAU';
export const CARD_ISSUER = 'CARD_ISSUER';
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';
export const FILE_STORAGE = 'FILE_STORAGE';

/** Swap the mock classes for real providers here — nothing else in the codebase changes. */
@Global()
@Module({
  providers: [
    { provide: CREDIT_BUREAU, useClass: MockCreditBureau },
    { provide: CARD_ISSUER, useClass: MockCardIssuer },
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
    { provide: FILE_STORAGE, useFactory: (db: Db) => new DatabaseFileStorage(db), inject: [DB] },
  ],
  exports: [CREDIT_BUREAU, CARD_ISSUER, PAYMENT_GATEWAY, FILE_STORAGE],
})
export class IntegrationsModule {}
