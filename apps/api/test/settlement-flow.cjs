// Isolated real HTTP + Postgres semantics. No deployed database or banking API is used.
require("reflect-metadata");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  { createHmac } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite"),
  { drizzle } = require("drizzle-orm/pglite"),
  { migrate } = require("drizzle-orm/pglite/migrator"),
  { eq, sql } = require("drizzle-orm");
const { Test } = require("@nestjs/testing"),
  { ThrottlerStorage } = require("@nestjs/throttler"),
  request = require("supertest");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-settlement-test-secret-32";
process.env.IDENTITY_ENCRYPTION_KEY = "isolated-dedicated-encryption-key-32";
process.env.MONEY_WEBHOOK_SECRET = "isolated-provider-webhook-secret-32";
process.env.ENABLE_DEMO_LOGIN = "false";
process.env.ENABLE_SIMULATION = "false";
process.env.DEMO_MODE = "false";
delete process.env.PERSONAL_AGREEMENTS_ENABLED;
delete process.env.MONEY_PROGRAMME_ENABLED;
const schema = require("../dist/db/schema"),
  settlement = require("../dist/personal-loans/settlement.schema");
const { AppModule } = require("../dist/app.module"),
  { configureApp } = require("../dist/setup"),
  { AuthService } = require("../dist/auth/auth.service"),
  { MoneyConnector } = require("../dist/personal-loans/money-connector"),
  { SettlementService } = require("../dist/personal-loans/settlement.service");
