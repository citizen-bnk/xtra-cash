# XTRA-CASH Lending Backbone

## Product model

Lenders publish standing offers with eligibility rules, a total committed pool, and separate capacity allocations for BNPL, personal loans, and guarantees. A matched amount is an eligible limit, not wallet cash. BNPL may consume only BNPL capacity during purchase authorisation. Personal loans always require an application, lender decision (or explicitly authorised pre-approval policy), customer agreement, and confirmed funding. A lender may also issue a one-off offer for a named applicant.

Offer states are Draft, Active, Paused, and Suspended. Pausing or suspending stops new matching and approvals. Accepted agreements remain governed by their signed terms. Capacity reductions must be rejected when they would fall below signed or reserved obligations. Notify affected customers when an offer they can see changes.

## Welcome offer

Lender participation requires at least one active, funded Welcome BNPL offer for qualifying new subscribers. XTRA-CASH may provide a separate, small, explicitly funded welcome product when lender capacity is unavailable. Never show an available offer without committed capacity. Do not represent an offer as wallet cash or as a personal-loan approval.

## Commercial commitment

At lender onboarding, calculate the initial XTRA-CASH fee commitment as 3% of projected XTRA-CASH fees over the first three months, using the signed fee schedule and recorded forecast assumptions. Record the projection, formula, agreement version, due date, payment and reconciliation history. Offer activation is blocked until paid or an authorised alternative arrangement is recorded. Keep commercial fees separate from lending, welcome-offer and guarantee reserves.

## Guarantors

Support request-specific family guarantees and employer guarantees through separate records, exposure limits, consent and agreements. An individual acts for themselves. HR or directors act for a company only with recorded signing authority; their company approval does not make them personally liable. Employer salary data and payroll consent are distinct from the guarantee. A guarantee does not itself approve a loan.

## Go-to-market roles

Business development managers onboard companies and funding partners and explain commercial terms. They cannot promise approval, alter credit decisions, handle customer credentials, or sign on behalf of a guarantor without verified authority. Public customers use the contactless online journey. Keep customer screens to a short next action, offer summary, clear consent and status; use accessible font sizes, high contrast, responsive layouts and compact cards. Put detailed controls and exception handling in the back office.

## Delivery sequence

1. Agree the commercial fee basis, forecast assumptions, guarantee terms, signing authority and reserve ownership.
2. Add offer pool and allocation data, reservation accounting, fee commitments, reconciliation and immutable audit history.
3. Add lender controls and admin oversight; enforce caps at BNPL authorisation and personal-loan funding. Add Welcome BNPL eligibility and capacity gates.
4. Add customer-specific matching, notifications and one-off lender offers; keep personal-loan application and agreement steps explicit.
5. Add family and employer guarantor invitations, consent, authority, exposure, agreements, notifications and back-office review.
6. Simplify and responsively QA customer, lender and admin journeys; stage rollout by lender and product with live-money gates closed until provider, legal and reserve requirements are verified.

## Release gates

Before live activation: approved lender agreements and fee schedule, defined fee projection methodology, paid or authorised commitment, funded lending allocations, legal review of guarantee and payroll terms, company signing-authority verification, configured identity/affordability/payment providers, and end-to-end reconciliation. Production deployments must not silently activate credit or money movement.
