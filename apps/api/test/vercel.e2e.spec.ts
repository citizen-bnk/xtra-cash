/**
 * Behaviour the API needs when it runs as Vercel serverless functions: uploads live in the database
 * (no writable disk), and the nightly arrears job is triggered over HTTP by Vercel Cron.
 */
import 'reflect-metadata';
import path from 'path';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/xtracash_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.CARD_NETWORK_SECRET = 'net-secret';
process.env.RATE_LIMIT_PER_MIN = '100000';
process.env.VERCEL = '1';
process.env.CRON_SECRET = 'cron-secret-for-tests';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { DB } from '../src/common/db.module';
import type { Db } from '../src/db/client';
import { storedFiles } from '../src/db/schema';

let app: INestApplication;
let db: Db;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  db = app.get(DB);
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  const t = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname='public'`);
  await db.execute(sql.raw(`TRUNCATE ${t.rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`));
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('running on Vercel', () => {
  it('stores lender documents in the database and serves them back', async () => {
    const reg = await http()
      .post('/auth/register')
      .send({ email: 'vl@t.co', phone: '0830000101', password: 'Passw0rd!', firstName: 'Ve', lastName: 'Lender', accountType: 'LENDER', lenderName: 'Vercel Lending' })
      .expect(201);
    const L = { Authorization: `Bearer ${reg.body.accessToken}` };
    const bytes = Buffer.from('%PDF-1.4 stored in postgres');
    const up = await http().post('/lender/documents').set(L).field('type', 'CIPC_REGISTRATION').attach('file', bytes, { filename: 'cipc.pdf', contentType: 'application/pdf' }).expect(201);

    const rows = await db.select().from(storedFiles);
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].content).equals(bytes)).toBe(true);
    expect(rows[0].sizeBytes).toBe(bytes.length);

    const file = await http().get(`/lender/documents/${up.body.id}/file`).set(L).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(file.body as Buffer, bytes)).toBe(0);
    expect(await db.query.storedFiles.findFirst({ where: eq(storedFiles.key, rows[0].key) })).toBeTruthy();
  });

  it('rejects uploads over 4 MB (Vercel request limit is 4.5 MB)', async () => {
    const reg = await http()
      .post('/auth/register')
      .send({ email: 'vl2@t.co', phone: '0830000102', password: 'Passw0rd!', firstName: 'Ve', lastName: 'Two', accountType: 'LENDER', lenderName: 'Big Files' })
      .expect(201);
    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 1);
    const r = await http().post('/lender/documents').set({ Authorization: `Bearer ${reg.body.accessToken}` }).field('type', 'DIRECTOR_ID').attach('file', big, { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(413);
  });

  it('runs the arrears job for Vercel Cron only with the cron secret', async () => {
    await http().get('/jobs/arrears').expect(401);
    await http().get('/jobs/arrears').set({ Authorization: 'Bearer wrong-secret-for-tests' }).expect(401);
    const ok = await http().get('/jobs/arrears').set({ Authorization: `Bearer ${process.env.CRON_SECRET}` }).expect(200);
    expect(ok.body).toEqual(expect.objectContaining({ overdueInstallments: expect.any(Number), loansInArrears: expect.any(Number) }));
  });

  it('demo sign-in builds the demo world, including its lender documents', async () => {
    const before = (await db.select().from(storedFiles)).length;
    const r = await http().post('/auth/demo/login').send({ persona: 'lender-pending' }).expect(200);
    expect(r.body.user.email).toBe('fatima@mzansiquick.co.za');
    expect((await db.select().from(storedFiles)).length).toBe(before + 10); // 5 documents each for two lenders
  }, 120_000);
});
