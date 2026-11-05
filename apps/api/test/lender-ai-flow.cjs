// Isolated HTTP + PostgreSQL semantics with injected model responses. No deployed database or AI/bank API.
require("reflect-metadata");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  { createHmac } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite"),
  { drizzle } = require("drizzle-orm/pglite"),
  { migrate } = require("drizzle-orm/pglite/migrator"),
  { eq } = require("drizzle-orm"),
  { Test } = require("@nestjs/testing"),
  { ThrottlerStorage } = require("@nestjs/throttler"),
  request = require("supertest");
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "isolated-lender-ai-test-secret-at-least-32",
  ENABLE_DEMO_LOGIN: "false",
  ENABLE_SIMULATION: "false",
  DEMO_MODE: "false",
  PERSONAL_AGREEMENTS_ENABLED: "false",
  LENDER_AUTO_OFFERS_ENABLED: "false",
  MONEY_PROGRAMME_ENABLED: "false",
  LENDER_ASSESSMENT_WEBHOOK_SECRET: "isolated-assessment-provider-secret-32",
});
const schema = require("../dist/db/schema"),
  aiSchema = require("../dist/personal-loans/lender-ai.schema"),
  { AppModule } = require("../dist/app.module"),
  { configureApp } = require("../dist/setup"),
  { AuthService } = require("../dist/auth/auth.service"),
  { LenderAiModel } = require("../dist/personal-loans/lender-ai-model"),
  { WorkAssistantModel } = require("../dist/personal-loans/work-assistant"),
  { makeSaId } = require("@xtra/shared");
const password = "Local-Agent-Test-Password!";
let aiResponse = {
    message:
      "Please provide the completed financial assessment reference and mandate reference.",
    nextAction: "PREPARE_OFFER",
    informationMessage: null,
    updates: [],
  },
  workResponse = { message: "A draft is ready for your review.", values: [] };
