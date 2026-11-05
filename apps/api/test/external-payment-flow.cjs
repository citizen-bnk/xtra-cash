require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {drizzle} = require('drizzle-orm/pglite');
const {migrate} = require('drizzle-orm/pglite/migrator');
const {eq} = require('drizzle-orm');
const schema = require('../dist/db/schema');
const s = require('../dist/personal-loans/settlement.schema');
const {SettlementService,loanDepositReference} = require('../dist/personal-loans/settlement.service');
const {externalPaymentInput} = require('../dist/personal-loans/settlement.dto');
async function main(){
 const pg = new PGlite(), db = drizzle(pg,{schema});
 try {
 await migrate(db,{migrationsFolder:path.join(__dirname,'../drizzle')});
 const addUser = async(id,roles)=> (await db.insert(schema.users).values({id,firstName:id,lastName:'Test',roles,referralCode:id}).returning())[0];
 const customer=await addUser('customer',['CONSUMER']), admin=await addUser('admin',['ADMIN']), lender=await addUser('lender',['LENDER']);
 const [org]=await db.insert(schema.lenderOrgs).values({ownerUserId:lender.id,name:'Test lender',contactEmail:'test@external.invalid',contactPhone:'0820000001',accreditationStatus:'ACCREDITED',ncrNumber:'TEST-ONLY',availableCents:500000}).returning();
 const [product]=await db.insert(schema.loanOffers).values({lenderId:org.id,name:'Test personal',productType:'PERSONAL',monthlyInterestRateBps:100,termMonths:6,initiationFeeCents:0,monthlyServiceFeeCents:0,minAmountCents:50000,maxAmountPerUserCents:500000,minMonthlyIncomeCents:0,minCreditScore:0,minAge:18,maxAge:100,employmentStatuses:[],provinces:[]}).returning();
 const [app]=await db.insert(schema.personalLoanApplications).values({userId:customer.id,lenderId:org.id,offerId:product.id,amountCents:100000,termMonths:6,purpose:'Transport',monthlyIncomeCents:1500000,monthlyExpensesCents:500000,status:'ACCEPTED',consentAt:new Date(),idempotencyKey:'external-test'}).returning();
 const reference=loanDepositReference(app.id);
 assert.equal(reference,loanDepositReference(app.id));assert.match(reference,/^XC[A-F0-9]{16}$/);assert.notEqual(reference,loanDepositReference('different-application'));
 const [ag]=await db.insert(s.agreements).values({applicationId:app.id,userId:customer.id,lenderId:org.id,status:'ACCEPTED',content:'Test-only signed agreement',digest:'x'.repeat(64),terms:{offerId:product.id,principalCents:100000,termMonths:6,monthlyInterestRateBps:100,initiationFeeCents:0,monthlyServiceFeeCents:0,totalRepayableCents:103529,monthlyInstallmentCents:17255,depositReference:reference},assessmentReference:'TEST',mandateReference:'TEST',legalReference:'TEST',assessedAt:new Date(),approvedBy:lender.id,expiresAt:new Date(Date.now()+86400000),acceptedBy:customer.id,acceptedAt:new Date()}).returning();
 const audit=[]; const service=new SettlementService(db,{post:()=>{throw Error('No platform ledger movement allowed')}},{log:async(...args)=>audit.push(args)},null,{readiness:()=>({enabled:false,agreementsEnabled:false})});
 const actor={id:admin.id,roles:['ADMIN']};
 const body=externalPaymentInput.parse({confirmed:true,note:'Transfer sent using the generated reference.'});
 assert.equal(externalPaymentInput.safeParse({confirmed:false,note:'x'}).success,false);
 await assert.rejects(()=>service.confirmExternalPayment({id:lender.id,roles:['LENDER']},app.id,body));
 await assert.rejects(()=>service.confirmExternalPayment({id:customer.id,roles:['ADMIN']},app.id,body));
 await db.update(schema.personalLoanApplications).set({status:'OFFERED'}).where(eq(schema.personalLoanApplications.id,app.id));
 await assert.rejects(()=>service.confirmExternalPayment(actor,app.id,body));
 await db.update(schema.personalLoanApplications).set({status:'ACCEPTED'}).where(eq(schema.personalLoanApplications.id,app.id));
 const [movement]=await db.insert(s.movements).values({userId:customer.id,kind:'FUNDING',agreementId:ag.id,amountCents:100000,status:'PENDING',clientKey:'existing-transfer',requestHash:'test'}).returning();
 await assert.rejects(()=>service.confirmExternalPayment(actor,app.id,body));
 await db.delete(s.movements).where(eq(s.movements.id,movement.id));
 const results=await Promise.all([service.confirmExternalPayment(actor,app.id,body),service.confirmExternalPayment(actor,app.id,body)]);
 assert.equal(results[0].depositReference,reference);assert.equal(results[1].depositReference,reference);
 assert.equal((await db.select().from(schema.loans)).length,1);
 assert.equal((await db.select().from(schema.installments)).length,6);
 assert.equal((await db.select().from(s.externalLoanPayments)).length,1);
 assert.equal((await db.select().from(s.movements)).length,0);
 assert.equal((await db.select().from(schema.users).where(eq(schema.users.id,customer.id)))[0].walletBalanceCents,0);
 assert.equal((await db.select().from(schema.lenderOrgs))[0].availableCents,500000);
 assert.equal((await db.select().from(schema.personalLoanApplications))[0].status,'DISBURSED');
 assert.equal(audit.length,1);
 console.log('PASS: external payment role/consent gates, accepted-agreement requirement, funding collision prevention, concurrent retries, single loan/schedule, stable deposit reference, audit and unchanged wallet/lender cash.');
 } finally {await pg.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
