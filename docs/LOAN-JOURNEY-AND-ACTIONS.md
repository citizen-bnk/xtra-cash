# Personal loans: journey, offer competition and actions

## The operating path

1. **Applicant applies.** The request stays private by default. Staff review identity/address evidence and the applicant sees the current status.
2. **Admin matches or opens competition.** A suitable existing product can be assigned through admin routing. If none fits, staff request the applicant's specific all-lender competition consent. After consent and document review, an admin releases the request to all active accredited lenders.
3. **Lenders prepare offers.** A lender sees a limited opportunity preview without needing an existing matching product. Opening it provides declared finances under the recorded sharing consent and audit trail. The lender can create a personal-loan product with the requested amount and period, select an existing suitable product, complete genuine assessment/mandate checks, select approved terms and authorise the offer.
4. **First valid authorised offer wins.** Viewing, creating a product or opening the decision popup does not reserve the application. The server locks the application, rechecks the lender, product, criteria, affordability matching, available capacity, human-review pause and evidence requirements, then writes one agreement and closes the competition atomically. A failed attempt does not win. Later attempts are rejected. This is the first valid committed offer, not a promise that the fastest offer is the cheapest or most suitable.
5. **Applicant decides.** An in-app notification opens the quotation and agreement popup. The applicant reads and accepts only if they agree; winning a competition does not accept the contract on their behalf. Agreement acceptance remains separately gated.
6. **Finance releases funding.** A different administrator reviews the accepted request. Actual provider confirmation is required before creating debt and wallet credit. Banking activation remains required.
7. **Applicant manages wallet/EFT.** After real confirmed funding, the wallet supports an EFT request to the applicant's verified own-name bank account under the existing activation, authentication, hold, limit and reconciliation controls.

Admin matching remains the default. Competition is an explicit per-request release, not an automatic broadcast of all applications. Admins can close an open competition without a winner and return the request to private review, then match or record a human decline. A closed competition is not silently reopened. A decided request, existing agreement or recorded lender assessment cannot be repurposed into a new lender competition.

## User interface

- **Your next actions** appears in customer, lender and admin portals. It names who should act and exposes **Tasks & notifications**.
- Notification CTAs open task popups: review/matching, consent/information, matching-offer preparation, agreement acceptance, funding review or wallet management.
- The lending workspace shows a numbered journey and a plain-language next step. Manual matching/access controls are collapsed under an advanced section.
- The guided decision uses a product dropdown, recorded-reference comboboxes, approved-template dropdown and local date/time pickers. Actual evidence references and approved legal wording can still be entered where no saved option exists; the system does not invent them. AI chat/form assistance remains available.
- Lenders can create a matching product inside the competition popup, with pricing/criteria dropdowns. Creating a product activates it in the lender's stall; it does not win a competition or move money.

## Notifications

Notifications are authenticated, role-scoped in-app tasks derived from current application state and open opportunities. Read receipts persist per user. They refresh every 30 seconds while the page is visible and on window focus. Opening a task records it as viewed, not completed; the task remains until the underlying state changes. Every action rechecks access and state server-side. A stale notification cannot authorise a stale loan offer.

This release does not claim external SMS, email, WhatsApp or device-push delivery. Those require separately configured providers, approved messaging and delivery/retry handling. The polling inbox is bounded to the latest 100 cases/opportunities; pagination and load testing remain needed for larger volume.

## Demo records

Migrations seed **12 training application scenarios** in `loan_demo_cases`, from submission/no match/consent through offer, acceptance, funding, wallet and EFT examples. They appear under **Explore demo journey**. Each names the next actor and opens a training action form. They are separate from operational loan applications, legally accepted agreements, loans, wallet balances and payment instructions. Demo interaction never creates debt, changes a real application or moves money. The isolated automated tests exercise real API/database transitions with synthetic accounts separately.

## Activation and practical limits

- Actual lending/identity/affordability/mandate evidence still comes from the approved lender/provider process. Reviewer references and attestation do not perform those checks.
- Secure supporting-document exchange with competing lenders remains an approved external process; the existing KYC download endpoint is not opened to every lender.
- Configure and review products, pricing, criteria and geographical areas. Vicinity policy requires separately consented coordinates and a configured product area before an offer can pass.
- All-lender data-sharing wording and the first-offer-wins commercial policy require the business's approved operating process. Applicants still control acceptance of the final agreement.
- Automatic credit offers, agreement acceptance, wallet funding and EFT remain behind their existing gates. No demo or deployment enables them.

Validation covers no-match product creation, release consent, lender-role isolation, minimal previews, invalid-offer rollback, first winner, losing-offer rejection, applicant notification/read receipts, 12 demo scenarios, routing safeguards and unchanged funding gates.
