'use client';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Card, Loading, PageHeader, RecordActions, RecordLine, useApi } from '@xtra/ui';

function progress(status: string) {
  if (status === 'SUBMITTED') return 15;
  if (status === 'REFERRED') return 25;
  if (status === 'UNDER_REVIEW' || status === 'ACTION_REQUIRED') return 50;
  if (status === 'OFFERED') return 75;
  if (status === 'ACCEPTED' || status === 'FUNDING_PENDING') return 90;
  if (status === 'DISBURSED') return 100;
  return 0;
}

export default function ApplicationsReview() {
  const applications = useApi((c) => c.admin.personalApplications());
  return (
    <div className="space-y-5">
      <PageHeader title="Personal-loan oversight" subtitle="Monitor customer and lender activity. Open a request only to investigate or intervene when needed." />
      <details className="rounded-xl border border-line bg-white px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">How the loan request flow works</summary><p className="mt-2 text-muted">Customers submit one request. All active accredited lenders may assess it and make offers; the customer compares the three lowest-cost offers and chooses. Administration can intervene or confirm funding when needed.</p></details>
      {applications.error && <Alert tone="red">{applications.error}</Alert>}
      {applications.loading ? <Loading /> : applications.data?.length ? <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {applications.data.map((a) => <RecordLine key={a.id} title={<Link className="hover:underline" href={`/applications/${a.id}`}>{a.firstName} {a.lastName}</Link>} description={`${a.termMonths} months · ${a.purpose}`} value={formatZAR(a.amountCents)} status={a.status} progress={progress(a.status)} actions={<RecordActions label={`Actions for ${a.firstName} ${a.lastName}`} actions={[{ label: 'Open application', href: `/applications/${a.id}` }, { label: 'View applicant', href: `/users/${a.userId}` }]} />} />)}
      </div> : <Card><p className="text-sm text-muted">No personal-loan applications yet.</p></Card>}
    </div>
  );
}
