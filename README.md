# XTRA-CASH

**Credit at the point of payment.** Shoppers pay with the XTRA-CASH card; their own wallet pays first and any shortfall is funded instantly by the cheapest matching offer from accredited micro-lenders in the **Credit Mall**. Affiliates earn commission for onboarding people, and a super-admin back office runs the platform.

This repository is the MVP for phase 1. It covers:

| Module | What's in it |
|---|---|
| **Shopper** (web + mobile) | Sign-up, KYC with SA ID validation and affordability, XTRA-Balance (wallet + matched credit), virtual card, pay / freeze, repayments and schedule, activity, referrals |
| **Credit Mall** (lender portal) | Stall registration, standard or **assisted accreditation** (paid), document uploads, EFT fund loading and withdrawals, offers with pricing and **lending criteria** (income, credit score, age, employment, province), live "reach" preview, loan book |
| **Affiliates** | Referral links for shoppers, lenders and affiliates, referral tracking, commissions (activation, lender accreditation, credit used), bank details and payouts |
| **Back office** | Dashboard and work queues, users (suspend, roles), KYC review, lender accreditation and document review, funding confirmation, offer control, loan book, card transactions, commission approval and payouts, platform settings (regulatory caps, fees, commissions), audit log, ledger check, arrears job |

The marketplace, merchant stores, delivery drivers and e-bike leasing (XTRA-INCOME™) are **phase 2**. The data model and the `MARKETPLACE` payment channel are ready for them.

## Architecture

```
apps/
  api/      NestJS + Drizzle ORM + PostgreSQL   → REST API (port 4000, Swagger at /docs)
  web/      Next.js 15                          → shopper, lender and affiliate portals (port 3000)
  admin/    Next.js 15                          → super-admin back office (port 3001)
  mobile/   Expo SDK 54 / React Native          → shopper app (iOS & Android)
packages/
  shared/   Types, enums, loan maths, SA-ID validation, typed API client (used by all apps)
  ui/       Shared React components and design tokens (web + admin)
```

Everything is TypeScript. All money is stored as **integer cents (ZAR)** and interest as **basis points per month**.

### How a payment works (`apps/api/src/consumer/authorization.service.ts`)

1. The card swipe arrives (a signed JIT-funding webhook from the card processor at `POST /card-network/authorize`, or an in-app payment).
2. The shopper's row is locked, so concurrent swipes can't overspend.
3. The **wallet pays first**. For any shortfall, the credit engine (`credit-engine.ts`):
   - filters offers to lenders that are **ACCREDITED** and whose criteria the shopper meets
   - caps new installments at the **affordability** limit: `(income − expenses) × ratio − existing installments`
   - funds from the **cheapest offer first**, splitting across lenders when needed, and respects per-shopper caps and each lender's available funds
4. Loans and installment schedules are created, lender funds are reserved atomically, the affiliate commission is recorded, and a **double-entry ledger** journal is posted. The transaction is idempotent: a retried swipe never lends twice.

## Quick start

Prerequisites: Node 22, pnpm 10, and PostgreSQL 16 (or Docker).

```bash
pnpm install
docker compose up -d                         # or use your own Postgres
cp apps/api/.env.example apps/api/.env       # then set JWT_SECRET etc.
pnpm build:shared
pnpm db:migrate
pnpm db:seed                                 # demo data (wipes the DB; refuses in production)

pnpm dev:api      # http://localhost:4000   (API docs: /docs)
pnpm dev:web      # http://localhost:3000
pnpm dev:admin    # http://localhost:3001
pnpm dev:mobile   # Expo. Set EXPO_PUBLIC_API_URL to your computer's LAN IP for a real phone
```

### Demo logins (after `pnpm db:seed`)

| Role | Login | Password |
|---|---|---|
| Super-admin | superadmin@xtracash.co.za | Admin@12345 |
| Admin | ops@xtracash.co.za | Admin@12345 |
| Shopper (salaried, Gauteng) | naledi@example.com | Passw0rd! |
| Shopper (gig worker, KZN) | sipho@example.com | Passw0rd! |
| Shopper (student, no matching offers) | ayanda@example.com | Passw0rd! |
| Shopper (KYC pending review) | kagiso@example.com | Passw0rd! |
| Lender (accredited) | lindiwe@kasicapital.co.za | Passw0rd! |
| Lender (assisted accreditation) | bongani@ubuntucredit.co.za | Passw0rd! |
| Lender (awaiting review) | fatima@mzansiquick.co.za | Passw0rd! |
| Affiliate | thabo.affiliate@example.com | Passw0rd! |

## Deploying

See [DEPLOY.md](DEPLOY.md). It covers a one-click Render Blueprint (`render.yaml`) for the API, Postgres, web and admin.

## Tests

```bash
createdb xtracash_test         # once
pnpm test                      # unit tests (loan maths, SA ID, credit engine) + end-to-end API tests
pnpm typecheck                 # all apps and packages
```

The e2e suite (`apps/api/test/app.e2e.spec.ts`) walks every role through its journey. It also covers concurrent swipes that must not over-lend, idempotent retries, signed and forged card-network webhooks, arrears blocking new credit, settling a loan, affiliate payouts, role-based access, suspension, and a balanced ledger.

## Going to production: replace the mocks

Every external dependency sits behind an interface in `apps/api/src/integrations/` and is wired in `integrations.module.ts`. Swapping a mock for a real provider doesn't touch business logic.

| Adapter | Mock today | Production options |
|---|---|---|
| `CreditBureau` | deterministic score from the ID number | TransUnion, Experian, XDS, Compuscan |
| `CardIssuer` + `/card-network/authorize` | fake PANs, HMAC-signed webhook | BIN sponsor / issuer-processor with JIT funding |
| `PaymentGateway` | always succeeds | Ozow, PayFast, Peach Payments, Stitch; DebiCheck for repayment collection |
| `FileStorage` | local `uploads/` folder | S3 (af-south-1), encrypted |
| Identity (in `KycService`) | SA ID checksum and age only | Home Affairs verification and liveness (e.g. Smile ID, VerifyID) |

Also still needed before launch: SMS/email OTP and notifications, repayment reminders, proper disclosure documents (pre-agreement statement and quotation), and hosting with managed Postgres, secrets and monitoring. Set `ENABLE_SIMULATION=false` in production: it switches off the demo "simulate purchase" and instant top-up endpoints.

## Compliance notes (confirm with a compliance officer)

- **National Credit Act.** Credit is extended by the NCR-registered lenders, not XTRA-CASH. Every advance is affordability-assessed. The monthly interest cap, service-fee cap and affordability ratio are configurable in **Back office → Platform settings**, and the defaults are placeholders. Whether XTRA-CASH itself needs registration (e.g. as a credit intermediary or debt collector) needs legal advice.
- **POPIA.** Consent is captured for credit checks. Affiliates only see a referral's first name and surname initial. Documents are served only to their owner and to staff. Tokens are stored in SecureStore on mobile.
- **FICA.** Lender KYB documents are collected and reviewed. Consumer FICA depth depends on the card issuer's requirements.
- **Audit.** Every sensitive action is written to the audit log, and money movements go to a double-entry ledger that the back office checks for balance.
