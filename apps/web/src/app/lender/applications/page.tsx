'use client';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, PageHeader, RecordActions, StatusBadge, useApi } from '@xtra/ui';

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
    <PageHeader title="Loan requests" subtitle="Review a request and make an offer if it fits your criteria." actions={<Link className="text-sm font-semibold underline" href="/lender/ai">Lender AI settings</Link>} />
    <Alert tone="blue">All active accredited lenders receive new requests. The applicant compares offers and chooses one. No funds move until the agreement is accepted and funding controls complete.</Alert>
    {applications.error && <Alert tone="red">Could not load loan requests: {applications.error}</Alert>}
    {applications.loading ? <Loading /> : !applications.data?.length ? <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">No open loan requests</div> : <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {applications.data.map(a => {
        const value = progress(a.status), actionLabel = ['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'].includes(a.status) ? 'Review and make an offer' : 'Open application';
        return <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem_auto] items-center gap-2 px-2.5 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(7rem,.7fr)_auto] sm:gap-3 sm:px-4">
          <Link href={`/lender/applications/${a.id}`} className="min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"><div className="truncate text-sm font-semibold">{a.firstName} {a.lastName}</div><div className="truncate text-xs text-muted">{formatZAR(a.amountCents)} · {a.termMonths} months</div></Link>
          <StatusBadge status={a.status} />
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2"><div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand-purple" style={{ width: `${value}%` }} /></div><span className="w-7 text-right text-[10px] text-muted sm:w-8 sm:text-xs">{value}%</span></div>
          <RecordActions actions={[{ label: actionLabel, href: `/lender/applications/${a.id}` }]} label={`Actions for ${a.firstName} ${a.lastName}`} />
        </div>;
      })}
    </div>}
  </div>;
}
