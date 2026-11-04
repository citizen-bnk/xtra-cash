# Personal loans, wallet funding and own-bank EFT activation

Prepared 4 November 2026. The application implements the workflow; banking is disabled by default. This document does not certify XTRA-CASH or a lender for public lending.

## What is implemented

- Applicant timeline, information requests/replies and cancellation before funding.
- Lender/admin approval based on a current documented assessment and an existing personal-loan product. The reviewer must record assessment, mandate and legal-version references and attest to responsible-lending checks.
- A fixed quotation/agreement containing the lender/NCR reference, cash proceeds, pricing, instalment amounts, total cost, expiry and lender-supplied approved legal terms. SHA-256 fingerprint, password-confirmed borrower acceptance and a downloadable copy. One agreement per application; expired/failed cases need a fresh application and assessment rather than rewriting signed terms.
- Separate agreement-acceptance activation. The code contains no default legal terms that can be silently accepted.
- A different administrator releases funding. Lender availability is reserved, commitments are rechecked and a durable money instruction is queued. No active loan or wallet credit exists until provider success.
- Confirmed funding creates exactly one loan, instalment schedule and wallet credit. Definitive funding failure restores the lender reservation without creating debt.
- Encrypted beneficiary details, own-name verification, password-confirmed withdrawals, rolling daily limits, cash holds, idempotent instructions and callback signature/replay checks.
- Pending/unknown payments retain cash holds. Final failure or confirmed return restores cash once. Contradictory terminal outcomes are rejected for provider reconciliation.
- Back-office money queue, retry/status worker and internal accounting reconciliation API. The wallet available amount excludes withdrawals on hold, including in existing card spending and wallet loan repayment paths.
- Borrower pages `/app/applications/:id` and `/app/wallet`; lender page `/lender/applications/:id`; admin `/applications/:id` and `/money`.

## What we need from you

| Decision or item | Details required | How to supply it |
| --- | --- | --- |
| Lending partner | Legal entity, NCRCP reference, authorised decision makers and product/territory scope; signed platform agreement | Contract/reference documents and named contacts through the approved private process |
| Wallet/banking partner | Who holds cash and owes wallet balances; approved programme/use case; account structure, safeguarding, reconciliation and settlement responsibilities | Signed programme agreement and implementation contact |
| Payout + bank-verification provider | Selected provider and written acceptance of lending/wallet withdrawals; supported banks, rails, limits, cutoffs, final/returned statuses, prefunding and fees | Provider onboarding contact and sandbox access provisioned securely |
| Approved credit terms | Legal-approved agreement/quotation wording, complaints contacts, rights, pricing, product classification, insurance position and repayment/disbursement dates policy | Approved version and legal review reference; enter the complete approved terms when making an offer |
| Underwriting process | Bureau provider/contract, consent and report validity policy, income verification, affordability and fraud checks; or a documented lender-run assessment process | Lender/compliance process and secure evidence references; this release does not turn a mock bureau score into a real report |
| Repayment arrangements | Collection provider, mandate product, creditor identity, collection dates, reversals and failed-collection rules; payroll only for specifically authorised employer products | Provider agreement and sandbox mandate/collection credentials securely |
| Finance owners | Two separate authorised reviewers, cash/funding limits, available prefunding, daily reconciliation and exception owners | Names/roles and approved limits; no real bank account or float is created by deployment |
| Customer operations | Verified messaging/recovery channel, account support, complaint escalation, fraud and lost-device contacts | Approved contacts and provider configuration |
| Compliance/security approval | Applicable credit/payment roles, AML/FIC/RMCP responsibilities, privacy/data-sharing, retention, cross-border processing, operational security and controlled-live-test authorisation | Sign-off and supporting references for the actual entities and programme |

Do not paste passwords, provider keys, tokens, bank credentials or signing secrets into chat, GitHub issues or repository files. Provision secrets in Vercel's protected configuration or the agreed secret manager.

## Integration status and contract

