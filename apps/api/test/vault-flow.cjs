// Isolated HTTP + PostgreSQL semantics. Never reads or writes a deployed database.
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const { migrate } = require('drizzle-orm/pglite/migrator');
const { eq } = require('drizzle-orm');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
process.env.JWT_SECRET = 'isolated-vault-test-secret-more-than-32-characters';
process.env.IDENTITY_ENCRYPTION_KEY = 'isolated-vault-encryption-key-more-than-32-characters';
process.env.RATE_LIMIT_PER_MIN = '100000';
process.env.DEMO_MODE = 'false';
const schema = require('../dist/db/schema');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/setup');

async function main() {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  await db.insert(schema.platformSettings).values({ key: 'applicantProbationDays', value: 30 });
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider('DB_BUNDLE').useValue({ db, pool: { end: () => pg.close() } }).compile();
  const app = module.createNestApplication({ rawBody: true, logger: false });
  configureApp(app); await app.init();
  const http = () => request(app.getHttpServer());
  try {
    const registration = await http().post('/auth/register').send({ email: 'vault@test.invalid', phone: '0825550101', password: 'Passw0rd!', firstName: 'Vault', lastName: 'Applicant', accountType: 'CONSUMER' }).expect(201);
    const auth = { Authorization: `Bearer ${registration.body.accessToken}` };
    const initial = await http().get('/personal-loans/vault').set(auth).expect(200);
    assert.equal(initial.body.eligible, false); assert.equal(initial.body.probation.daysRemaining, 30);
    const requestBody = { amountCents: 100000, termMonths: 6, purpose: 'Transport', monthlyIncomeCents: 1000000, monthlyExpensesCents: 400000, consent: true, routingConsent: true, idempotencyKey: 'vault-test-application' };
    const blocked = await http().post('/personal-loans/applications').set(auth).send(requestBody).expect(403);
    assert.equal(blocked.body.code, 'VAULT_PROBATION');
    const upload = (type, from, to) => {
      let req = http().post('/personal-loans/vault/documents').set(auth).field('type', type).field('consent', 'true');
      if (from) req = req.field('observedFrom', from).field('observedTo', to);
      return req.attach('file', Buffer.from(`%PDF-1.4 ${type} isolated fixture`), { filename: `${type}.pdf`, contentType: 'application/pdf' });
    };
    await upload('ID_DOCUMENT').expect(201);
    await upload('PROOF_OF_ADDRESS').expect(201);
    await upload('BANK_STATEMENT', '2026-07-01', '2026-10-01').expect(201);
    const ready = await upload('PROOF_OF_INCOME').expect(201);
    assert.equal(ready.body.eligible, true); assert.equal(ready.body.eligibilityBasis, 'FAST_TRACK_EVIDENCE');
    const submitted = await http().post('/personal-loans/applications').set(auth).send(requestBody).expect(201);
    assert.equal(submitted.body.vaultSnapshot.eligibilityBasis, 'FAST_TRACK_EVIDENCE');
    assert.equal(JSON.stringify(submitted.body.vaultSnapshot).includes('latitude'), false);
    await http().put('/personal-loans/vault/location-consent').set(auth).send({ enabled: true }).expect(200);
    const located = await http().post('/personal-loans/vault/location').set(auth).send({ latitude: -26.1076, longitude: 28.0567, accuracyMeters: 30, observedAt: new Date().toISOString(), source: 'FOREGROUND' }).expect(201);
    assert.equal(located.body.pillars.fraud.homeBase.sampleCount, 1);
    const samples = await db.select().from(schema.vaultLocationSamples).where(eq(schema.vaultLocationSamples.userId, registration.body.user.id));
    assert.equal(samples.length, 1); assert(!samples[0].locationEncrypted.includes('-26.1076'));
    assert.equal((await db.select().from(schema.vaultProcessingJobs)).length, 4);
    console.log('PASS: probation gate, four-evidence fast track, durable processing jobs, privacy-limited loan snapshot and encrypted opt-in location sample.');
  } finally { await app.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
