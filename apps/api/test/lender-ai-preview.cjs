// Browser fixture on localhost only. It never reads or connects to DATABASE_URL.
require("reflect-metadata");
const path = require("node:path"),
  { hash } = require("bcryptjs"),
  { PGlite } = require("@electric-sql/pglite"),
  { drizzle } = require("drizzle-orm/pglite"),
  { migrate } = require("drizzle-orm/pglite/migrator"),
  { Test } = require("@nestjs/testing");
process.env.JWT_SECRET = "isolated-settlement-browser-secret-32";
process.env.ENABLE_DEMO_LOGIN = "false";
process.env.ENABLE_SIMULATION = "false";
process.env.DEMO_MODE = "false";
process.env.MONEY_PROGRAMME_ENABLED = "false";
process.env.PERSONAL_AGREEMENTS_ENABLED = "false";
process.env.RATE_LIMIT_PER_MIN = "100000";
const schema = require("../dist/db/schema"),
  { AppModule } = require("../dist/app.module"),
  { configureApp } = require("../dist/setup"),
  { makeSaId } = require("@xtra/shared");
(async () => {
  const pg = new PGlite(),
    db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  const passwordHash = await hash("Local-preview-123!", 10);
  const [admin, consumer, lender] = await db
    .insert(schema.users)
    .values([
      {
        id: "preview-reviewer",
        email: "manager@settlement.test",
        firstName: "Local",
        lastName: "Manager",
        roles: ["SUPER_ADMIN", "ADMIN"],
        referralCode: "SETTLELOCALADMIN",
        passwordHash,
      },
      {
        id: "preview-borrower",
        email: "borrower@settlement.test",
        firstName: "Naledi",
        lastName: "Local Preview",
        roles: ["CONSUMER"],
        referralCode: "SETTLELOCALUSER",
        passwordHash,
      },
      {
        id: "preview-lender",
        email: "lender@settlement.test",
        firstName: "Local",
        lastName: "Lender",
        roles: ["LENDER"],
        referralCode: "SETTLELOCALLENDER",
        passwordHash,
      },
    ])
    .returning();
  const identity = makeSaId(new Date("1990-01-01"), 2345);
  await db.insert(schema.users).values({id:'preview-extra-lender',email:'extra@settlement.test',firstName:'Additional',lastName:'Lender',roles:['LENDER'],referralCode:'SETTLEEXTRALENDER',passwordHash});
  await db.insert(schema.lenderOrgs).values({id:'preview-extra-org',ownerUserId:'preview-extra-lender',name:'Additional Preview Credit',contactEmail:'extra@settlement.test',contactPhone:'LOCAL-ONLY',accreditationStatus:'ACCREDITED'});
  await db.insert(schema.kycProfiles).values({
    userId: consumer.id,
    idNumber: identity,
    dateOfBirth: new Date("1990-01-01"),
    province: "Gauteng",
    employmentStatus: "EMPLOYED_FULL_TIME",
    monthlyIncomeCents: 1500000,
    monthlyExpensesCents: 500000,
    consentAt: new Date(),
    status: "VERIFIED",
  });
  await db.insert(schema.personalVerifications).values({
    userId: consumer.id,
    identityType: "ID",
    identityNumber: identity,
    mobile: "0820000088",
    address: "Local preview only",
    identityFileKey: "local",
    addressFileKey: "local",
    consentAt: new Date(),
    status: "VERIFIED",
  });
  const [org] = await db
    .insert(schema.lenderOrgs)
    .values({
      id: "preview-lender-org",
      ownerUserId: lender.id,
      name: "Local Preview Credit",
      ncrNumber: "NCRCP-LOCAL-ONLY",
      contactEmail: "lender@settlement.test",
      contactPhone: "LOCAL-ONLY",
      accreditationStatus: "ACCREDITED",
      availableCents: 1000000,
    })
    .returning();
  const [offer] = await db
    .insert(schema.loanOffers)
    .values({
      id: "preview-personal-offer",
      lenderId: org.id,
      productType: "PERSONAL",
      name: "Local personal loan",
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
  await db.insert(schema.personalLoanApplications).values({
    id: "preview-personal-application",
    userId: consumer.id,
    lenderId: org.id,
    offerId: offer.id,
    amountCents: 100000,
    termMonths: 6,
    purpose: "Transport",
    monthlyIncomeCents: 1500000,
    monthlyExpensesCents: 500000,
    status: "UNDER_REVIEW",
    idempotencyKey: "local-preview-only",
    consentAt: new Date(),
  });
  const aiSchema = require("../dist/personal-loans/lender-ai.schema");
  await db.insert(aiSchema.lenderAgentPolicies).values({
    lenderId: org.id,
    mode: "MANUAL",
    authorisedBy: lender.id,
    policy: {
      offerId: offer.id,
      amountLimitCents: 300000,
      dailyOfferLimit: 5,
      expiryHours: 24,
      legalReference: "LOCAL-LEGAL-V1",
      agreementTerms:
        "LOCAL PREVIEW ONLY. These are fictional legal terms for isolated browser testing. They describe borrower rights, lender responsibilities, repayment arrangements and complaint contacts and must not be used for a real loan.",
      automationReviewReference: "",
    },
  });
  const { LenderAiModel } = require("../dist/personal-loans/lender-ai-model"),
    { WorkAssistantModel } = require("../dist/personal-loans/work-assistant");
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LenderAiModel)
    .useValue({
      prepare: async (input) => {
        const text = input.messages.at(-1).content;
        const complete = text.includes("ASSESS-LOCAL");
        return {
          message: complete
            ? "The supplied assessment, mandate and approved wording are ready for your authorisation."
            : "Please provide the actual completed financial assessment and repayment mandate references.",
          nextAction: "PREPARE_OFFER",
          informationMessage: null,
          updates: complete
            ? [
                {
                  field: "offerId",
                  value: "preview-personal-offer",
                  sourceQuote: "",
                },
                {
                  field: "assessmentReference",
                  value: "ASSESS-LOCAL",
                  sourceQuote: "Assessment reference ASSESS-LOCAL.",
                },
                {
                  field: "mandateReference",
                  value: "MANDATE-LOCAL",
                  sourceQuote: "Mandate reference MANDATE-LOCAL.",
                },
                {
                  field: "assessedAt",
                  value: "TODAY",
                  sourceQuote: "Assessment completed today.",
                },
              ]
            : [],
        };
      },
    })
    .overrideProvider(WorkAssistantModel)
    .useValue({
      draft: async (input) => ({
        message: "Review these administrative values before applying them.",
        values: input.fields
          .filter(
            (f) =>
              f.label.includes("financial assessment") ||
              f.label === "Repayment mandate reference",
          )
          .map((f) => ({
            key: f.key,
            value: f.label.includes("assessment")
              ? "ASSESS-FORM"
              : "MANDATE-FORM",
            sourceQuote: f.label.includes("assessment")
              ? "ASSESS-FORM"
              : "MANDATE-FORM",
          })),
      }),
    })
    .overrideProvider("DB_BUNDLE")
    .useValue({ db, pool: { end: () => pg.close() } })
    .compile();
  const app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.listen(4142, "127.0.0.1");
  console.log("Isolated settlement browser fixture ready on 127.0.0.1:4142");
  process.on("SIGINT", async () => {
    await app.close();
    process.exit(0);
  });
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
