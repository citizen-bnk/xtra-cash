// Real HTTP and PostgreSQL semantics, using an isolated in-memory database.
require('reflect-metadata');
const assert=require('node:assert/strict'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite'),{readMigrationFiles}=require('drizzle-orm/migrator');
const {Test}=require('@nestjs/testing'),request=require('supertest');
process.env.JWT_SECRET='isolated-performance-secret-more-than-32';process.env.RATE_LIMIT_PER_MIN='100000';process.env.DEMO_MODE='false';
const schema=require('../dist/db/schema'),{AppModule}=require('../dist/app.module'),{configureApp}=require('../dist/setup'),{AuthService}=require('../dist/auth/auth.service');
(async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema});for (const migration of readMigrationFiles({ migrationsFolder: path.join(__dirname, '../drizzle') })) {
   for (const statement of migration.sql) if (statement.trim()) await pg.exec(statement);
 }
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider('DB_BUNDLE').useValue({db,pool:{query:(...args)=>pg.query(...args),end:()=>pg.close()}}).compile();
 const app=module.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');
 try{
  const users=await db.insert(schema.users).values(['LENDER','LENDER','CONSUMER','ADMIN'].map((role,i)=>({email:`perf${i}@example.test`,firstName:'Test',lastName:'Account',roles:[role],referralCode:`PERF${i}`}))).returning();
  const orgs=await db.insert(schema.lenderOrgs).values(users.slice(0,2).map((u,i)=>({ownerUserId:u.id,name:`Test lender ${i}`,contactEmail:u.email,contactPhone:'+27820000000',availableCents:100000,accreditationStatus:'ACCREDITED',ncrNumber:'NCRCP-TEST-'+i}))).returning();
  // These fixtures represent existing accredited lenders from before fee commitments were introduced.
  await pg.query('UPDATE lender_orgs SET fee_commitment_required=false WHERE id=ANY($1::text[])', [orgs.map(org => org.id)]);
  const headers=await Promise.all(users.map(async u=>({Authorization:`Bearer ${(await app.get(AuthService).issueTokens(u)).accessToken}`})));
  const http=()=>request(app.getHttpServer());
  await http().get('/lender/performance').expect(401);await http().get('/lender/performance').set(headers[2]).expect(403);
  assert.equal((await http().get('/lender/performance').set(headers[1]).expect(200)).body.totals.fundedLoans,0);
  for(const [i,product] of ['BNPL','PERSONAL','BUSINESS','BNPL'].entries()){
   const lenderId=orgs[i===3?1:0].id;
   const [offer]=await db.insert(schema.loanOffers).values({lenderId,name:`Fixture ${product}`,productType:product,monthlyInterestRateBps:200,termMonths:2,maxAmountPerUserCents:100000}).returning();
   const [loan]=await db.insert(schema.loans).values({userId:users[2].id,lenderId,offerId:offer.id,principalCents:100000,totalRepayableCents:120000,outstandingCents:100000,monthlyInterestRateBps:200,termMonths:2,initiationFeeCents:0,monthlyServiceFeeCents:0,createdAt:new Date(Date.now()-86400000)}).returning();
   await db.insert(schema.installments).values({loanId:loan.id,seq:1,dueDate:new Date(Date.now()+30*86400000),amountCents:120000});
   await db.insert(schema.repayments).values({loanId:loan.id,amountCents:10000,lenderShareCents:9500,platformShareCents:500,method:'ISOLATED'});
  }
  const [application] = await db.insert(schema.personalLoanApplications).values({
   userId: users[2].id, amountCents: 100000, termMonths: 3, purpose: 'Other',
   monthlyIncomeCents: 200000, monthlyExpensesCents: 150000, idempotencyKey: 'isolated-one-off-offer', consentAt: new Date(),
  }).returning();
  const { loanCompetitions } = require('../dist/personal-loans/lender-ai.schema');
  await db.insert(loanCompetitions).values({ applicationId: application.id, releasedBy: users[2].id, authorityReference: 'APPLICANT_SUBMISSION' });
  const lenderNotice = (await http().get('/loan-operations/notifications').set(headers[0]).expect(200)).body.notifications
   .find(item => item.kind === 'ACTIVITY' && item.title === 'New loan request');
  assert.ok(lenderNotice.url.endsWith('/lender/applications/' + application.id));
  await http().post('/loan-operations/notifications/read').set(headers[0]).send({key:lenderNotice.key}).expect(201);
  assert.ok((await http().get('/loan-operations/notifications').set(headers[0]).expect(200)).body.notifications.find(item => item.key === lenderNotice.key).read);
  const sendOffer = '/loan-operations/applications/' + application.id + '/offer';
  const offerList = '/loan-operations/competitions/' + application.id + '/offers';
  const pricing = { amountCents: 100000, termMonths: 3, monthlyInterestRateBps: 0, initiationFeeCents: 0, monthlyServiceFeeCents: 0 };
  await http().post(sendOffer).set(headers[2]).send(pricing).expect(403);
  await http().post(sendOffer).set(headers[0]).send({ ...pricing, termMonths: 4 }).expect(409);
  const first = (await http().post(sendOffer).set(headers[0]).send(pricing).expect(201)).body;
  const current = (await http().post(sendOffer).set(headers[0]).send({ ...pricing, initiationFeeCents: 1000 }).expect(201)).body;
  assert.notEqual(first.id, current.id);
  const offers = (await http().get(offerList).set(headers[2]).expect(200)).body;
  assert.equal(offers.length, 1);
  assert.equal(offers[0].id, current.id);
  assert.equal(offers[0].totalRepayableCents, 101000);
  const notices = (await http().get('/loan-operations/notifications').set(headers[2]).expect(200)).body;
  assert.ok(notices.notifications.some(notice => notice.title === 'Your loan offer is ready'));
  await http().post(offerList + '/' + first.id + '/select').set(headers[2]).send({}).expect(409);
  const pendingIdentity = await http().post(offerList + '/' + current.id + '/select').set(headers[2]).send({}).expect(409);
  assert.match(pendingIdentity.body.message, /verification/i);
  assert.equal((await db.query.personalLoanApplications.findFirst()).lenderId, null);
  const { eq } = require('drizzle-orm');
  const borrowerId = users[2].id;
  const profile = { monthlyIncomeCents: 10000000, monthlyExpensesCents: 1000000 };
  await db.update(schema.users).set({ profileComplete: true }).where(eq(schema.users.id, borrowerId));
  await db.update(schema.personalLoanApplications).set(profile).where(eq(schema.personalLoanApplications.id, application.id));
  await db.insert(schema.kycProfiles).values({
   userId: borrowerId, idNumber: 'isolated-id', dateOfBirth: new Date('1993-01-01T00:00:00Z'),
   province: 'Gauteng', employmentStatus: 'EMPLOYED_FULL_TIME', consentAt: new Date(), status: 'VERIFIED', ...profile,
  });
  await db.insert(schema.personalVerifications).values({
   userId: borrowerId, identityType: 'ID', identityNumber: 'isolated-id', mobile: '+27820000000',
   address: 'Isolated address', identityFileKey: 'isolated-id.jpg', addressFileKey: 'isolated-address.jpg',
   consentAt: new Date(), status: 'VERIFIED',
  });
  await http().post(offerList + '/' + current.id + '/select').set(headers[2]).send({}).expect(201);
  assert.equal((await db.query.personalLoanApplications.findFirst()).status, 'OFFERED');
  console.log('PASS: offer without evidence or product, borrower notification, old-quote rejection, verification gate, and agreement preparation.');
  const before=await db.query.loans.findMany();
  const response=await http().get(`/lender/performance?lenderId=${orgs[1].id}`).set(headers[0]).expect(200);
  assert.match(response.headers['cache-control'],/private, no-store/);
  assert.equal(response.body.totals.fundedLoans,3);assert.equal(response.body.totals.advancedCents,300000);assert.equal(response.body.totals.netReceivedCents,28500);
  assert(response.body.totals.estimatedAccruedMicros>0);assert.equal(response.body.models.find(m=>m.product==='BUSINESS').fundedLoans,1);
  const filtered=(await http().get('/lender/loans?product=BUSINESS').set(headers[0]).expect(200)).body;assert.equal(filtered.total,1);assert.equal(filtered.items[0].lenderId,orgs[0].id);
  await http().get('/lender/loans?product=INVALID').set(headers[0]).expect(400);
  assert.deepEqual(await db.query.loans.findMany(),before);
  console.log('PASS: lender performance authentication, role enforcement, tenant isolation, four product groups, actual net receipts, read-only snapshot, empty book and filtered loan links.');
  process.env.PERSONAL_AGREEMENTS_ENABLED = 'true';
  process.env.WALLET_DEPOSIT_BANK_DETAILS = 'Isolated settlement account';
  const password = 'Fixture-only-password-123';
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAABACAAAAADQNvZiAAAA7ElEQVR4nO3ZkQLCAABF0cfjOI7jOI7HcRzHcRzHcTwej8d9Qp9xoMdHrt9k2Gx3+8PxNJ4v19v98Xy9P9O8rN8/gegADdEBGqIDNEQHaIgO0BAdoCE6QEN0gIboAA3RARqiAzREB2iIDtAQHaAhOkBDdIAGHqAhOkBDdICG6AAN0QEaogM0RAdw4AEYogM0dIzoAA0dIzpAQ8eIDtDQMaIDNHSM6AANHSM6QEPHiA7Q0DGiAzTwAA0dIzpAQ8eIDtDQMaIDOPAADB0jOkBDx4gO0NAxogM0dIzoAA0dIzpAQ8eIDtDQMaIDNPwA0H3+YhQmS8UAAAAASUVORK5CYII=';
  await db.update(schema.users).set({passwordHash:await require('bcryptjs').hash(password,4)}).where(eq(schema.users.id,borrowerId));
  const applicationUrl = '/personal-loans/applications/' + application.id;
  const agreement = (await http().get(applicationUrl).set(headers[2]).expect(200)).body.agreement;
  assert.equal((await http().get('/me/signature').set(headers[0]).expect(200)).body.signature,null);
  await http().post(applicationUrl + '/accept').set(headers[2]).send({digest:agreement.digest,acknowledged:true,password,signature}).expect(201);
  assert.equal((await http().get('/me/signature').set(headers[2]).expect(200)).body.signature,signature);
  const accepted = (await http().get('/loan-operations/notifications').set(headers[0]).expect(200)).body.notifications;
  assert.ok(accepted.some(item => item.title === 'Applicant signed your loan agreement'));
  await http().post(applicationUrl + '/external-payment').set(headers[3]).send({confirmed:true,note:'Confirmed test bank receipt'}).expect(201);
  const deposits = '/me/wallet/deposits';
  const deposit = (await http().post(deposits).set(headers[2]).send({amountCents:5000,clientKey:'test-deposit-key'}).expect(201)).body;
  const confirmationUrl = '/money/wallet/deposits/' + deposit.id + '/decision';
  const confirmation={action:'CONFIRM',note:'Reconciled bank statement',bankReference:'isolated-bank-receipt'};
  await http().post(confirmationUrl).set(headers[3]).send(confirmation).expect(201);
  await http().post(confirmationUrl).set(headers[3]).send(confirmation).expect(201);
  assert.equal((await http().get(deposits).set(headers[2]).expect(200)).body.walletCents,105000);
  assert.ok((await pg.query("select count(*)::int as n from notification_deliveries where channel='EMAIL'")).rows[0].n >= 8);
  console.log('PASS: submission and signing alerts, saved signature, confirmed lender funding, and wallet top-up without double credit.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

