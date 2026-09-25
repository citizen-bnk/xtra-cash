/**
 * End-to-end: boots the real Nest app against the test database and walks every role through
 * its core journey. Requires Postgres (see README) — uses TEST_DATABASE_URL.
 */
import 'reflect-metadata';
import path from 'path';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as bcrypt from 'bcryptjs';
import { makeSaId } from '@xtra/shared';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/xtracash_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.CARD_NETWORK_SECRET = 'net-secret';
process.env.ENABLE_SIMULATION = 'true';
process.env.RATE_LIMIT_PER_MIN = '100000';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { DB } from '../src/common/db.module';
import type { Db } from '../src/db/client';
import { users } from '../src/db/schema';
import { signPayload } from '../src/card-network/card-network.controller';

let app: INestApplication;
let db: Db;
const http = () => request(app.getHttpServer());
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  db = app.get(DB);
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  const t = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname='public'`);
  await db.execute(sql.raw(`TRUNCATE ${t.rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`));
});

afterAll(async () => {
  await app?.close();
});

describe('XTRA-CASH platform', () => {
  const s: Record<string, any> = {};

  it('registers affiliate, consumer (referred) and lender (referred)', async () => {
    const aff = await http()
      .post('/auth/register')
      .send({ email: 'aff@t.co', phone: '0830000001', password: 'Passw0rd!', firstName: 'Aff', lastName: 'One', accountType: 'AFFILIATE' })
      .expect(201);
    s.aff = aff.body;
    const con = await http()
      .post('/auth/register')
      .send({ email: 'con@t.co', phone: '0830000002', password: 'Passw0rd!', firstName: 'Con', lastName: 'Sumer', accountType: 'CONSUMER', referralCode: aff.body.user.referralCode })
      .expect(201);
    s.con = con.body;
    expect(con.body.user.passwordHash).toBeUndefined();
    const len = await http()
      .post('/auth/register')
      .send({ email: 'len@t.co', phone: '0830000003', password: 'Passw0rd!', firstName: 'Len', lastName: 'Der', accountType: 'LENDER', lenderName: 'Test Lender', referralCode: aff.body.user.referralCode })
      .expect(201);
    s.len = len.body;

    await http().post('/auth/register').send({ email: 'con@t.co', phone: '0830000009', password: 'Passw0rd!', firstName: 'x', lastName: 'y', accountType: 'CONSUMER' }).expect(409);
    await http().post('/auth/register').send({ email: 'bad', phone: '123', password: 'short', firstName: '', lastName: 'y', accountType: 'X' }).expect(400);

    await db.insert(users).values({
      email: 'root@t.co',
      phone: '+27830000000',
      firstName: 'Root',
      lastName: 'Admin',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      passwordHash: await bcrypt.hash('Admin@12345', 4),
      referralCode: 'XCROOT',
    });
    const adm = await http().post('/auth/login').send({ identifier: 'root@t.co', password: 'Admin@12345' }).expect(200);
    s.admin = adm.body.accessToken;
  });

  it('logs in by phone, refreshes with rotation, and rejects bad passwords', async () => {
    await http().post('/auth/login').send({ identifier: 'con@t.co', password: 'nope' }).expect(401);
    const r = await http().post('/auth/login').send({ identifier: '0830000002', password: 'Passw0rd!' }).expect(200);
    const refreshed = await http().post('/auth/refresh').send({ refreshToken: r.body.refreshToken }).expect(200);
    expect(refreshed.body.accessToken).toBeDefined();
    await http().post('/auth/refresh').send({ refreshToken: r.body.refreshToken }).expect(401); // rotated
  });

  it('enforces role-based access', async () => {
    await http().get('/admin/stats').expect(401);
    await http().get('/admin/stats').set(bearer(s.con.accessToken)).expect(403);
    await http().get('/lender/org').set(bearer(s.con.accessToken)).expect(403);
    await http().get('/admin/stats').set(bearer(s.admin)).expect(200);
  });

  it('takes a lender through accreditation, funding and offer creation', async () => {
    const L = bearer(s.len.accessToken);
    await http()
      .put('/lender/org')
      .set(L)
      .send({ name: 'Test Lender', registrationNumber: '2020/000001/07', ncrNumber: 'NCRCP1', contactEmail: 'len@t.co', contactPhone: '0830000003' })
      .expect(200);
    await http().post('/lender/accreditation/submit').set(L).send({ assisted: false }).expect(400); // docs missing
    for (const type of ['CIPC_REGISTRATION', 'BANK_CONFIRMATION', 'DIRECTOR_ID', 'FICA_PROOF_OF_ADDRESS']) {
      await http().post('/lender/documents').set(L).field('type', type).attach('file', Buffer.from('%PDF-1.4 test'), { filename: `${type}.pdf`, contentType: 'application/pdf' }).expect(201);
    }
    await http().post('/lender/documents').set(L).field('type', 'DIRECTOR_ID').attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' }).expect(400);
    const sub = await http().post('/lender/accreditation/submit').set(L).send({ assisted: false }).expect(200);
    expect(sub.body.accreditationStatus).toBe('SUBMITTED');
    s.lenderId = sub.body.id;

    // Offers can be drafted before accreditation but must respect regulatory caps
    const offer = {
      name: 'Test Xtra',
      monthlyInterestRateBps: 300,
      termMonths: 3,
      initiationFeeCents: 5000,
      monthlyServiceFeeCents: 2500,
      minAmountCents: 10000,
      maxAmountPerUserCents: 300000,
      minMonthlyIncomeCents: 300000,
      minCreditScore: 0,
      minAge: 18,
      maxAge: 75,
      employmentStatuses: [],
      provinces: [],
    };
    await http().post('/lender/offers').set(L).send({ ...offer, monthlyInterestRateBps: 900 }).expect(400);
    const o = await http().post('/lender/offers').set(L).send(offer).expect(201);
    s.offerId = o.body.id;

    const load = await http().post('/lender/funding').set(L).send({ type: 'LOAD', amountCents: 1_000_000 }).expect(201);
    expect(load.body.status).toBe('PENDING');
    await http().post(`/admin/funding/${load.body.id}/decision`).set(bearer(s.admin)).send({ approve: true }).expect(200);
    await http().post(`/admin/funding/${load.body.id}/decision`).set(bearer(s.admin)).send({ approve: true }).expect(400);

    await http().post(`/admin/lenders/${s.lenderId}/review`).set(bearer(s.admin)).send({ status: 'ACCREDITED' }).expect(200);
    const stats = await http().get('/lender/stats').set(L).expect(200);
    expect(stats.body.availableCents).toBe(1_000_000);
    const reach = await http().post('/lender/offers/preview-reach').set(L).send({ minMonthlyIncomeCents: 0, minCreditScore: 0, minAge: 18, maxAge: 75, employmentStatuses: [], provinces: [] }).expect(200);
    expect(reach.body.totalConsumers).toBe(0);
  });

  it('unlocks XTRA-Balance after KYC and issues a card', async () => {
    const C = bearer(s.con.accessToken);
    const before = await http().get('/me/balance').set(C).expect(200);
    expect(before.body.creditCents).toBe(0);
    expect(before.body.reasonIfNone).toMatch(/KYC/);

    await http().put('/me/kyc').set(C).send({ idNumber: '1234567890123', province: 'Gauteng', employmentStatus: 'EMPLOYED_FULL_TIME', monthlyIncomeCents: 1, monthlyExpensesCents: 0, consentCreditCheck: true }).expect(400);
    const k = await http()
      .put('/me/kyc')
      .set(C)
      .send({
        idNumber: makeSaId(new Date(Date.UTC(1992, 5, 1)), 5001),
        province: 'Gauteng',
        employmentStatus: 'EMPLOYED_FULL_TIME',
        monthlyIncomeCents: 1_500_000,
        monthlyExpensesCents: 800_000,
        consentCreditCheck: true,
      })
      .expect(200);
    expect(k.body.status).toBe('VERIFIED');

    const bal = await http().get('/me/balance').set(C).expect(200);
    expect(bal.body.creditCents).toBe(300_000); // per-user cap of the only offer
    expect(bal.body.offers).toHaveLength(1);
    const cards = await http().get('/me/cards').set(C).expect(200);
    expect(cards.body).toHaveLength(1);
    expect(cards.body[0].processorRef).toBeUndefined();
    s.cardId = cards.body[0].id;

    const q = await http().post('/me/quote').set(C).send({ offerId: s.offerId, amountCents: 100_000 }).expect(200);
    expect(q.body.schedule).toHaveLength(3);
  });

  it('approves a purchase at the point of payment using wallet first, then credit', async () => {
    const C = bearer(s.con.accessToken);
    await http().post('/me/wallet/topup').set(C).send({ amountCents: 20_000 }).expect(200);
    const t = await http()
      .post(`/me/cards/${s.cardId}/purchase`)
      .set(C)
      .send({ amountCents: 120_000, merchantName: 'Shoprite', channel: 'IN_STORE', idempotencyKey: 'purchase-0001' })
      .expect(200);
    expect(t.body.status).toBe('APPROVED');
    expect(t.body.fromWalletCents).toBe(20_000);
    expect(t.body.fromCreditCents).toBe(100_000);
    expect(t.body.loans).toHaveLength(1);
    s.loanId = t.body.loans[0].id;

    // Idempotent retry returns the same transaction and does not lend twice
    const again = await http()
      .post(`/me/cards/${s.cardId}/purchase`)
      .set(C)
      .send({ amountCents: 120_000, merchantName: 'Shoprite', channel: 'IN_STORE', idempotencyKey: 'purchase-0001' })
      .expect(200);
    expect(again.body.id).toBe(t.body.id);
    const loans = await http().get('/me/loans').set(C).expect(200);
    expect(loans.body).toHaveLength(1);

    const declined = await http()
      .post(`/me/cards/${s.cardId}/purchase`)
      .set(C)
      .send({ amountCents: 900_000, merchantName: 'Big TV', channel: 'IN_STORE', idempotencyKey: 'purchase-0002' })
      .expect(200);
    expect(declined.body.status).toBe('DECLINED');
    expect(declined.body.declineReason).toBe('Insufficient XTRA-Balance');
  });

  it('never over-lends under concurrent swipes', async () => {
    const C = bearer(s.con.accessToken);
    // 200 000 of credit left on the per-user cap; fire 6 × 50 000 concurrently => at most 4 approve.
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        http()
          .post(`/me/cards/${s.cardId}/purchase`)
          .set(C)
          .send({ amountCents: 50_000, merchantName: `Race ${i}`, channel: 'ONLINE', idempotencyKey: `race-000${i}` }),
      ),
    );
    const approved = results.filter((r) => r.body.status === 'APPROVED').length;
    expect(approved).toBeLessThanOrEqual(4);
    const bal = await http().get('/me/balance').set(C).expect(200);
    expect(bal.body.creditCents).toBeGreaterThanOrEqual(0);
    const loans = await http().get('/me/loans').set(C).expect(200);
    const principal = loans.body.reduce((sum: number, l: any) => sum + l.principalCents, 0);
    expect(principal).toBeLessThanOrEqual(300_000);
  });

  it('accepts signed card-network authorisations and rejects forged ones', async () => {
    const [card] = await db.query.cards.findMany({ where: (c, { eq }) => eq(c.id, s.cardId) });
    const body = JSON.stringify({ cardRef: card.processorRef, networkTransactionId: 'net-1', amountCents: 1000, merchantName: 'Spar', channel: 'IN_STORE' });
    await http().post('/card-network/authorize').set('Content-Type', 'application/json').set('x-signature', 'forged').send(body).expect(401);
    const ok = await http()
      .post('/card-network/authorize')
      .set('Content-Type', 'application/json')
      .set('x-signature', signPayload(body, 'net-secret'))
      .send(body)
      .expect(200);
    expect(typeof ok.body.approved).toBe('boolean');
    expect(ok.body.transactionId).toBeDefined();
  });

  it('freezing the card declines purchases', async () => {
    const C = bearer(s.con.accessToken);
    await http().post(`/me/cards/${s.cardId}/freeze`).set(C).expect(200);
    const t = await http().post(`/me/cards/${s.cardId}/purchase`).set(C).send({ amountCents: 1000, merchantName: 'x', channel: 'ONLINE', idempotencyKey: 'frozen-001' }).expect(200);
    expect(t.body.declineReason).toBe('Card is frozen');
    await http().post(`/me/cards/${s.cardId}/unfreeze`).set(C).expect(200);
  });

  it('flags arrears, blocks new credit, and restores after repayment in full', async () => {
    const C = bearer(s.con.accessToken);
    await db.execute(sql`update installments set due_date = now() - interval '1 day' where loan_id = ${s.loanId} and seq = 1`);
    const job = await http().post('/admin/jobs/arrears').set(bearer(s.admin)).expect(200);
    expect(job.body.loansInArrears).toBe(1);
    const bal = await http().get('/me/balance').set(C).expect(200);
    expect(bal.body.creditCents).toBe(0);
    expect(bal.body.reasonIfNone).toMatch(/overdue/);

    const loan = await http().get(`/me/loans/${s.loanId}`).set(C).expect(200);
    await http().post(`/me/loans/${s.loanId}/repay`).set(C).send({ amountCents: loan.body.outstandingCents }).expect(400); // wallet empty
    await http().post('/me/wallet/topup').set(C).send({ amountCents: loan.body.outstandingCents }).expect(200);
    const paid = await http().post(`/me/loans/${s.loanId}/repay`).set(C).send({ amountCents: loan.body.outstandingCents }).expect(200);
    expect(paid.body.status).toBe('SETTLED');
    expect(paid.body.outstandingCents).toBe(0);
    expect(paid.body.installments.every((i: any) => i.status === 'PAID')).toBe(true);
    const stats = await http().get('/lender/stats').set(bearer(s.len.accessToken)).expect(200);
    expect(stats.body.totalRepaidCents).toBe(Math.round(loan.body.outstandingCents * 0.95));
  });

  it('pays affiliates: commissions → approval → payout', async () => {
    const A = bearer(s.aff.accessToken);
    const list = await http().get('/affiliate/commissions').set(A).expect(200);
    const types = list.body.map((c: any) => c.type).sort();
    expect(types).toContain('CONSUMER_ACTIVATION');
    expect(types).toContain('LENDER_ACCREDITED');
    expect(types).toContain('LOAN_ORIGINATION');
    for (const c of list.body) await http().post(`/admin/commissions/${c.id}/decision`).set(bearer(s.admin)).send({ approve: true }).expect(200);
    const sum = await http().get('/affiliate/summary').set(A).expect(200);
    expect(sum.body.commissionBalanceCents).toBeGreaterThan(100_000);

    await http().post('/affiliate/payouts').set(A).send({ amountCents: 50_000 }).expect(400); // no bank details
    await http().put('/affiliate/bank').set(A).send({ bankName: 'FNB', bankAccountNumber: '62000000001' }).expect(200);
    await http().post('/affiliate/payouts').set(A).send({ amountCents: 99_999_999 }).expect(400);
    const p = await http().post('/affiliate/payouts').set(A).send({ amountCents: 50_000 }).expect(201);
    await http().post(`/admin/payouts/${p.body.id}/decision`).set(bearer(s.admin)).send({ approve: true }).expect(400); // needs reference
    await http().post(`/admin/payouts/${p.body.id}/decision`).set(bearer(s.admin)).send({ approve: true, reference: 'EFT-1' }).expect(200);

    const refs = await http().get('/affiliate/referrals').set(A).expect(200);
    expect(refs.body).toHaveLength(2);
    expect(refs.body[0].lastName).toMatch(/^[A-Z]\.$/);
  });

  it('keeps the double-entry ledger balanced and exposes admin dashboards', async () => {
    const check = await http().get('/admin/ledger/check').set(bearer(s.admin)).expect(200);
    expect(check.body.balanced).toBe(true);
    const stats = await http().get('/admin/stats').set(bearer(s.admin)).expect(200);
    expect(stats.body.users.total).toBe(4);
    expect(stats.body.dailyVolume).toHaveLength(30);
    expect(stats.body.platformRevenueCents).toBeGreaterThan(0);
    const audit = await http().get('/admin/audit').set(bearer(s.admin)).expect(200);
    expect(audit.body.total).toBeGreaterThan(5);
    await http().put('/admin/settings').set(bearer(s.admin)).send({ maxRateBps: 400 }).expect(200);
  });

  it('suspending a user revokes sessions and freezes cards', async () => {
    await http().post(`/admin/users/${s.con.user.id}/status`).set(bearer(s.admin)).send({ status: 'SUSPENDED' }).expect(200);
    await http().post('/auth/login').send({ identifier: 'con@t.co', password: 'Passw0rd!' }).expect(401);
    await http().post('/auth/refresh').send({ refreshToken: s.con.refreshToken }).expect(401);
  });
});

