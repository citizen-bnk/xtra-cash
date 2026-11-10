'use client';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, PageHeader, StatusBadge, Table, useApi } from '@xtra/ui';

export default function ApplicationsReview() {
  const applications = useApi((c) => c.admin.personalApplications());
  return (
    <div className="space-y-5">
      <PageHeader title="Personal-loan oversight" subtitle="Monitor customer and lender activity. Open a request only to investigate or intervene when needed." />
      <Alert tone="blue">Customers submit one request. All active accredited lenders may assess it and make offers; the customer compares the three lowest-cost offers and chooses. Administration is outside that journey, with intervention and post-agreement funding confirmation available when needed.</Alert>
      {applications.error && <Alert tone="red">{applications.error}</Alert>}
      {applications.loading ? <Loading /> : <Table rows={applications.data ?? []} empty="No personal-loan applications yet" columns={[
        { header: 'Applicant', cell: (a) => <Link className="font-semibold underline" href={`/users/${a.userId}`}>{a.firstName} {a.lastName}</Link> },
        { header: 'Request', cell: (a) => <div>{formatZAR(a.amountCents)} · {a.termMonths} months<div className="text-xs text-muted">{a.purpose}</div></div> },
        { header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
        { header: 'Submitted', cell: (a) => new Date(a.createdAt).toLocaleDateString('en-ZA') },
        { header: 'Oversight', cell: (a) => <Link className="font-semibold underline" href={`/applications/${a.id}`}>View / intervene</Link> },
      ]} />}
    </div>
  );
}
