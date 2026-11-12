'use client';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Card, Loading, PageHeader, RecordActions, StatusBadge, useApi } from '@xtra/ui';

export default function ApplicationsReview() {
  const applications = useApi((c) => c.admin.personalApplications());
  return (
    <div className="space-y-5">
      <PageHeader title="Personal-loan oversight" subtitle="Monitor customer and lender activity. Open a request only to investigate or intervene when needed." />
      <details className="rounded-xl border border-line bg-white px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">How the loan request flow works</summary><p className="mt-2 text-muted">Customers submit one request. All active accredited lenders may assess it and make offers; the customer compares the three lowest-cost offers and chooses. Administration can intervene or confirm funding when needed.</p></details>
      {applications.error && <Alert tone="red">{applications.error}</Alert>}
      {applications.loading ? <Loading /> : applications.data?.length ? <Card className="divide-y divide-line p-0">
        {applications.data.map((a) => <div key={a.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
          <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6">
            <div className="min-w-0"><Link className="block truncate text-sm font-semibold hover:underline" href={`/users/${a.userId}`}>{a.firstName} {a.lastName}</Link><p className="truncate text-xs text-muted sm:hidden">{formatZAR(a.amountCents)} · {a.termMonths} months · {a.purpose}</p></div>
            <div className="hidden text-right text-sm tabular-nums sm:block">{formatZAR(a.amountCents)} · {a.termMonths} months</div>
            <div className="hidden text-right text-xs text-muted md:block">{new Date(a.createdAt).toLocaleDateString('en-ZA')}</div>
          </div>
          <StatusBadge status={a.status} />
          <RecordActions actions={[{ label: 'Open application', href: `/applications/${a.id}` }, { label: 'View applicant', href: `/users/${a.userId}` }]} />
        </div>)}
      </Card> : <Card><p className="text-sm text-muted">No personal-loan applications yet.</p></Card>}
    </div>
  );
}
