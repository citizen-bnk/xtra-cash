# Loan routing and lender matching

This policy supersedes the earlier applicant-choice default. **ADMIN** matching with automation **OFF** is the default when no policy has been saved. ADMIN and SUPER_ADMIN can change routing under Platform settings, independently of super-admin-only financial settings.

| Mode | Behaviour |
| --- | --- |
| ADMIN | New requests stay private in the platform queue. An admin assigns one eligible lender/product, invites several eligible lenders, leaves the request private, or records a human decline reason. |
| APPLICANT | Verified applicants choose one matching product. A direct applicant selection is rejected by the API in the other modes. |
| OPEN_POOL | Consented, unassigned requests appear as limited previews to eligible accredited lenders. A lender explicitly claims a matching product. The first successful claim assigns the single decision maker. |

The pool is not an unrestricted broadcast of personal data. Before claiming, a lender sees only the request reference, amount, term, purpose, province and matching product. Names, financial declarations, KYC documents, private notes and agreements are excluded from that preview. Full existing lender access starts only after assignment/claim. Other lenders' claims fail once the row is assigned. The separate admin viewing-grant feature remains available and does not grant decision powers.

A recorded underwriting assessment locks reassignment/clearing to its lender/product; use a fresh application if a different lender is needed. Human administrative decline remains available before an agreement/decision. Assessment defaults are loaded only for the currently assigned lender and exact product, and approval must use that product.

For admin shortlists, each product must belong to a different lender; limits are one to ten lenders. One selection assigns directly. Several selections create invitations; they do not create simultaneous approval powers. Human credit review, agreement acceptance and money gates remain separate. A decided application or one with an agreement cannot be rerouted. Reassignment resets the prior decision chat rather than exposing the prior lender's conversation or carrying its assessment references to another lender.

## Automatic matching and AI assistance

Administrators explicitly authorise OFF, PREPARE or ASSIGN automation in ADMIN mode. Automatic matching is a bounded rules engine: it checks verified identity/profile, active personal products, accredited/active lenders, product criteria, available capacity, term/amount and current affordability matching. It ranks by distance where configured, then total repayable cost, with a stable product tie-breaker. Existing applicant financial/provider integration limits still apply; matching is not a verified credit decision.

PREPARE returns an eligible shortlist for review without assigning. ASSIGN chooses up to the configured maximum, assigns one or creates multiple invitations. It runs on consented submission and after document verification, and can be invoked on a case by an administrator. Policy changes do not reprocess every historical application. No background AI credit judgement or automatic decline is implemented. Shared AI form assistance remains available for preparing administrative fields/settings; administrators approve controls and final actions.

Manual matching, clearing and decline require confirmation and a reason. Decline is a human administrative decision, recorded in the applicant timeline. Clearing sets a private hold so pool/automatic matching does not immediately re-expose the request; an admin can explicitly rematch it later.

## Location

PRODUCT_AREA uses the applicant's verified province and the product's existing province/service criteria. It does not estimate exact distance from an address. VICINITY additionally requires applicant-supplied coordinates and a configured product location/radius. Both the policy maximum distance and product service radius must cover the applicant. Coordinates are stored encrypted and are not exposed in pool previews or passed to the preparation model. Missing location returns no vicinity match, leaving manual intervention; it is not a decline. Browser location is a user-supplied signal, not independently verified evidence of residence.

## Consent, migration and activation

The application consent wording now describes the current routing process. Existing applications are not opted into broader sharing automatically. Their owner can confirm current routing consent from the application detail page; vicinity mode also offers browser location capture. A mode change requires new consent for requests still recorded under the previous mode before they enter the new pool/referral process.

Migrations only add routing/access tables. They grant no access, enable no pool, approve no loan and move no money. Existing assigned applications remain assigned. Policy updates, assignments, invitations, claims, access grants and revocations are audit logged. Queue queries are bounded to 100 requests; load testing and queue pagination are needed before high-volume rollout. Configure and review actual lender service areas, sharing/consent wording and operating owners before enabling pool/automatic routing broadly.
