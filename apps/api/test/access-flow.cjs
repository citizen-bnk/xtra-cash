// Cryptographic WebAuthn and real HTTP tests, isolated from all deployed databases.
require('reflect-metadata');
const assert = require('node:assert/strict'), path = require('node:path'), crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite'), { drizzle } = require('drizzle-orm/pglite'), { migrate } = require('drizzle-orm/pglite/migrator');
const { eq } = require('drizzle-orm'), { Test } = require('@nestjs/testing'), request = require('supertest');
process.env.JWT_SECRET = 'isolated-auth-test-secret-more-than-32';
process.env.RATE_LIMIT_PER_MIN = '100000'; process.env.DEMO_MODE = 'false';
const schema = require('../dist/db/schema'), { AppModule } = require('../dist/app.module'), { configureApp } = require('../dist/setup');
const { decryptIdentity } = require('../dist/auth/identity-crypto');
const b64 = b => Buffer.from(b).toString('base64url'), sha = b => crypto.createHash('sha256').update(b).digest();
// Minimal CBOR encoder for a standards-compliant test authenticator.
function cbor(v) {
  const head = (major, n) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof v === 'number') return head(v < 0 ? 1 : 0, v < 0 ? -v - 1 : v);
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...Array.from(v, ([k, x]) => Buffer.concat([cbor(k), cbor(x)]))]);
  throw Error('Unsupported CBOR fixture');
}
async function main() {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider('DB_BUNDLE').useValue({ db, pool: { end: () => pg.close() } }).compile();
  const app = module.createNestApplication({ rawBody: true, logger: false }); configureApp(app); await app.init(); await app.listen(0, '127.0.0.1');
  const http = () => request(app.getHttpServer()), bearer = token => ({ Authorization: `Bearer ${token}` });
  try {
    const input = { identifier: 'isolated@example.test', password: 'Private-Test-Only-1234', accountType: 'CONSUMER', consent: true };
    await http().post('/auth/quick-register').send({ ...input, consent: false }).expect(400);
    await http().post('/auth/quick-register').send({ ...input, identifier: 'bad-number' }).expect(400);
    const account = (await http().post('/auth/quick-register').send(input).expect(201)).body;
    assert.equal(account.user.profileComplete, false); assert.equal(account.user.firstName, '');
    await http().get('/me/balance').set(bearer(account.accessToken)).expect(200); // Browse immediately.
    await http().post('/me/wallet/topup').set(bearer(account.accessToken)).send({ amountCents: 1000 }).expect(403); // Service requires names.
    await http().put('/auth/passwordless/profile').set(bearer(account.accessToken)).send({ firstName: 'Test', lastName: 'Applicant' }).expect(200);
    const other = (await http().post('/auth/quick-register').send({ ...input, identifier: 'other@example.test' }).expect(201)).body;
    const draft = { amount: 300000, term: 3, purpose: 'Education', income: 1200000, expenses: 400000, address: '123 Isolated Test Road' };
    await http().put('/me/service-profile/draft').set(bearer(account.accessToken)).send({ answers: draft }).expect(200);
    const stored = await db.query.serviceDrafts.findFirst(); assert(!stored.encrypted.includes('Education')); assert.equal(JSON.parse(decryptIdentity(stored.encrypted)).purpose, 'Education');
    assert.equal((await http().get('/me/service-profile').set(bearer(account.accessToken)).expect(200)).body.draft.income, draft.income);
    assert.deepEqual((await http().get('/me/service-profile').set(bearer(other.accessToken)).expect(200)).body.draft, {});
    await http().put('/me/service-profile/draft').set(bearer(account.accessToken)).send({ answers: { income: -1 } }).expect(400);
    const origin = 'http://localhost:3000';
    await http().post('/auth/passkeys/login/options').send({ origin: 'https://evil.example' }).expect(400);
    const challenge = (await http().post('/auth/passkeys/register/options').set(bearer(account.accessToken)).send({ origin }).expect(201)).body;
    assert.equal(challenge.options.authenticatorSelection.userVerification, 'required');
    const keypair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = keypair.publicKey.export({ format: 'jwk' }), cred = crypto.randomBytes(32);
    const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
    const authData = Buffer.concat([sha('localhost'), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), Buffer.from([0, cred.length]), cred, cose]);
    const response = { id: b64(cred), rawId: b64(cred), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(JSON.stringify({ type: 'webauthn.create', challenge: challenge.options.challenge, origin })), attestationObject: b64(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))), transports: ['internal'] } };
    const finish = { origin, challengeId: challenge.challengeId, binding: challenge.binding, response };
    await http().post('/auth/passkeys/register/verify').set(bearer(other.accessToken)).send(finish).expect(401);
    await http().post('/auth/passkeys/register/verify').set(bearer(account.accessToken)).send(finish).expect(201);
    await http().post('/auth/passkeys/register/verify').set(bearer(account.accessToken)).send(finish).expect(401);
    const assertion = async (counter, flags = 5) => {
      const c = (await http().post('/auth/passkeys/login/options').send({ origin }).expect(201)).body;
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: c.options.challenge, origin }));
      const count = Buffer.alloc(4); count.writeUInt32BE(counter);
      const data = Buffer.concat([sha('localhost'), Buffer.from([flags]), count]);
      return { origin, challengeId: c.challengeId, binding: c.binding, response: { id: b64(cred), rawId: b64(cred), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientData), authenticatorData: b64(data), signature: b64(crypto.sign('sha256', Buffer.concat([data, sha(clientData)]), keypair.privateKey)), userHandle: b64(account.user.id) } } };
    };
    await http().post('/auth/passkeys/login/verify').send(await assertion(1, 1)).expect(401); // User verification REQUIRED.
    const signed = await assertion(1);
    const login = (await http().post('/auth/passkeys/login/verify').send(signed).expect(201)).body;
    assert.equal(login.user.id, account.user.id);
    await http().post('/auth/passkeys/login/verify').send(signed).expect(401); // Replay.
    await http().post('/auth/passkeys/login/verify').send(await assertion(1)).expect(401); // Counter clone/replay.
    const refreshed = await Promise.all([http().post('/auth/refresh').send({ refreshToken: login.refreshToken }).expect(200), http().post('/auth/refresh').send({ refreshToken: login.refreshToken }).expect(200)]);
    assert.equal(refreshed[0].body.refreshToken, refreshed[1].body.refreshToken);
    await http().get('/me').set(bearer(login.accessToken)).expect(401);
    await http().get('/me').set(bearer(refreshed[0].body.accessToken)).expect(200);
    await http().post('/auth/logout').send({ refreshToken: refreshed[0].body.refreshToken }).expect(200);
    await http().get('/me').set(bearer(refreshed[0].body.accessToken)).expect(401);
    await db.update(schema.users).set({ status: 'SUSPENDED' }).where(eq(schema.users.id, account.user.id));
    await http().post('/auth/passkeys/login/verify').send(await assertion(2)).expect(401);
    const lender = (await http().post('/auth/quick-register').send({ ...input, identifier: 'lender@example.test', accountType: 'LENDER' }).expect(201)).body;
    await http().put('/auth/passwordless/profile').set(bearer(lender.accessToken)).send({ firstName: 'Test', lastName: 'Lender', lenderName: 'Test Lending' }).expect(200);
    assert.equal((await db.query.lenderOrgs.findFirst({ where: eq(schema.lenderOrgs.ownerUserId, lender.user.id) })).name, 'Test Lending');
    console.log('PASS: quick registration, on-demand profile gates, encrypted/reusable drafts, signed WebAuthn enrollment/login, UV enforcement, ownership, challenge/counter replay, refresh concurrency, revoked sessions, suspension and lender profile completion.');
  } finally { await app.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