`MoneyConnector` is a tested **bank-approved bridge contract**, not a completed native Stitch/Ozow/Peach/other vendor adapter. There is no fallback that fabricates a payment. A selected provider must be mapped to this contract, implemented in an approved bridge or a provider-specific adapter, and certified before activation. Provider selection cannot be replaced by entering a URL and a token.

The bank bridge must implement the following authenticated HTTPS POST endpoints. Requests carry `Authorization: Bearer <MONEY_CONNECTOR_TOKEN>`. Never redirect requests to another host.

### `/v1/banks`

Request: `{ "country": "ZA" }`.

Response: `[ { "code": "provider-bank-code", "name": "Bank display name" } ]`.

### `/v1/beneficiaries/verify`

Request contains an immutable beneficiary `id`, `userId`, `bankCode`, `accountNumber`, `accountType` (`CURRENT`, `SAVINGS`, `TRANSMISSION`), `firstName`, `lastName`, `identityType`, `identityNumber`.

Response: `{ "status": "VERIFIED|REJECTED|PENDING", "reference": "provider-beneficiary-reference", "ownershipMatch": true }`.

VERIFIED requires a true identity/ownership match. Account-format validation is not enough. An indeterminate match must not be mapped to VERIFIED. Only the immutable verified provider reference is sent with withdrawals. Verification expires for withdrawal purposes after 30 days. The current UI creates a new beneficiary rather than changing a verified account in place.

### `/v1/movements/submit-or-status`

Common request: `{ "id": "immutable-XTRA-instruction-id", "kind": "FUNDING|WITHDRAWAL", "userId": "...", "amountCents": 100000, "currency": "ZAR", "programmeReference": "approved-programme-reference" }`.

- FUNDING also includes `lenderId`, `agreementId`, `agreementDigest`, `mandateReference`. It must allocate confirmed, settled lender-prefunded money to the applicant's wallet in the approved programme, with the repayment mandate genuinely established. It must not interpret an application/approval as cash. The database lender ID must be mapped to the correct contracted provider funding account. This is not a second top-up from unbacked operating funds.
- WITHDRAWAL includes `beneficiaryReference`. The bridge must confirm that the verified beneficiary belongs to this user and that the programme has sufficient real payout funds.
- The bridge MUST persist the instruction ID before invoking the underlying bank and use upstream idempotency. Repeated calls return the existing instruction's status and must never create another payment. If an upstream outcome is unknown, resolve/query the original instruction; do not map a timeout to FAILED or start a fresh transfer.
- The bridge maps the approved provider's finality rules. A 200/202 acknowledgement is PENDING, not SUCCEEDED. FAILED is definitive non-execution. RETURNED means a previously paid withdrawal has actually been returned into the programme's funds. Pending returns are not RETURNED.

Response and callback body:

```json
{
  "eventId": "globally-unique-stable-event-id",
  "movementId": "immutable-XTRA-instruction-id",
  "providerReference": "stable-bank-instruction-reference",
  "amountCents": 100000,
  "currency": "ZAR",
  "status": "PENDING",
  "failureCode": "optional-stable-code"
}
```

Callback: `POST https://xtra-cash-api.vercel.app/money/webhook` with `Content-Type: application/json`.

Headers: `x-money-timestamp` is a 10-digit Unix timestamp in seconds; `x-money-signature` is the lowercase hex HMAC-SHA256 of `timestamp + "." + raw request body` using MONEY_WEBHOOK_SECRET. Timestamp tolerance is five minutes. Generate a fresh timestamp/signature for a delayed retry, retaining the original event ID and body. The bridge must validate upstream provider callbacks separately. The XTRA signature is not the selected vendor's native signature format.

## Configuration, disabled initially

