// Real HTTP and PostgreSQL semantics, using an isolated in-memory database.
require('reflect-metadata');
const assert=require('node:assert/strict'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite'),{migrate}=require('drizzle-orm/pglite/migrator');
const {Test}=require('@nestjs/testing'),request=require('supertest');
process.env.JWT_SECRET='isolated-performance-secret-more-than-32';process.env.RATE_LIMIT_PER_MIN='100000';process.env.DEMO_MODE='false';
const schema=require('../dist/db/schema'),{AppModule}=require('../dist/app.module'),{configureApp}=require('../dist/setup'),{AuthService}=require('../dist/auth/auth.service');
(async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:path.join(__dirname,'../drizzle')});
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider('DB_BUNDLE').useValue({db,pool:{end:()=>pg.close()}}).compile();
 const app=module.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');
 try{
  const users=await db.insert(schema.users).values(['LENDER','LENDER','CONSUMER'].map((role,i)=>({email:`perf${i}@example.test`,firstName:'Test',lastName:'Account',roles:[role],referralCode:`PERF${i}`}))).returning();
  const orgs=await db.insert(schema.lenderOrgs).values(users.slice(0,2).map((u,i)=>({ownerUserId:u.id,name:`Test lender ${i}`,contactEmail:u.email,contactPhone:'+27820000000',availableCents:100000}))).returning();
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
  const before=await db.query.loans.findMany();
  const response=await http().get(`/lender/performance?lenderId=${orgs[1].id}`).set(headers[0]).expect(200);
  assert.match(response.headers['cache-control'],/private, no-store/);
  assert.equal(response.body.totals.fundedLoans,3);assert.equal(response.body.totals.advancedCents,300000);assert.equal(response.body.totals.netReceivedCents,28500);
  assert(response.body.totals.estimatedAccruedMicros>0);assert.equal(response.body.models.find(m=>m.product==='BUSINESS').fundedLoans,1);
  const filtered=(await http().get('/lender/loans?product=BUSINESS').set(headers[0]).expect(200)).body;assert.equal(filtered.total,1);assert.equal(filtered.items[0].lenderId,orgs[0].id);
  await http().get('/lender/loans?product=INVALID').set(headers[0]).expect(400);
  assert.deepEqual(await db.query.loans.findMany(),before);
  console.log('PASS: lender performance authentication, role enforcement, tenant isolation, four product groups, actual net receipts, read-only snapshot, empty book and filtered loan links.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

