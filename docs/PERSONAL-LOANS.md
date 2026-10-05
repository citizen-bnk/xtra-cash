# Personal-loan applications and provider preparation

## Available in this release

- Public `/personal-loan`: start with an ID/passport, or choose amount and period first. The public result is product availability, not identity verification or a credit decision. It contains no named lenders or identity number.
- Shopper dashboard hero and `/app/personal-loan`: one question at a time; quick amount/period/purpose choices; income and expense declarations; ID/passport, contact and address details; two document uploads; consent; submission and status history.
- Documents are limited to PDF/JPEG/PNG, 1.9 MB each. Authenticated downloads are limited to the applicant and authorised staff. Lenders do not receive identity documents through their inbox.
- Admin `/applications`: latest 100 applications and identity/address document reviews. Staff can accept documents, request corrections, mark a request under review, or decline it with an applicant-visible note.
- Lender `/lender/applications`: latest 100 requests explicitly referred to that lender after verification. Lenders can record reviews and declines.
- Names and quotes are revealed only after personal identity/address review AND the KYC profile are verified. Matching uses declared finances, existing commitments, product criteria and lender liquidity. Quotes are indicative. No application creates a loan, reserves funds, pays out money or counts as a credit agreement.
- BNPL and PERSONAL offer types are separate. Personal offers cannot fund card purchases.
- Lender offer planning starts with a chat, with the manual form immediately accessible. The AI uses aggregate book data and platform caps, produces paused drafts, and requires a lender to review/save them. Financial examples exclude funding costs, operating costs and credit losses; surplus can be negative. No promises of profit or automated individual lending decisions.
- Dashboard counters link to users, loans, applications, offers, funding, transactions, revenue/ledger details, and affiliate detail tabs. Keyboard navigation and link labels are supported.

## Provider availability

Google, Apple, WhatsApp and authorised identity-data/bureau credentials were unavailable at implementation time. Their options stay disabled until configured. Existing email/mobile-and-password registration and demo access remain available. Format checks and manually accepted documents do not certify a HANIS lookup or bureau check. Personal document review does not generate a mock credit score.

The signup identity prompt is a guided chat-like flow. Government identifiers and OTPs are never sent to a language model. Names/surname are collected on first use for passwordless accounts; the API blocks services until that profile is completed.

## Configure after provider access is supplied

Set sensitive values through Vercel environment settings or `vercel env`; never commit them. Configure the API project and redeploy it. Use the canonical web origin for OAuth callbacks.

| Capability | API variables | Callback / setup |
| --- | --- | --- |
| Identity encryption | `IDENTITY_ENCRYPTION_KEY` (stable random secret of at least 32 characters) | Set before enrolling passwordless users. It encrypts signup identity/challenge data and derives lookup hashes. JWT_SECRET is a fallback for current installations; rotating a fallback JWT secret invalidates existing encrypted data. Plan a re-encryption/hash migration before rotating keys. |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_WEB_ORIGIN` | Register `https://YOUR-WEB-ORIGIN/auth/callback`; uses PKCE, state/browser binding, nonce and issuer/audience/signature validation. |
| Apple | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `AUTH_WEB_ORIGIN` | Register `https://YOUR-WEB-ORIGIN/api/social-callback`; Apple form_post redirects code/state in a fragment to the web callback. APPLE_CLIENT_SECRET is a valid generated Apple client-secret JWT; rotate it before expiry. |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_API_VERSION`, optional `WHATSAPP_TEMPLATE_LANGUAGE` | Use an approved Meta authentication template with its body and copy-code button parameters. Five-minute OTP expiry; five persisted attempts; successful challenges cannot be replayed. API version is an explicitly configured `vN.N`, rather than a hard-coded version. |
| Authorised identity-data service | `IDENTITY_PROVIDER_URL`, `IDENTITY_PROVIDER_API_KEY` | HTTPS adapter contract: POST `{identityType, identityNumber, purpose:"profile_prefill", consent:true}`; return `{firstName,lastName,reference}`. This is XTRA-CASH's bridge contract, not a public HANIS API. Add the contracted provider mapping before activation. Profile prefill does not automatically verify KYC/FICA. |
| Offer AI | optional `AI_GATEWAY_API_KEY`, optional `OFFER_ASSISTANT_MODEL` | Vercel deployments can use Gateway OIDC authentication. Ensure team Gateway access/credits and model availability. Default model is `inception/mercury-2.5`, verified against the team's free Gateway credit. Premium models such as `openai/gpt-6.1-sol` require paid Gateway credit. Failed calls show an unavailable message and preserve manual setup. Drafts/token counts are saved to `offer_assistant_generations`. |

A real bureau integration, income verification, final lending decision, credit agreement and payment/disbursement integration remain separate work. There is no call-history or location-based risk scoring. Do not switch on an integration merely because variables exist: perform provider-specific callback, consent, expiry/replay and rejection tests with that provider's sandbox first.

## Validation

`pnpm --filter @xtra/api build` followed by `pnpm --filter @xtra/api test:personal` runs the real HTTP journey against PGlite, an isolated PostgreSQL runtime. It never uses a deployed DATABASE_URL. It checks pre-verification privacy, consent, valid file formats, document ownership, duplicate retries, lender isolation, review updates, no fabricated bureau score, no disbursement, provider-unavailable responses, OTP attempt/replay controls, first-use profile gating and encryption integrity.

Production migrations are additive and run in the API release step. Preview builds do not migrate the production database. Consumer history shows the latest 30 applications; staff and lender inboxes show the latest 100, with that limit stated in the UI.
