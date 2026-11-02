// Staff, employer and payroll flows run only against an isolated in-memory PostgreSQL database.
require('reflect-metadata');
const assert=require('node:assert/strict'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{drizzle}=require('drizzle-orm/pglite'),{migrate}=require('drizzle-orm/pglite/migrator');
const {Test}=require('@nestjs/testing'),request=require('supertest'),{eq}=require('drizzle-orm');
process.env.JWT_SECRET='isolated-payday-test-secret-more-than-32';process.env.RATE_LIMIT_PER_MIN='100000';
const schema=require('../dist/db/schema'),{AppModule}=require('../dist/app.module'),{configureApp}=require('../dist/setup'),{AuthService}=require('../dist/auth/auth.service');
(async()=>{const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:path.join(__dirname,'../drizzle')});
const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider('DB_BUNDLE').useValue({db,pool:{end:()=>pg.close()}}).compile();
const app=module.createNestApplication({logger:false});configureApp(app);await app.init();const http=()=>request(app.getHttpServer());
try{
 const rows=await db.insert(schema.users).values([['SUPER_ADMIN','AdminA'],['SUPER_ADMIN','AdminB'],['SALES_REP','RepA'],['SALES_REP','RepB'],['CONSUMER','Consumer']].map(([role,name],i)=>({email:`${name}@test.invalid`,firstName:name,lastName:'Test',roles:[role],referralCode:`PDTEST${i}`}))).returning();
 const headers=await Promise.all(rows.map(async u=>({Authorization:`Bearer ${(await app.get(AuthService).issueTokens(u)).accessToken}`})));const [A,B,R,S,C]=headers;
 for(const u of rows.slice(2,4))await db.insert(schema.paydayEmployees).values({userId:u.id,employeeNumber:u.firstName,territory:'Sandton',startDate:'2026-11-01',employmentReference:'test-contract'});
 await http().get('/payday/employers').expect(401);await http().get('/payday/employers').set(C).expect(403);await http().get('/payday/employees').set(R).expect(403);
 const course=(await http().post('/payday/training').set(A).send({title:'Field conduct',content:'Never promise credit approval. Protect employee information.',required:true}).expect(201)).body;
 await http().post(`/payday/employees/${rows[2].id}`).set(A).send({status:'ACTIVE',territory:'Sandton',employmentReference:'test-contract',basicCents:550000,weeklyHours:40}).expect(400);
 for(const H of [R,S]){await http().post('/payday/me/onboarding').set(H).send({acknowledged:true}).expect(200);await http().post(`/payday/training/${course.id}/complete`).set(H).send({revision:1,acknowledged:true}).expect(200);}
 for(const u of rows.slice(2,4))await http().post(`/payday/employees/${u.id}`).set(A).send({status:'ACTIVE',territory:'Sandton',employmentReference:'test-contract',basicCents:550000,weeklyHours:40}).expect(200);
 const payload={clientKey:'lead-once',legalName:'Test Employer',registrationNumber:'2026/123456/07',contactName:'Payroll Test',contactChannel:'payroll@test.invalid',address:'Sandton',headcount:200,permissionReference:'in-person permission recorded',nextAction:'HR meeting',followUpAt:'2026-11-05T07:00:00.000Z'};
 const lead=(await http().post('/payday/employers').set(R).send(payload).expect(201)).body;
 assert.equal((await http().post('/payday/employers').set(R).send(payload).expect(201)).body.id,lead.id);
 await http().post('/payday/employers').set(R).send({...payload,legalName:'changed'}).expect(409);
 await http().post('/payday/employers').set(S).send({...payload,clientKey:'duplicate'}).expect(409);
 assert.equal((await http().get('/payday/employers').set(S).expect(200)).body.total,0);await http().get(`/payday/employers/${lead.id}`).set(S).expect(404);
 await http().post(`/payday/employers/${lead.id}`).set(R).send({version:1,stage:'ACTIVE',nextAction:'Go live',followUpAt:payload.followUpAt}).expect(403);
 const visit={clientKey:'visit-once',employerId:lead.id,outcome:'MEETING',notes:'HR met',nextAction:'Send proposal',followUpAt:payload.followUpAt};
 const v=(await http().post('/payday/visits').set(R).send(visit).expect(201)).body;assert.equal((await http().post('/payday/visits').set(R).send(visit).expect(201)).body.id,v.id);
 await http().post(`/payday/employers/${lead.id}`).set(A).send({version:1,stage:'SIGNED',nextAction:'Payroll',followUpAt:payload.followUpAt}).expect(409);
 await http().post(`/payday/employers/${lead.id}`).set(A).send({version:2,stage:'ACTIVE',nextAction:'Reconcile',followUpAt:payload.followUpAt,agreementReference:'signed-employer',lenderReference:'signed-lender',payrollReference:'payroll-test'}).expect(200);
 const [lender]=await db.insert(schema.lenderOrgs).values({ownerUserId:rows[0].id,name:'Test Lender',contactEmail:'l@test.invalid',contactPhone:'0820000000',accreditationStatus:'ACCREDITED'}).returning();
 const receipt={kind:'RECEIPT',amountCents:300000,reference:'BANK-PD-1',evidence:'Cleared earned platform acquisition fee excluding VAT; not principal',lenderId:lender.id,settledAt:'2026-10-31T12:00:00.000Z',earnedPlatformRevenue:true};
 await http().post(`/payday/employers/${lead.id}/entries`).set(R).send(receipt).expect(403);
 const entry=(await http().post(`/payday/employers/${lead.id}/entries`).set(A).send(receipt).expect(201)).body;
 await http().post(`/payday/employers/${lead.id}/entries`).set(A).send(receipt).expect(409);
 await http().post(`/payday/employers/${lead.id}/qualify`).set(B).expect(400);await http().post(`/payday/entries/${entry.id}/decision`).set(A).send({approve:true}).expect(403);
 await http().post(`/payday/entries/${entry.id}/decision`).set(B).send({approve:true}).expect(200);
 const detail=(await http().get(`/payday/employers/${lead.id}`).set(B).expect(200)).body;assert.equal(detail.recovery.contributionCents,240000);assert.equal(detail.recovery.ready,true);
 assert.deepEqual((await http().get(`/payday/employers/${lead.id}`).set(R).expect(200)).body.entries,[]);
 await http().post(`/payday/employers/${lead.id}/qualify`).set(A).expect(403);
 const award=(await http().post(`/payday/employers/${lead.id}/qualify`).set(B).expect(200)).body;assert.equal(award.amountCents,200000);await http().post(`/payday/employers/${lead.id}/qualify`).set(B).expect(409);
 // A reversal cannot erase already earned wages. Pay remains owed, and exposure is reported.
 await http().post(`/payday/entries/${entry.id}/reverse`).set(A).send({reference:'BANK-REFUND-1',evidence:'fee refunded',settledAt:receipt.settledAt}).expect(201);
 assert.equal((await http().get(`/payday/employers/${lead.id}`).set(B).expect(200)).body.recovery.exposureCents,300000);
 const pay={userId:rows[2].id,period:'2026-11',basicCents:550000,otherCents:0,deductions:[{label:'External payroll withholding',cents:10000}],awardIds:[award.id],payrollEvidence:'Verified external payroll calculation'};
 await db.update(schema.users).set({roles:['ADMIN']}).where(eq(schema.users.id,rows[0].id)); // A finance operator need not be a second super-admin.
 const statement=(await http().post('/payday/statements').set(A).send(pay).expect(201)).body;assert.equal(statement.netCents,740000);assert.equal((await http().get('/payday/statements').set(R).expect(200)).body.length,0);
 await http().post('/payday/statements').set(A).send({...pay,period:'2026-12'}).expect(409);
 await http().post(`/payday/statements/${statement.id}/publish`).set(A).expect(403);await http().post(`/payday/statements/${statement.id}/publish`).set(B).expect(200);
 assert.equal((await http().get('/payday/statements').set(R).expect(200)).body.length,1);assert.equal((await http().get('/payday/statements').set(S).expect(200)).body.length,0);
 await http().post(`/payday/statements/${statement.id}/pay`).set(B).send({reference:'PAY-001'}).expect(403);await http().post(`/payday/statements/${statement.id}/pay`).set(A).send({reference:'PAY-001'}).expect(200);await http().post(`/payday/statements/${statement.id}/pay`).set(A).send({reference:'PAY-002'}).expect(403);
 assert((await db.select().from(schema.paydayAwards).where(eq(schema.paydayAwards.id,award.id)))[0].paidAt);
 const issued=(await http().post('/payday/kit').set(A).send({userId:rows[2].id,item:'Branded polo',quantity:2}).expect(201)).body;await http().post(`/payday/kit/${issued.id}/acknowledge`).set(S).expect(404);await http().post(`/payday/kit/${issued.id}/acknowledge`).set(R).expect(200);
 await http().post(`/payday/employees/${rows[2].id}`).set(B).send({status:'INACTIVE',territory:'Sandton',employmentReference:'test-contract',basicCents:550000,weeklyHours:40}).expect(200);
 await http().post('/payday/employers').set(R).send({...payload,clientKey:'inactive',registrationNumber:'2026111107'}).expect(403);
 assert.equal((await http().get('/payday/statements').set(R).expect(200)).body[0].status,'PAID');
 // New employees must change the administrator-supplied initial password.
 const provision=(await http().post('/payday/employees').set(B).send({email:'newstaff@test.invalid',firstName:'New',lastName:'Staff',phone:'0821230001',initialPassword:'Initial-Password-123',employeeNumber:'PDNEW',territory:'Sandton',startDate:'2026-11-01',employmentReference:'signed contract'}).expect(201)).body;
 const [newUser]=await db.select().from(schema.users).where(eq(schema.users.id,provision.userId));const N={Authorization:`Bearer ${(await app.get(AuthService).issueTokens(newUser)).accessToken}`};
 await http().post('/payday/me/password').set(N).send({currentPassword:'wrong',newPassword:'Replacement-Password-123'}).expect(400);await http().post('/payday/me/password').set(N).send({currentPassword:'Initial-Password-123',newPassword:'Replacement-Password-123'}).expect(200);
 assert.equal((await db.select().from(schema.paydayEmployees).where(eq(schema.paydayEmployees.userId,provision.userId)))[0].passwordChangeRequired,false);
 console.log('PASS: Payday migrations, staff provisioning, onboarding/training gates, role/owner isolation, offline idempotency, stale edits, verified lender revenue, immutable earned commission, reversals, two-person payroll approval/payment, statement privacy and kit ownership.');
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
