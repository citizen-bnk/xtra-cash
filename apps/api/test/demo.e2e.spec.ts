/**
 * Hosted demo sign-in against explicitly seeded local fixtures.
 * Requires an isolated Postgres test database — uses TEST_DATABASE_URL.
 */
import 'reflect-metadata';
import path from 'path';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/xtracash_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.CARD_NETWORK_SECRET = 'net-secret';
process.env.RATE_LIMIT_PER_MIN = '100000';
// Hosted demo access requires explicit opt-in and pre-existing sample fixtures.
process.env.NODE_ENV = 'production';
delete process.env.ENABLE_SIMULATION;
process.env.ENABLE_DEMO_LOGIN = 'true';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { DB } from '../src/common/db.module';
import type { Db } from '../src/db/client';
import { buildDemoData, DEMO_LOGIN_STAFF } from '../src/db/demo-data';

let app: INestApplication;
const http = () => request(app.getHttpServer());

const EXPECTED: Record<string, string> = {
  'shopper-salaried': 'naledi@example.com',
  'shopper-gig': 'sipho@example.com',
  'shopper-student': 'ayanda@example.com',
  'shopper-kyc': 'kagiso@example.com',
  'lender-accredited': 'lindiwe@kasicapital.co.za',
  'lender-assisted': 'bongani@ubuntucredit.co.za',
  'lender-pending': 'fatima@mzansiquick.co.za',
  affiliate: 'thabo.affiliate@example.com',
};

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  const db = app.get<Db>(DB);
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  const t = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname='public'`);
  await db.execute(sql.raw(`TRUNCATE ${t.rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`));
  await buildDemoData(app, DEMO_LOGIN_STAFF);
}, 120_000);

afterAll(async () => {
  delete process.env.ENABLE_DEMO_LOGIN;
  await app?.close();
});

describe('one-click demo sign-in', () => {
  it('lists the demo roles without exposing any login details', async () => {
    const r = await http().get('/auth/demo').expect(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.personas.map((p: any) => p.key).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(JSON.stringify(r.body)).not.toMatch(/@|Passw0rd|Admin@/);
    expect(r.body.personas.filter((p: any) => p.app === 'admin')).toHaveLength(0);
  });

  it('signs into existing sample accounts with simultaneous clicks', async () => {
    const [a, b] = await Promise.all([
      http().post('/auth/demo/login').send({ persona: 'lender-accredited' }),
      http().post('/auth/demo/login').send({ persona: 'shopper-salaried' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.user.email).toBe('lindiwe@kasicapital.co.za');
    expect(a.body.user.roles).toContain('LENDER');
    expect(a.body.user.passwordHash).toBeUndefined();

    // A public sample session must not grant access to the back-office dashboard.
    await http().get('/admin/stats').set({ Authorization: `Bearer ${a.body.accessToken}` }).expect(403);
    const bal = await http().get('/me/balance').set({ Authorization: `Bearer ${b.body.accessToken}` }).expect(200);
    expect(bal.body).toBeDefined();
  }, 120_000);

  it('signs every role in to its own account', async () => {
    for (const [persona, email] of Object.entries(EXPECTED)) {
      const r = await http().post('/auth/demo/login').send({ persona }).expect(200);
      expect(r.body.user.email).toBe(email);
    }
  });

  it('rejects unknown roles and stays off when switched off', async () => {
    await http().post('/auth/demo/login').send({ persona: 'nope' }).expect(404);
    await http().post('/auth/demo/login').send({ persona: 'staff-superadmin' }).expect(404);
    await http().post('/auth/demo/login').send({}).expect(400);
    process.env.ENABLE_DEMO_LOGIN = 'false';
    const r = await http().get('/auth/demo').expect(200);
    expect(r.body).toEqual({ enabled: false, personas: [] });
    await http().post('/auth/demo/login').send({ persona: 'shopper-salaried' }).expect(404);
    delete process.env.ENABLE_DEMO_LOGIN;
  });
});