const modelCalls = [];
(async () => {
  const pg = new PGlite(),
    db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider("DB_BUNDLE")
    .useValue({ db, pool: { end: () => pg.close() } })
    .overrideProvider(LenderAiModel)
    .useValue({
      prepare: async (input) => {
        modelCalls.push(input);
        return aiResponse;
      },
    })
    .overrideProvider(WorkAssistantModel)
    .useValue({ draft: async () => workResponse })
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
    bearer = (token) => ({ Authorization: "Bearer " + token });
  try {
    console.log(
      "Lender AI: accounts, selected-lender referral and default authorisation mode",
    );
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
    const consumer = await register("applicant@agent.test", "0820000031"),
      other = await register("other@agent.test", "0820000032"),
      lender = await register("lender@agent.test", "0820000033", "LENDER"),
      otherLender = await register(
        "foreign@agent.test",
        "0820000034",
        "LENDER",
      );
    const [admin] = await db
      .insert(schema.users)
      .values({
        firstName: "Local",
        lastName: "Reviewer",
        roles: ["ADMIN"],
        referralCode: "LENDERTESTADMIN",
      })
      .returning();
    const staff = (await app.get(AuthService).issueTokens(admin)).accessToken;
    const defaultPolicy=(await http().get('/personal-loans/routing/policy').set(bearer(staff)).expect(200)).body;
    assert.equal(defaultPolicy.mode,'ADMIN');assert.equal(defaultPolicy.automation,'OFF');
    await http().put('/personal-loans/routing/policy').set(bearer(staff)).send({...defaultPolicy,mode:'APPLICANT',confirmed:true}).expect(200);
    const [org] = await db
      .update(schema.lenderOrgs)
      .set({
        accreditationStatus: "ACCREDITED",
        ncrNumber: "NCRCP-TEST",
        availableCents: 10000000,
      })
      .where(eq(schema.lenderOrgs.ownerUserId, lender.user.id))
      .returning();
    await db
      .update(schema.lenderOrgs)
      .set({ accreditationStatus: "ACCREDITED", ncrNumber: "NCRCP-OTHER" })
      .where(eq(schema.lenderOrgs.ownerUserId, otherLender.user.id));
    const [offer] = await db
      .insert(schema.loanOffers)
      .values({
        lenderId: org.id,
        productType: "PERSONAL",
        name: "Owned personal product",
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
    const identity = makeSaId(new Date("1990-01-01"), 5689);
    await db
      .insert(schema.personalVerifications)
      .values({
        userId: consumer.user.id,
        identityType: "ID",
        identityNumber: identity,
        mobile: "0820000031",
        address: "1 Isolated Test Street",
        identityFileKey: "test",
        addressFileKey: "test",
        consentAt: new Date(),
        status: "VERIFIED",
      });
    await db
      .insert(schema.kycProfiles)
      .values({
        userId: consumer.user.id,
        idNumber: identity,
        dateOfBirth: new Date("1990-01-01"),
        province: "Gauteng",
        employmentStatus: "EMPLOYED_FULL_TIME",
        monthlyIncomeCents: 1500000,
        monthlyExpensesCents: 500000,
        consentAt: new Date(),
        status: "VERIFIED",
      });
    const create = async (key) =>
      (
        await http()
          .post("/personal-loans/applications")
          .set(bearer(consumer.accessToken))
          .send({
            amountCents: 100000,
            termMonths: 6,
            purpose: "Transport",
            monthlyIncomeCents: 1500000,
            monthlyExpensesCents: 500000,
            consent: true,
            idempotencyKey: key,
            offerId: offer.id,
          })
          .expect(201)
      ).body;
    const a = await create("lender-ai-manual-001"),
      route = "/personal-loans/applications/" + a.id;
    assert.equal(a.status, "REFERRED");
    assert.equal(a.lenderId, org.id);
    assert.equal(
      (
        await http()
          .get("/lender/personal-applications")
          .set(bearer(otherLender.accessToken))
          .expect(200)
      ).body.length,
      0,
    );
    // Additional lenders receive explicitly scoped viewing access, never decision powers.
    const extraOrg=await db.query.lenderOrgs.findFirst({where:eq(schema.lenderOrgs.ownerUserId,otherLender.user.id)});
    const sharing={lenderId:extraOrg.id,active:true,authorityReference:'CONSENT-TEST-SHARING',confirmed:true};
    await http().get(route+'/lender-access').set(bearer(otherLender.accessToken)).expect(403);
    await http().post(route+'/lender-access').set(bearer(otherLender.accessToken)).send(sharing).expect(403);
    await http().post(route+'/lender-access').set(bearer(staff)).send({...sharing,confirmed:false}).expect(400);
    await http().post(route+'/lender-access').set(bearer(staff)).send(sharing).expect(201);
    await http().post(route+'/lender-access').set(bearer(staff)).send(sharing).expect(201);
    const sharedList=(await http().get('/lender/personal-applications').set(bearer(otherLender.accessToken)).expect(200)).body;
    assert.equal(sharedList.filter(x=>x.id===a.id).length,1);
    assert.equal(sharedList[0].accessMode,'SHARED_VIEW');
    const sharedDetail=(await http().get(route).set(bearer(otherLender.accessToken)).expect(200)).body;
    assert.equal(sharedDetail.sharedReadOnly,true);
    assert.equal(sharedDetail.agreement,null);
    assert.deepEqual(sharedDetail.timeline,[]);
    assert.deepEqual(sharedDetail.funding,[]);
    await http().get(route+'/decision-chat').set(bearer(otherLender.accessToken)).expect(404);
    await http().post(route+'/review').set(bearer(otherLender.accessToken)).send({action:'REVIEW',notes:'Cannot change this shared application'}).expect(404);
    await http().post(route+'/lender-access').set(bearer(staff)).send({...sharing,active:false,authorityReference:'REVOKED-TEST-SHARING'}).expect(201);
    await http().get(route).set(bearer(otherLender.accessToken)).expect(404);
    assert.equal((await http().get('/lender/personal-applications').set(bearer(otherLender.accessToken)).expect(200)).body.length,0);
    await http().get(route).set(bearer(lender.accessToken)).expect(200);
    let settings = (
      await http()
        .get("/lender/ai/settings")
        .set(bearer(lender.accessToken))
        .expect(200)
    ).body;
    assert.equal(settings.mode, "MANUAL");
    assert.equal(settings.automaticOffersEnabled, false);
    await http()
      .get("/lender/ai/settings")
      .set(bearer(consumer.accessToken))
      .expect(403);
    const terms =
      "Approved isolated legal wording. This is a fictional test contract only, describing the approved lender rights, borrower rights, repayment arrangements and complaint handling. It must never be used with a real borrower.";
    const policy = {
      mode: "MANUAL",
      offerId: offer.id,
      amountLimitCents: 300000,
      dailyOfferLimit: 1,
      expiryHours: 24,
      legalReference: "LEGAL-APPROVED-V1",
      agreementTerms: terms,
      automationReviewReference: "AUTOMATION-REVIEW-001",
      confirmed: true,
    };
    settings = (
      await http()
        .put("/lender/ai/settings")
        .set(bearer(lender.accessToken))
        .send({ version: 0, ...policy })
        .expect(200)
    ).body;
    assert.equal(settings.version, 1);
    await http()
      .put("/lender/ai/settings")
      .set(bearer(lender.accessToken))
      .send({ version: 0, ...policy })
      .expect(409);
    await http()
      .get(route + "/decision-chat")
      .set(bearer(consumer.accessToken))
      .expect(403);
    await http()
      .get(route + "/decision-chat")
      .set(bearer(otherLender.accessToken))
      .expect(404);
    let state = (
      await http()
        .get(route + "/decision-chat")
        .set(bearer(staff))
        .expect(200)
    ).body;
    assert.equal(state.version, 0);
    assert.equal(state.draft.agreementTerms, terms);
    assert.equal(state.ready, false);
    state = (
      await http()
        .post(route + "/decision-chat")
        .set(bearer(staff))
        .send({
          version: 0,
          clientKey: "chat-start-001",
          message:
            "Prepare this lender offer and ask for the missing requirements.",
        })
        .expect(201)
    ).body;
    assert.equal(state.version, 1);
    assert.equal(
      (
        await http()
          .post(route + "/decision-chat")
          .set(bearer(staff))
          .send({
            version: 0,
            clientKey: "chat-start-001",
            message:
              "Prepare this lender offer and ask for the missing requirements.",
          })
          .expect(201)
      ).body.version,
      1,
    );
    await http()
      .post(route + "/decision-chat")
      .set(bearer(staff))
      .send({
        version: 0,
        clientKey: "stale-chat-001",
        message: "A stale workspace must not overwrite the draft.",
      })
      .expect(409);
    aiResponse = {
      message: "This source is invalid.",
      nextAction: "PREPARE_OFFER",
      informationMessage: null,
      updates: [
        {
          field: "assessmentReference",
          value: "INVENTED",
          sourceQuote: "All checks passed",
        },
      ],
    };
    await http()
      .post(route + "/decision-chat")
      .set(bearer(staff))
      .send({
        version: 1,
        clientKey: "bad-source-001",
        message: "All checks passed",
      })
      .expect(400);
    const supplied =
      "Assessment completed today. Assessment reference ASSESS-001. Mandate reference MANDATE-001.";
    aiResponse = {
      message:
        "The supplied references and saved legal terms are ready for your review.",
      nextAction: "PREPARE_OFFER",
      informationMessage: null,
      updates: [
        {
          field: "assessmentReference",
          value: "ASSESS-001",
          sourceQuote: "Assessment reference ASSESS-001.",
        },
        {
          field: "mandateReference",
          value: "MANDATE-001",
          sourceQuote: "Mandate reference MANDATE-001.",
        },
        {
          field: "assessedAt",
          value: "TODAY",
          sourceQuote: "Assessment completed today.",
        },
      ],
    };
    state = (
      await http()
        .post(route + "/decision-chat")
        .set(bearer(staff))
        .send({
          version: 1,
          clientKey: "complete-draft-001",
          message: supplied,
        })
        .expect(201)
    ).body;
    assert.equal(state.ready, true);
    assert.equal(
      (await http().get(route).set(bearer(consumer.accessToken)).expect(200))
        .body.application.status,
      "REFERRED",
    );
    const stored = (await db.select().from(aiSchema.decisionSessions))[0];
    assert.ok(!stored.encrypted.includes("ASSESS-001"));
    assert.ok(!JSON.stringify(modelCalls).includes(identity));
    assert.ok(!JSON.stringify(modelCalls).includes("monthlyIncomeCents"));
    const advance = {
      version: state.version,
      draftDigest: state.draftDigest,
      confirmed: true,
    };
    await http()
      .post(route + "/decision-chat/advance")
      .set(bearer(staff))
      .send({ ...advance, draftDigest: "0".repeat(64) })
      .expect(409);
    await http()
      .post(route + "/decision-chat/advance")
      .set(bearer(staff))
      .send(advance)
      .expect(201);
    await http()
      .post(route + "/decision-chat/advance")
      .set(bearer(staff))
      .send(advance)
      .expect(201);
    assert.equal(
      (await http().get(route).set(bearer(consumer.accessToken)).expect(200))
        .body.application.status,
      "OFFERED",
    );
    assert.equal((await db.select().from(schema.loans)).length, 0);

    console.log(
      "Lender AI: human review pauses acceptance and is resolved by an authorised reviewer",
    );
    await http()
      .post(route + "/human-review")
      .set(bearer(other.accessToken))
      .send({ message: "Please review this." })
      .expect(404);
    await http()
      .post(route + "/human-review")
      .set(bearer(consumer.accessToken))
      .send({ message: "Please explain the repayment terms to me." })
      .expect(201);
    process.env.PERSONAL_AGREEMENTS_ENABLED = "true";
    const detail = (
      await http().get(route).set(bearer(consumer.accessToken)).expect(200)
    ).body;
    assert.equal(detail.humanReviewPending, true);
    await http()
      .post(route + "/accept")
      .set(bearer(consumer.accessToken))
      .send({ digest: detail.agreement.digest, password, acknowledged: true })
      .expect(400);
    state = (
      await http()
        .get(route + "/decision-chat")
        .set(bearer(staff))
        .expect(200)
    ).body;
    aiResponse = {
      message: "Review the resolution before recording it.",
      nextAction: "RESOLVE_HUMAN_REVIEW",
      informationMessage:
        "A human reviewer explained the repayment terms and answered the applicant questions.",
      updates: [],
    };
    state = (
      await http()
        .post(route + "/decision-chat")
        .set(bearer(staff))
        .send({
          version: state.version,
          clientKey: "resolve-human-001",
          message:
            "I completed the requested human review and explained the repayment terms. Record that resolution.",
        })
        .expect(201)
    ).body;
    await http()
      .post(route + "/decision-chat/advance")
      .set(bearer(staff))
      .send({
        version: state.version,
        draftDigest: state.draftDigest,
        confirmed: true,
      })
      .expect(201);
    assert.equal(
      (await http().get(route).set(bearer(consumer.accessToken)).expect(200))
        .body.humanReviewPending,
      false,
    );
    console.log(
      "Lender AI: automatic engagement, signed underwriting and controlled offers",
    );
    settings = (
      await http()
        .put("/lender/ai/settings")
        .set(bearer(lender.accessToken))
        .send({ version: settings.version, ...policy, mode: "AUTO_ENGAGE" })
        .expect(200)
    ).body;
    const b = await create("lender-ai-auto-002");
    let run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some(
        (x) => x.applicationId === b.id && x.result === "ENGAGED",
      ),
    );
    assert.equal(
      (
        await http()
          .get("/personal-loans/applications/" + b.id)
          .set(bearer(consumer.accessToken))
          .expect(200)
      ).body.application.status,
      "UNDER_REVIEW",
    );
    settings = (
      await http()
        .put("/lender/ai/settings")
        .set(bearer(lender.accessToken))
        .send({ version: settings.version, ...policy, mode: "AUTO_OFFER" })
        .expect(200)
    ).body;
    run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some((x) => x.result === "AWAITING_AUTOMATION_ACTIVATION"),
    );
    process.env.LENDER_AUTO_OFFERS_ENABLED = "true";
    run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some(
        (x) => x.result === "AWAITING_VERIFIED_LENDER_DECISION",
      ),
    );
    const evidence = (id) => ({
      eventId: "verified-assessment-" + id,
      applicationId: id,
      lenderId: org.id,
      offerId: offer.id,
      assessmentReference: "VERIFIED-ASSESSMENT-" + id,
      mandateReference: "VERIFIED-MANDATE-" + id,
      assessedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      decision: "APPROVED",
      checks: {
        identity: true,
        income: true,
        credit: true,
        affordability: true,
        mandate: true,
      },
    });
    const hook = async (body, status = 201) => {
      const raw = JSON.stringify(body),
        time = String(Math.floor(Date.now() / 1000)),
        signature = createHmac(
          "sha256",
          process.env.LENDER_ASSESSMENT_WEBHOOK_SECRET,
        )
          .update(time + "." + raw)
          .digest("hex");
      return http()
        .post("/lender-ai/assessment")
        .set("content-type", "application/json")
        .set("x-assessment-timestamp", time)
        .set("x-assessment-signature", signature)
        .send(raw)
        .expect(status);
    };
    const approved = evidence(b.id);
    await http().post("/lender-ai/assessment").send(approved).expect(403);
    await hook(approved);
    run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some(
        (x) => x.applicationId === b.id && x.result === "OFFERED",
      ),
    );
    await hook(approved);
    assert.equal(
      (
        await http()
          .get("/personal-loans/applications/" + b.id)
          .set(bearer(consumer.accessToken))
          .expect(200)
      ).body.application.status,
      "OFFERED",
    );
    const c = await create("lender-ai-auto-003");
    await hook(evidence(c.id));
    run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some(
        (x) => x.applicationId === c.id && x.result === "DAILY_LIMIT",
      ),
    );
    await http()
      .post("/personal-loans/applications/" + c.id + "/human-review")
      .set(bearer(consumer.accessToken))
      .send({ message: "I want a person to review this application." })
      .expect(201);
    run = (
      await http()
        .post("/lender/ai/process")
        .set(bearer(lender.accessToken))
        .send({})
        .expect(201)
    ).body;
    assert.ok(
      run.outcomes.some(
        (x) =>
          x.applicationId === c.id && x.result === "HUMAN_REVIEW_REQUESTED",
      ),
    );
    await http().get("/lender-ai/process").expect(401);
    assert.equal((await db.select().from(schema.loans)).length, 0);
    console.log(
      "Work assistant: account preferences, supported draft fields and safety limits",
    );
    assert.equal(
      (
        await http()
          .get("/work-assistant/preferences")
          .set(bearer(staff))
          .expect(200)
      ).body.mode,
      "MANUAL",
    );
    await http()
      .get("/work-assistant/preferences")
      .set(bearer(consumer.accessToken))
      .expect(403);
    await http()
      .put("/work-assistant/preferences")
      .set(bearer(staff))
      .send({
        mode: "AUTO_PREPARE",
        instructions: "Use supplied business details only.",
        maxAmountRand: 5000,
      })
      .expect(200);
    const fields = [
      {
        key: "field-0",
        label: "Offer name",
        type: "text",
        options: [],
        maxLength: 80,
        min: null,
        max: null,
      },
      {
        key: "field-1",
        label: "Maximum amount",
        type: "text",
        options: [],
        maxLength: 30,
        min: 0,
        max: null,
      },
    ];
    workResponse = {
      message: "Review the supplied name and amount.",
      values: [
        {
          key: "field-0",
          value: "Sandton Starter",
          sourceQuote: "Offer name Sandton Starter.",
        },
        { key: "field-1", value: "3000", sourceQuote: "Maximum amount R3000." },
      ],
    };
    const task = (
      await http()
        .post("/work-assistant/prepare")
        .set(bearer(staff))
        .send({
          scope: "/offers",
          message: "Offer name Sandton Starter. Maximum amount R3000.",
          fields,
        })
        .expect(201)
    ).body;
    assert.equal(task.values.length, 2);
    const taskStored = (await db.select().from(aiSchema.workAssistantTasks))[0];
    assert.ok(!taskStored.encrypted.includes("Sandton Starter"));
    workResponse = {
      message: "Cannot exceed limit",
      values: [
        { key: "field-1", value: "6000", sourceQuote: "Maximum amount R6000." },
      ],
    };
    await http()
      .post("/work-assistant/prepare")
      .set(bearer(staff))
      .send({ scope: "/offers", message: "Maximum amount R6000.", fields })
      .expect(400);
    await http()
      .post("/work-assistant/prepare")
      .set(bearer(staff))
      .send({
        scope: "/users",
        message: "Prepare the account",
        fields: [{ ...fields[0], label: "Security role" }],
      })
      .expect(400);
    assert.equal((await db.select().from(schema.loans)).length, 0);
    console.log('Routing: admin default, assignment, invitations, pool claims, geography, consent and manual decline');
    let routingPolicy=(await http().get('/personal-loans/routing/policy').set(bearer(staff)).expect(200)).body;
    const saveRouting=async patch=>{const result=await http().put('/personal-loans/routing/policy').set(bearer(staff)).send({...routingPolicy,...patch,confirmed:true}).expect(200);routingPolicy=result.body;};
    await http().put('/personal-loans/routing/policy').set(bearer(lender.accessToken)).send({...routingPolicy,mode:'ADMIN',confirmed:true}).expect(403);
    await saveRouting({mode:'ADMIN',automation:'OFF',maxLenders:2});
    const submitRouting=async(key,consent=true)=>(await http().post('/personal-loans/applications').set(bearer(consumer.accessToken)).send({amountCents:100000,termMonths:6,purpose:'Transport',monthlyIncomeCents:1500000,monthlyExpensesCents:500000,consent:true,idempotencyKey:key,...(consent?{routingConsent:true}:{})}).expect(201)).body;
    const choose=async(app,ids,action='ASSIGN')=>http().post(`/personal-loans/routing/applications/${app.id}`).set(bearer(staff)).send({action,offerIds:ids,reason:'Reviewed routing test evidence',confirmed:true});
    const ra=await submitRouting('routing-admin-default');assert.equal(ra.lenderId,null);assert.equal(ra.status,'SUBMITTED');
    await http().post('/personal-loans/applications').set(bearer(consumer.accessToken)).send({amountCents:100000,termMonths:6,purpose:'Transport',monthlyIncomeCents:1500000,monthlyExpensesCents:500000,consent:true,idempotencyKey:'cannot-force-lender',offerId:offer.id}).expect(400);
    assert.equal((await http().post('/personal-loans/matches').set(bearer(consumer.accessToken)).send({amountCents:100000,termMonths:6,purpose:'Transport',monthlyIncomeCents:1500000,monthlyExpensesCents:500000,consent:true,idempotencyKey:'routing-admin-default'}).expect(200)).body.locked,true);
    assert.equal((await choose(ra,[offer.id])).status,201);
    assert.equal((await db.query.personalLoanApplications.findFirst({where:eq(schema.personalLoanApplications.id,ra.id)})).lenderId,org.id);
    const noConsent=await submitRouting('routing-needs-consent',false);assert.equal((await choose(noConsent,[offer.id])).status,400);
    await http().post(`/personal-loans/routing/applications/${noConsent.id}/consent`).set(bearer(other.accessToken)).send({confirmed:true}).expect(404);
    await http().post(`/personal-loans/routing/applications/${noConsent.id}/consent`).set(bearer(consumer.accessToken)).send({confirmed:true}).expect(201);
    assert.equal((await choose(noConsent,[],'CLEAR')).status,201);
    assert.equal((await http().post(`/personal-loans/routing/applications/${noConsent.id}/claim`).set(bearer(otherLender.accessToken)).send({offerId:offer.id,confirmed:true})).status,404);
    assert.equal((await choose(noConsent,[],'DECLINE')).status,201);
    assert.equal((await db.query.personalLoanApplications.findFirst({where:eq(schema.personalLoanApplications.id,noConsent.id)})).status,'DECLINED');
    await db.update(schema.lenderOrgs).set({availableCents:10000000}).where(eq(schema.lenderOrgs.id,extraOrg.id));
    const {id:oldOfferId,...copyOffer}=offer;const [extraOffer]=await db.insert(schema.loanOffers).values({...copyOffer,lenderId:extraOrg.id,name:'Second eligible personal product'}).returning();
    const multi=await submitRouting('routing-multiple');assert.equal((await choose(multi,[offer.id,extraOffer.id])).status,201);
    const invitation=(await http().get('/personal-loans/routing/queue').set(bearer(otherLender.accessToken)).expect(200)).body.find(x=>x.id===multi.id);
    assert.ok(invitation);assert.equal(invitation.firstName,undefined);assert.equal(invitation.monthlyIncomeCents,undefined);
    await http().get('/personal-loans/applications/'+multi.id).set(bearer(otherLender.accessToken)).expect(404);
    await http().post(`/personal-loans/routing/applications/${multi.id}/claim`).set(bearer(otherLender.accessToken)).send({offerId:extraOffer.id,confirmed:true}).expect(201);
    await http().post(`/personal-loans/routing/applications/${multi.id}/claim`).set(bearer(lender.accessToken)).send({offerId:offer.id,confirmed:true}).expect(409);
    assert.equal((await db.query.personalLoanApplications.findFirst({where:eq(schema.personalLoanApplications.id,multi.id)})).lenderId,extraOrg.id);
    await saveRouting({mode:'OPEN_POOL',automation:'OFF'});const poolApp=await submitRouting('routing-open-pool');
    assert.ok((await http().get('/personal-loans/routing/queue').set(bearer(lender.accessToken)).expect(200)).body.some(x=>x.id===poolApp.id));
    await http().post(`/personal-loans/routing/applications/${poolApp.id}/claim`).set(bearer(lender.accessToken)).send({offerId:offer.id,confirmed:true}).expect(201);
    await saveRouting({mode:'ADMIN',automation:'ASSIGN',maxLenders:1});const autoApp=await submitRouting('routing-automatic');assert.ok(autoApp.lenderId);assert.equal(autoApp.status,'REFERRED');
    await saveRouting({mode:'ADMIN',automation:'PREPARE'});const prepApp=await submitRouting('routing-prepare-only');assert.equal(prepApp.lenderId,null);
    await saveRouting({mode:'ADMIN',automation:'ASSIGN',geography:'VICINITY',radiusKm:10});const missingLocation=await submitRouting('routing-no-location');assert.equal(missingLocation.lenderId,null);
    await db.update(schema.loanOffers).set({locationTarget:{latitude:-26.1076,longitude:28.0567,radiusMeters:10000,label:'Sandton test'}}).where(eq(schema.loanOffers.id,offer.id));
    await http().post(`/personal-loans/routing/applications/${missingLocation.id}/consent`).set(bearer(consumer.accessToken)).send({confirmed:true,latitude:-26.1076,longitude:28.0567}).expect(201);
    const withLocation=(await http().post(`/personal-loans/routing/applications/${missingLocation.id}/automate`).set(bearer(staff)).send({}).expect(201)).body;assert.equal(withLocation.applied,true);
    const {distanceKm}=require('../dist/personal-loans/routing');assert.ok(distanceKm({latitude:-26.1076,longitude:28.0567},{latitude:-26.2,longitude:28.04})>10);
    await http().put('/personal-loans/routing/policy').set(bearer(staff)).send({...routingPolicy,version:0,confirmed:true}).expect(409);
    await saveRouting({mode:'ADMIN',automation:'OFF',geography:'PRODUCT_AREA'});
    const lockedRouting=await submitRouting('routing-assessment-lock');assert.equal((await choose(lockedRouting,[offer.id])).status,201);
    await db.insert(aiSchema.lenderAssessments).values({applicationId:lockedRouting.id,lenderId:org.id,eventId:'routing-lock-assessment',payloadHash:'test-lock',offerId:offer.id,assessmentReference:'ASSESS-LOCK',mandateReference:'MANDATE-LOCK',assessedAt:new Date(),expiresAt:new Date(Date.now()+3600000),decision:'APPROVED',checks:{identity:true,income:true,credit:true,affordability:true,mandate:true}});
    assert.equal((await choose(lockedRouting,[extraOffer.id])).status,409);
    assert.equal((await choose(lockedRouting,[],'CLEAR')).status,409);
    console.log(
      "PASS: chat preparation, encrypted persistent drafts, exact-source grounding, version conflicts, explicit authorisation, single-lender isolation, human-review pause/resolution, automatic engagement/offer gates, signed assessments, daily caps and controlled form assistance.",
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
