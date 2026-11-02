# XTRA Payday Field

Independent native Android/iOS staff application within the XTRA-CASH platform. This is not the consumer wallet app and it does not embed the employee website in a WebView.

- Native package: `za.co.xtracash.payday` on Android and iOS.
- Separate Expo project: `@xtra-cash-team/xtra-payday-field`, ID `bd0c6777-47e1-42d0-9c34-42632abf6526`.
- Employee portal: `https://xtra-cash.vercel.app/team/login`.
- Staff and leads administration: `https://xtra-cash-admin.vercel.app/payday`.
- Shared API: `/payday/*` on the existing XTRA-CASH API.

## Employee rollout

1. A super-administrator provisions an employee under **XTRA Payday → Employees**, entering an employee number, territory, employment evidence and start date. For new accounts, securely deliver a unique initial password of at least 12 characters. The system does not email credentials.
2. The employee signs in through the portal or installed app, changes the initial password, acknowledges employment/kit terms, and reads and acknowledges required published training.
3. An administrator publishes reviewed training under **Training**. There must be at least one active required module. Training acknowledgement is self-attested, not a competency certification.
4. A super-administrator reviews readiness and sets the employee to **ACTIVE**. Inactive employees cannot create or change field records; published remuneration remains available.
5. Reps capture employer leads and visits. Operations verifies employer agreements, lender commercials and payroll reconciliation evidence before setting an employer to **ACTIVE**.

## Native development and installation

From the repository root: `pnpm dev:payday` starts Metro. The Android and iOS JavaScript/Hermes bundles can be validated with `pnpm --filter @xtra/payday export`.

Run EAS commands from `apps/payday`. `eas build --platform android --profile preview` produces a signed internal APK. The initial build is at https://expo.dev/accounts/xtra-cash-team/projects/xtra-payday-field/builds/bfd99c09-2894-4216-ae33-a17d8b96d2d7 . Use the verified installation page, and enable installation from that source on the device when Android requests it. Internal builds are not a Play Store publication.

iOS source/bundles are supported, but installing on real iPhones requires Apple signing and device provisioning or a TestFlight distribution workflow. No iOS installable build or store submission is claimed.

The current internal Android link is exposed in the employee portal. Set `NEXT_PUBLIC_PAYDAY_ANDROID_URL` on the customer web project and redeploy when a newer signed installation page is approved. Review the internal build's expiry before onboarding staff.

## Staff data and offline operation

Authentication tokens and unsynced lead/visit drafts use Expo SecureStore. Draft values are split into bounded UTF-8 chunks, with a generation manifest written last. Drafts are scoped to the authenticated user and retain stable idempotency keys across retries. They are removed only after the server accepts them. Device clearing/reinstallation can remove local drafts; sync before doing either. Training, finance and remuneration require an online connection. No background location permission is requested.

## Finance controls

Amounts are integer ZAR cents. The initial employer acquisition policy is versioned and copied onto each employer: R2,000 commission, R400 buffer and R600 onboarding allowance. Additional cost entries must exclude this allowance to avoid counting it twice.

Incoming platform revenue must be earned, cleared, excluding VAT/principal/lender remittances and supported by evidence. A second administrator verifies positive credits. Negative costs and reversals reduce recovery immediately. A super-administrator independent of the rep and receipt recorder approves the one-off earned award only after activation and the recovery threshold pass.

Basic pay is separate. Administrators draft payroll statements from externally calculated payroll, with approved earned awards allocated once. A super-administrator independent of the author approves publication; a different administrator records payment evidence. No bank transfer, PAYE/UIF calculation or automatic payroll deduction is performed here. Reversals flag exposure and never cancel earned wages. No uniform deduction is generated.

## Checks

`pnpm --filter @xtra/api build` and `pnpm --filter @xtra/api test:payday` exercise the complete staff/lead/finance flow against isolated PGlite. `pnpm typecheck` includes the new native app. The local-only `payday-preview.cjs` fixture supports browser verification without production records or credentials.

The additive migration `0006_even_scrambler.sql` adds the sales role and ten staff operations tables; existing consumer wallets, loans and affiliate awards are not migrated into this subsystem. Actual credit provider integrations and payroll deduction services remain separate launch requirements.