| Variable | Meaning |
| --- | --- |
| PERSONAL_AGREEMENTS_ENABLED | `true` only after lender/legal approval of the acceptance process and terms |
| MONEY_PROGRAMME_ENABLED | `true` only after the contracted banking programme and certification are complete |
| MONEY_PROGRAMME_REFERENCE | Approved programme/contract reference, no credentials |
| MONEY_CONNECTOR_URL | HTTPS origin of the contracted bridge, with no path, query, credentials or redirects |
| MONEY_CONNECTOR_TOKEN | Private bridge authentication token |
| MONEY_WEBHOOK_SECRET | Separate 32+ character callback signing secret |
| IDENTITY_ENCRYPTION_KEY | Explicit 32+ character encryption secret; plan compatibility/migration for existing data before changing it |
| MONEY_DAILY_LIMIT_CENTS | Rolling 24-hour withdrawal limit in cents; default 1,000,000 cents = R10,000 |
| ENABLE_DEMO_LOGIN | Must be explicitly `false` before banking is enabled |
| ENABLE_SIMULATION / DEMO_MODE | Must not be `true` before banking is enabled |
| CRON_SECRET | Existing protected scheduler bearer secret |

Important key-management detail: existing identity fields may have been encrypted using the legacy JWT_SECRET fallback. Simply adding a different IDENTITY_ENCRYPTION_KEY would make those records unreadable. Inventory and migrate/re-encrypt existing encrypted fields under a controlled key transition; do not rotate it blindly. Never expose either key in a migration log.

The five-minute `/money/process` scheduled job claims up to ten due instructions per batch. It retains pending/unknown instructions and rechecks with the same immutable ID. The back office can also trigger a batch. Confirm the Vercel plan supports the schedule. Queue capacity must be load-tested and scaled before a broad launch. An unavailable/disabled connection causes the cron to return an activation-pending result without moving money.

Zero applicant withdrawal fee is implemented in this release. Company/provider fees must be covered commercially or a reviewed, disclosed and correctly accounted fee feature must be built before charging applicants.

## Operational controls still required before market launch

- Complete the selected vendor adapter/bridge and obtain live approval; live credentials alone do not complete that work.
- Connect actual provider/bank settlement reports. `GET /money/reconciliation` verifies internal wallet/hold/ledger consistency, not external bank cash. Perform daily bank/provider/lender reconciliation and resolve suspense items.
- Connect actual bureau/income/identity and repayment collection integrations, or an explicitly approved documented lender-run process for the pilot. References and reviewer attestations do not perform those checks or collect instalments automatically.
- Provide secure supporting-income-document exchange and transactional SMS/email/WhatsApp delivery under the approved operating process. Application timelines are implemented; external message delivery is not asserted.
- Review encryption/retention and access to pre-existing KYC documents and raw identity columns, backups/restore, fraud controls, privileged access and incident handling.
- For passwordless-only borrowers, provide a suitable passkey/OTP step-up implementation before enabling their acceptance/withdrawals. This release requires an existing password and does not silently waive authentication for them.
- Approve the first-release product terms. The structured quotation supports the current fixed monthly instalment model with initiation/service fees; insurance or other product variations need explicit structured support and legal review before use.
- Public demo logins currently remain a separate feature. They must be disabled and sample accounts/data isolated before money activation. Production detects obvious labelled demo identities, but that is not a replacement for proper data segregation.

## Acceptance tests before activation

1. In the isolated environment: wrong reviewer/user denied; stale assessment and expired offer rejected; accepted digest exact; old review endpoint cannot undo a decided application.
2. Confirm no cash/debt before provider confirmation; one lender reservation, one loan, one schedule and one wallet credit despite callback retries.
3. Check own-name rejection, encrypted stored bank details, withdrawal limit, duplicate key conflict and hold protection across wallet repayment/card spending.
4. Exercise unknown response, duplicate/out-of-order/forged callback, definitive failure, confirmed return and contradictory terminal outcomes. Holds must remain until the outcome is established.
5. Verify internal accounting, then perform an explicitly authorised limited live pilot with the approved lender/bank, verifying the actual beneficiary bank receipt and a real repayment/reversal.
6. Only after legal, lender, bank, finance, security and operations sign-off enable agreements and money separately. Record the approved limits and monitoring/on-call responsibilities.
