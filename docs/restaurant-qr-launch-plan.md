# Restaurant QR checkout launch plan

## Current implementation (13 November 2026)

`apps/web/src/app/scanqr/` contains a responsive public checkout prototype for `/scanqr/`. It detects iOS, Android and desktop, supports camera or file selection, bill confirmation, a sample ID and offer, repayment selection, terms, canvas signature, payment selection and a sample receipt. It is explicitly labelled DEMO. Bill values are entered manually; no OCR, KYC, affordability decision, payment method linking, loan contract, merchant settlement or real payment occurs. `apps/web/src/components/CustomerBottomNav.tsx` and the customer assistant already have working three-dot menus with navigation or chat actions. The PWA BNPL page in `CustomerJourneyPage.tsx` is a separate UI preview; its store checkout is not connected.

The signed-in Pay screen links to `/scanqr/` and shows wallet plus eligible credit on a card-style balance panel. It offers a zero-wallet Top up funds CTA, but production top-up collection is disabled until a payment provider is connected. Its Get a loan action opens the personal-loan journey; the restaurant checkout remains a separate preview.

## Launch customer journey

1. Scan a restaurant-specific QR code linking to `https://xtra-cash.co.za/scanqr/?merchant=<signed-id>&table=<signed-id>`. Keep a generic QR landing page for unrecognized codes. Detect browser capabilities, not only user-agent, and show a phone-sized checkout on mobile and a centered phone panel with explanatory side panel on desktop.
2. Take a bill photo or upload one. OCR extracts restaurant, bill reference, items, tip and total; the customer confirms or edits. Bind the bill to the merchant and table, detect duplicates, and confirm the merchant is active. Allow manual entry when OCR fails.
3. Offer **Pay in full** or **Check XTRA-CASH**. For credit, collect or retrieve the applicant's ID through a secure field, explicit credit-check consent and authentication or registration. Reuse the customer profile and vault. Run identity, credit bureau and affordability checks; request income evidence only when needed. Never show a numeric credit offer before a real lender decision.
4. Show the lender's actual pre-agreement statement and quotation with bill total, customer's immediate share, XTRA-CASH funded share, rates, fees, total repayable and dates. The customer can accept, choose a repayment method and complete any required mandate.
5. Present the full agreement, collect a clear acceptance and electronic signature, and store a tamper-evident document and consent trail. The lending provider countersigns or authorizes per policy.
6. Collect the customer's immediate share through a payment service provider. Apple Pay or Google Pay may be offered only on supported devices when the provider and merchant configuration are live; ordinary card checkout remains available. Wallet selection is a way to pay with a tokenized card, not a method of adding a card to the XTRA-CASH account or of funding the credit portion.
7. Reserve the lender-funded share, then authorize and settle the full bill to the merchant through a defined split-payment or platform settlement arrangement. Mark the bill paid only after both legs are confirmed. Issue receipt, loan schedule and notifications; handle partial failure with cancellation or refund and reconciliation.

## Delivery sequence

1. **Merchant pilot and UX** — signed QR payloads, merchant/table registry, responsive public route, clear bill capture, review and pay-in-full path; no live credit claims.
2. **Bill ingestion** — secure upload storage, OCR provider, confidence scores, manual correction, merchant/bill validation, idempotency and duplicate protection.
3. **Credit** — login/registration handoff, profile reuse, consent, lender-funded BNPL product, bureau and affordability integrations, lender authorization, compliant quotation and agreement templates.
4. **Payments** — PSP-hosted card checkout, Apple Pay and Google Pay through that PSP, bank-account mandate provider for repayments, funding reserve, merchant settlement, webhooks and refunds.
5. **Operations and launch** — merchant reporting, exception queue, support, reconciliation, audit logs, device testing at pilot restaurants, and a controlled rollout.

## Decisions and access needed

- Pilot restaurant legal entity, merchant bank account and signed merchant agreement; each table's QR ownership and bill numbering.
- Licensed/accredited credit provider for this product, approved underwriting and pricing, credit limits, settlement reserve and who bears fraud, chargebacks and defaults.
- Payment service provider that supports South African card acquiring, Apple Pay/Google Pay web tokens, tokenized card storage if recurring card repayment is required, split settlement or platform collection, refunds and webhooks.
- Bank account/mandate provider if debit orders or bank-linked repayments are required. A bank-linking service for data access does not itself authorize future debits.
- OCR, ID/KYC, bureau, income/affordability and electronic-signature provider accounts and sandbox credentials.
- Final agreement, consent, privacy and collections wording reviewed for the specific credit product and payment structure.

**Release gate:** Keep the route labelled as a preview and do not display “bill paid,” “loan approved,” or “funds available” for a real customer until provider callbacks, lender authorization, ledger posting and merchant reconciliation all succeed.
