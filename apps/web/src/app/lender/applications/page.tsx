'use client';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, PageHeader, RecordActions, RecordLine, useApi } from '@xtra/ui';

function progress(status: string) {
  if (status === 'SUBMITTED') return 15;
  if (status === 'REFERRED') return 25;
  if (status === 'UNDER_REVIEW' || status === 'ACTION_REQUIRED') return 50;
  if (status === 'OFFERED') return 75;
  if (status === 'ACCEPTED' || status === 'FUNDING_PENDING') return 90;
  if (status === 'DISBURSED') return 100;
  return 0;
}

export default function LenderApplications() {
  const applications = useApi(c => c.lender.personalApplications());
  return <div className="space-y-4">
    <PageHeader title="Active loan requests" subtitle="Open a request to review its evidence and make an offer." actions={<Link className="text-sm font-semibold underline" href="/lender/ai">Lender AI settings</Link>} />
    <Alert tone="blue">All active accredited lenders receive new requests. The applicant compares offers and chooses one. No funds move until the agreement is accepted and funding controls complete.</Alert>
    {applications.error && <Alert tone="red">Could not load loan requests: {applications.error}</Alert>}
    {applications.loading ? <Loading /> : !applications.data?.length ? <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">No open loan requests</div> : <div className="overflow-hidden rounded-2xl border border-line bg-white">
      {applications.data.map(a => {
        const value = progress(a.status), actionLabel = ['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'].includes(a.status) ? 'Review and make an offer' : 'Open application';
        return <RecordLine key={a.id} title={<Link href={`/lender/applications/${a.id}`} className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple">{a.firstName} {a.lastName}</Link>} description={`${a.termMonths} months`} value={formatZAR(a.amountCents)} status={a.status} progress={value} actions={<RecordActions actions={[{ label: actionLabel, href: `/lender/applications/${a.id}` }]} label={`Actions for ${a.firstName} ${a.lastName}`} />} />;
      })}
    </div>}
  </div>;
}
