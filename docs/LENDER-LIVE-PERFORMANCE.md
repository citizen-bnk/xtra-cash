# Lender live performance

The Credit Mall dashboard requests a fresh, lender-owned snapshot every five seconds, with a ten-second option. Requests start only on the mounted, visible dashboard. Hiding the tab or navigating away aborts the current request and clears the timer. Restoring visibility fetches immediately. Failed refreshes retain the last successful figures and show reconnecting status.

The read-only `/lender/performance` endpoint uses the authenticated lender's organisation and a repeatable-read snapshot. It does not accept an alternative lender ID. No balance, repayment, approval or ledger posting is created by viewing the dashboard.

## Numbers shown

- Net cash received sums recorded lender shares of repayments, after the actual platform deduction. It includes capital repaid.
- Realised return includes only settled loans: recorded net repayments minus original principal, before operating costs and tax. Negative returns remain negative.
- Estimated return to date allocates each funded loan's scheduled net return uniformly between origination and its final due date. Scheduled net return is total contractual repayments minus the current estimated platform share and principal. This is a straight-line projection, not an accounting accrual or guaranteed income.
- Closed loans use actual realised return. Unpaid overdue loans freeze at their first unpaid due date. Defaulted/arrears loans never keep accruing merely because the dashboard is open.
- Estimates use integer millionths of a rand for display so genuine time-based movement below a cent can appear at each refresh. Ledger amounts remain integer cents. The UI labels the extra precision as an estimate.
- BNPL, personal and business rows count funded loan records classified by their offer. Applications awaiting funding do not generate return. Business reporting is ready for business loan records; business origination is not introduced by this dashboard change.
- Clicking a lending stream opens the corresponding filtered loan book. Available funds, cash received and attention counters also link to their detail pages.