const { makeSaId } = require("@xtra/shared");
const password = "Private-Test-Password-123!";
let eventSequence = 0;
async function main() {
  const pg = new PGlite(),
    db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  const real = new MoneyConnector(),
    calls = [];
  let providerError = false,
    ownershipMatch = true;
  const connector = {
    readiness: () => real.readiness(),
    requireReady: () => real.requireReady(),
    verifySignature: (...args) => real.verifySignature(...args),
    call: async (route, body) => {
      calls.push({ route, body });
      if (providerError) throw Error("Unknown bank outcome");
      if (route.includes("beneficiaries"))
        return {
          status: "VERIFIED",
          reference: "bank-" + body.id,
          ownershipMatch,
        };
      return {
        eventId: "poll-event-" + ++eventSequence,
        movementId: body.id,
        providerReference: "provider-" + body.id,
        amountCents: body.amountCents,
        currency: "ZAR",
        status: "PENDING",
      };
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider("DB_BUNDLE")
    .useValue({ db, pool: { end: () => pg.close() } })
    .overrideProvider(MoneyConnector)
    .useValue(connector)
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();
  const app = module.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer()),
    bearer = (t) => ({ Authorization: "Bearer " + t });
  try {
    console.log("Settlement: fixtures and disabled banking gates");
    const register = async (email, phone, type = "CONSUMER") =>
      (
        await http()
          .post("/auth/register")
          .send({
            email,
            phone,
            password,
            firstName: "Isolated",
            lastName: "Applicant",
            accountType: type,
            ...(type === "LENDER" ? { lenderName: email } : {}),
          })
          .expect(201)
      ).body;
    const c = await register("consumer@settlement.invalid", "0820000021"),
      other = await register("other@settlement.invalid", "0820000022"),
      l = await register("lender@settlement.invalid", "0820000023", "LENDER"),
      outsider = await register(
        "outsider@settlement.invalid",
        "0820000024",
        "LENDER",
      );
    const [admin] = await db
      .insert(schema.users)
      .values({
        firstName: "Reviewer",
        lastName: "One",
        roles: ["ADMIN"],
        referralCode: "TESTREV1",
      })
      .returning();
    const [admin2] = await db
      .insert(schema.users)
      .values({
        firstName: "Reviewer",
        lastName: "Two",
        roles: ["ADMIN"],
        referralCode: "TESTREV2",
      })
      .returning();
    const staff = (await app.get(AuthService).issueTokens(admin)).accessToken,
      staff2 = (await app.get(AuthService).issueTokens(admin2)).accessToken;
    const [org] = await db
      .update(schema.lenderOrgs)
      .set({
        accreditationStatus: "ACCREDITED",
        ncrNumber: "NCRCP-ISOLATED",
        availableCents: 1000000,
      })
      .where(eq(schema.lenderOrgs.ownerUserId, l.user.id))
      .returning();
    await db
      .update(schema.lenderOrgs)
      .set({ accreditationStatus: "ACCREDITED", ncrNumber: "NCRCP-OTHER" })
      .where(eq(schema.lenderOrgs.ownerUserId, outsider.user.id));
    const [offer] = await db
      .insert(schema.loanOffers)
      .values({
        lenderId: org.id,
        productType: "PERSONAL",
        name: "Personal test",
        active: true,
        monthlyInterestRateBps: 100,
        termMonths: 6,
        initiationFeeCents: 0,
        monthlyServiceFeeCents: 0,
        minAmountCents: 50000,
        maxAmountPerUserCents: 500000,
        minMonthlyIncomeCents: 0,
        minCreditScore: 0,
        minAge: 18,
        maxAge: 100,
        employmentStatuses: [],
        provinces: [],
      })
      .returning();
    const identity = makeSaId(new Date("1990-01-01"), 5678);
    await db
      .insert(schema.personalVerifications)
      .values({
        userId: c.user.id,
        identityType: "ID",
        identityNumber: identity,
        mobile: "0820000021",
        address: "1 Isolated Test Road",
        identityFileKey: "test-id",
        addressFileKey: "test-address",
        consentAt: new Date(),
        status: "VERIFIED",
      });
    await db
      .insert(schema.kycProfiles)
      .values({
        userId: c.user.id,
        idNumber: identity,
        dateOfBirth: new Date("1990-01-01"),
        province: "Gauteng",
        employmentStatus: "EMPLOYED_FULL_TIME",
        monthlyIncomeCents: 2000000,
        monthlyExpensesCents: 500000,
        consentAt: new Date(),
        status: "VERIFIED",
      });
    const input = {
      amountCents: 100000,
      termMonths: 6,
      purpose: "Transport",
      monthlyIncomeCents: 2000000,
      monthlyExpensesCents: 500000,
      consent: true,
      idempotencyKey: "settlement-app-001",
      offerId: offer.id,
    };
    const application = (
      await http()
        .post("/personal-loans/applications")
        .set(bearer(c.accessToken))
        .send(input)
        .expect(201)
    ).body;
    const route = "/personal-loans/applications/" + application.id;
    await http().get(route).set(bearer(other.accessToken)).expect(404);
    await http()
      .post(route + "/information")
      .set(bearer(staff))
      .send({ message: "Please confirm the secure income evidence reference." })
      .expect(201);
    await http()
      .post(route + "/respond")
      .set(bearer(c.accessToken))
      .send({
        message: "The lender has reviewed my supporting financial evidence.",
      })
      .expect(201);
    const approval = {
      offerId: offer.id,
      assessmentReference: "ASSESS-TEST-001",
      mandateReference: "MANDATE-TEST-001",
      legalReference: "LEGAL-TEST-V1",
      assessedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      agreementTerms:
        "Isolated test agreement terms. These are not legal terms for real customers. Repayment method, lender responsibilities, borrower rights, complaint channels and applicable disclosures would be supplied by the approved lender.",
      responsibleLendingConfirmed: true,
    };
    await http()
      .post(route + "/approve")
      .set(bearer(c.accessToken))
      .send(approval)
      .expect(403);
    await http()
      .post(route + "/approve")
      .set(bearer(outsider.accessToken))
      .send(approval)
      .expect(404);
    await http()
      .post(route + "/approve")
      .set(bearer(staff))
      .send({
        ...approval,
        assessedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
      })
      .expect(400);
    const approved = (
      await http()
        .post(route + "/approve")
        .set(bearer(staff))
        .send(approval)
        .expect(201)
    ).body;
    let d = (await http().get(route).set(bearer(c.accessToken)).expect(200))
      .body;
    assert.equal(d.application.status, "OFFERED");
    assert.ok(d.agreement.content.includes("NCRCP-ISOLATED"));
    assert.equal(d.agreement.assessmentReference, undefined);
    assert.equal(d.agreement.digest, approved.digest);
    await http()
      .post(route + "/review")
      .set(bearer(staff))
      .send({
        action: "DECLINE",
        notes: "Cannot undo an offer through the old endpoint.",
      })
      .expect(400);
    await http()
      .post(route + "/accept")
      .set(bearer(c.accessToken))
      .send({ digest: approved.digest, acknowledged: true, password })
      .expect(503);
    process.env.PERSONAL_AGREEMENTS_ENABLED = "true";
    await http()
      .post(route + "/accept")
      .set(bearer(c.accessToken))
      .send({ digest: "0".repeat(64), acknowledged: true, password })
      .expect(409);
    await http()
      .post(route + "/accept")
      .set(bearer(c.accessToken))
      .send({ digest: approved.digest, acknowledged: true, password: "wrong" })
      .expect(401);
    await http()
      .post(route + "/accept")
      .set(bearer(c.accessToken))
      .send({ digest: approved.digest, acknowledged: true, password })
      .expect(201);
    await http()
      .post(route + "/fund")
      .set(bearer(staff2))
      .send({})
      .expect(503);
    process.env.MONEY_CONNECTOR_URL = "https://bank-bridge.example";
    process.env.MONEY_CONNECTOR_TOKEN = "test-private-token";
    process.env.MONEY_PROGRAMME_REFERENCE = "TEST-PROGRAMME";
    process.env.MONEY_PROGRAMME_ENABLED = "true";
    assert.equal(real.readiness().enabled, true);
    await http()
      .post(route + "/fund")
      .set(bearer(staff))
      .send({})
      .expect(403);
    const funding = (
      await http()
        .post(route + "/fund")
        .set(bearer(staff2))
        .send({})
        .expect(201)
    ).body;
    assert.equal(
      (
        await http()
          .post(route + "/fund")
          .set(bearer(staff2))
          .send({})
          .expect(201)
      ).body.id,
      funding.id,
    );
    assert.equal((await db.select().from(schema.loans)).length, 0);
    assert.equal(
      (await http().get("/wallet").set(bearer(c.accessToken)).expect(200)).body
        .availableCents,
      0,
    );
    await http()
      .post("/money/process")
      .set(bearer(staff2))
      .send({})
      .expect(201);
    assert.equal(calls.length, 1);
    const hook = async (event, status = 200, bad = false) => {
      const body = JSON.stringify(event),
        time = String(Math.floor(Date.now() / 1000)),
        signature = createHmac("sha256", process.env.MONEY_WEBHOOK_SECRET)
          .update(time + "." + body)
          .digest("hex");
      return http()
        .post("/money/webhook")
        .set("content-type", "application/json")
        .set("x-money-timestamp", time)
        .set("x-money-signature", bad ? "0".repeat(64) : signature)
        .send(body)
        .expect(status);
    };
    const event = (m, status) => ({
      eventId: "provider-event-" + ++eventSequence,
      movementId: m.id,
      providerReference: "provider-" + m.id,
      amountCents: m.amountCents,
      currency: "ZAR",
      status,
    });
    console.log("Settlement: signed funding, replay protection and schedule");
    const funded = event(funding, "SUCCEEDED");
    await hook(funded, 401, true);
    await hook({ ...funded, amountCents: 1 }, 409);
    await hook(funded);
    await hook(funded);
    await hook(event(funding, "SUCCEEDED"));
    let wallet = (
      await http().get("/wallet").set(bearer(c.accessToken)).expect(200)
    ).body;
    assert.equal(wallet.availableCents, 100000);
    assert.equal((await db.select().from(schema.loans)).length, 1);
    assert.equal((await db.select().from(schema.installments)).length, 6);
    assert.equal(
      (await http().get(route).set(bearer(c.accessToken)).expect(200)).body
        .application.status,
      "DISBURSED",
    );
    await http()
      .post(route + "/cancel")
      .set(bearer(c.accessToken))
      .send({})
      .expect(409);
    console.log("Settlement: own-bank verification and withdrawal holds");
    ownershipMatch = false;
    const rejected = (
      await http()
        .post("/wallet/beneficiaries")
        .set(bearer(c.accessToken))
        .send({
          bankCode: "TEST_BANK",
          accountNumber: "1234567890",
          accountType: "CURRENT",
          password,
        })
        .expect(201)
    ).body;
    assert.equal(rejected.status, "REJECTED");
    ownershipMatch = true;
    const bank = (
      await http()
        .post("/wallet/beneficiaries")
        .set(bearer(c.accessToken))
        .send({
          bankCode: "TEST_BANK",
          accountNumber: "1234567890",
          accountType: "CURRENT",
          password,
        })
        .expect(201)
    ).body;
    assert.equal(bank.status, "VERIFIED");
    const stored = (
      await db
        .select()
        .from(settlement.beneficiaries)
        .where(eq(settlement.beneficiaries.id, bank.id))
    )[0];
    assert.ok(!stored.encryptedDetails.includes("1234567890"));
    const wi = {
      beneficiaryId: bank.id,
      amountCents: 60000,
      clientKey: "withdrawal-test-key-001",
      password,
    };
    await http()
      .post("/wallet/withdrawals")
      .set(bearer(other.accessToken))
      .send(wi)
      .expect(400);
    const w = (
      await http()
        .post("/wallet/withdrawals")
        .set(bearer(c.accessToken))
        .send(wi)
        .expect(201)
    ).body;
    assert.equal(
      (
        await http()
          .post("/wallet/withdrawals")
          .set(bearer(c.accessToken))
          .send(wi)
          .expect(201)
      ).body.id,
      w.id,
    );
    await http()
      .post("/wallet/withdrawals")
      .set(bearer(c.accessToken))
      .send({ ...wi, amountCents: 50000 })
      .expect(409);
    await http()
      .post("/wallet/withdrawals")
      .set(bearer(c.accessToken))
      .send({ ...wi, clientKey: "withdrawal-test-key-002" })
      .expect(400);
    wallet = (
      await http().get("/wallet").set(bearer(c.accessToken)).expect(200)
    ).body;
    assert.equal(wallet.availableCents, 40000);
    assert.equal(wallet.heldCents, 60000);
    const loan = (await db.select().from(schema.loans))[0];
    await http()
      .post("/me/loans/" + loan.id + "/repay")
      .set(bearer(c.accessToken))
      .send({ amountCents: 60000 })
      .expect(400);
    assert.ok(!JSON.stringify(wallet).includes("1234567890"));
    await http()
      .post("/money/process")
      .set(bearer(c.accessToken))
      .send({})
      .expect(403);
    await http().get("/money/process").expect(401);
    providerError = true;
    await http()
      .post("/money/process")
      .set(bearer(staff2))
      .send({})
      .expect(201);
    assert.equal(
      (await http().get("/wallet").set(bearer(c.accessToken)).expect(200)).body
        .heldCents,
      60000,
    );
    providerError = false;
    const paid = event(w, "SUCCEEDED");
    await hook(paid);
    await hook(paid);
    assert.equal(
      (await http().get("/wallet").set(bearer(c.accessToken)).expect(200)).body
        .availableCents,
      40000,
    );
    const returned = event(w, "RETURNED");
    await hook(returned);
    await hook(returned);
    assert.equal(
      (await http().get("/wallet").set(bearer(c.accessToken)).expect(200)).body
        .availableCents,
      100000,
    );
    await hook(event(w, "SUCCEEDED"), 409);
    console.log("Settlement: failure release and ledger invariants");
    const w2 = (
      await http()
        .post("/wallet/withdrawals")
        .set(bearer(c.accessToken))
        .send({
          ...wi,
          amountCents: 10000,
          clientKey: "withdrawal-test-key-003",
        })
        .expect(201)
    ).body;
    const failed = event(w2, "FAILED");
    await hook(failed);
    await hook(failed);
    wallet = (
      await http().get("/wallet").set(bearer(c.accessToken)).expect(200)
    ).body;
    assert.equal(wallet.availableCents, 100000);
    assert.equal(wallet.heldCents, 0);
    const secondApplication = (await http().post('/personal-loans/applications').set(bearer(c.accessToken)).send({...input,amountCents:50000,idempotencyKey:'settlement-funding-failure'}).expect(201)).body;
    const failureRoute='/personal-loans/applications/'+secondApplication.id;
    const secondOffer=(await http().post(failureRoute+'/approve').set(bearer(staff)).send(approval).expect(201)).body;
    await http().post(failureRoute+'/accept').set(bearer(c.accessToken)).send({digest:secondOffer.digest,acknowledged:true,password}).expect(201);
    const secondFunding=(await http().post(failureRoute+'/fund').set(bearer(staff2)).send({}).expect(201)).body;
    const fundingFailure=event(secondFunding,'FAILED');await hook(fundingFailure);await hook(fundingFailure);
    assert.equal((await http().get(failureRoute).set(bearer(c.accessToken)).expect(200)).body.application.status,'FUNDING_FAILED');
    assert.equal((await db.select().from(schema.lenderOrgs).where(eq(schema.lenderOrgs.id,org.id)))[0].availableCents,900000);
    assert.equal((await db.select().from(schema.loans)).length,1);
    const reconciliation=(await http().get('/money/reconciliation').set(bearer(staff2)).expect(200)).body;
    assert.equal(reconciliation.trialBalanceCents,0);assert.deepEqual(reconciliation.walletMismatches,[]);assert.deepEqual(reconciliation.reservationMismatches,[]);assert.equal(reconciliation.externalBankReconciliation,'NOT_CONNECTED');
    const totals = await db
      .select({ n: sql`sum(${schema.ledgerEntries.amountCents})` })
      .from(schema.ledgerEntries);
    assert.equal(Number(totals[0].n), 0);
    const liability = await db
      .select({ n: sql`sum(${schema.ledgerEntries.amountCents})` })
      .from(schema.ledgerEntries)
      .where(
        eq(
          schema.ledgerEntries.account,
          "liability:consumer_wallet:" + c.user.id,
        ),
      );
    assert.equal(Number(liability[0].n), -100000);
    await http()
      .get("/money/operations")
      .set(bearer(c.accessToken))
      .expect(403);
    assert.equal((await db.select().from(schema.loans)).length, 1);
    console.log(
      "PASS: settlement approval, immutable agreement, disabled gates, two-person funding, signed callbacks, one loan/credit, beneficiary ownership, holds, idempotency, unknown outcome, payout return/failure, access controls and balanced ledger.",
    );
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
