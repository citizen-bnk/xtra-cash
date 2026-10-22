# Loan submission recovery

On 22 October 2026, production request logs recorded HTTP 503 on `/api/personal-loans/verification`. At investigation time, API health, authenticated profile/verification/application reads and invalid-payload submission validation were working. The checks did not establish the underlying platform outage cause.

The browser proxy now converts non-JSON 502/503/504 responses into a plain temporary-unavailability message. Safe GET/HEAD requests retry once; uploads, applications and financial mutations never retry automatically. The shared client also hides raw platform error pages and provides a clear connection-interruption message.

Before submitting, the loan flow saves the latest answers and its UUID idempotency key in the encrypted, user-scoped draft. Submission stops if that save fails. Reloading the draft restores the same key; a deliberate new application receives a new key. The existing server-side uniqueness rule on user plus application key prevents duplicate loan applications on retry.

Files remain in memory on the current page. They are not saved in the draft, so the applicant must reattach them after reloading if their document submission was not completed. Application consent and fresh financial confirmation are still required. Staff document review, affordability verification and lender approval are separate steps.
