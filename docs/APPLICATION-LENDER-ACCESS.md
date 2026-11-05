# Additional lender access

See LOAN-ROUTING-POLICY.md for administrator assignment, invitations and optional applicant/pool modes. Viewing grants described here are independent of decision-maker selection.

An ADMIN or SUPER_ADMIN opens an application's back-office detail page and uses **Additional lender viewing access** to select an active accredited lender, enter a sharing-authority/consent reference, confirm authorisation and grant access. The same panel lists grants and supports revocation with a reason/reference. Each change is audit logged.

The additional lender sees **View shared request** in its application queue. The permission covers the request amount, term, purpose, status, applicant name and declared income/expenses. It excludes identity documents, the selected lender's private notes, agreement, evidence references and funding records. It does not permit decision chat, information requests, review changes, approval, acceptance or funding. Existing mutation and document endpoints retain their original selected-lender checks.

The assigned lender remains the decision maker. Admin viewing grants do not reassign that lender or broadcast the application. An additional lender does not need a live matching product for this read-only administrative grant, but must be active and accredited. Assignment and multi-lender invitations use the separate routing controls described in LOAN-ROUTING-POLICY.md.

Revocation removes queue/detail access on the next request. Already viewed/downloaded information cannot be recalled. A selected lender's existing access is not removed through this panel. If an additional lender loses accreditation, request visibility is denied. Grants are private to administrators; lenders cannot grant access to others.

The reference records the administrator's asserted authority; it does not independently obtain or validate borrower consent. Administrators must use the approved sharing process before granting access. No additional access is granted automatically during migration or deployment.
