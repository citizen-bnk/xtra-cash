'use client';
import Link from 'next/link';
import { AlertTriangle, Banknote, FileStack, HandCoins, Tags, TrendingUp } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, PageHeader, Stat, StatusBadge, useApi } from '@xtra/ui';

export default function LenderOverview() {
  const org = useApi((c) => c.lender.org());
  const stats = useApi((c) => c.lender.stats());
  const applications = useApi(c => c.lender.personalApplications());
  if (!org.data || !stats.data) return <Loading />;
  const o = org.data;
  const s = stats.data;
  const accredited = o.accreditationStatus === 'ACCREDITED';
  return (
    <div>
      <PageHeader title={o.tradingName || o.name} subtitle="Your stall in the XTRA-CASH Credit Mall" actions={<StatusBadge status={o.accreditationStatus} />} />
      {!accredited && (
        <div className="mb-6">
          <Alert tone={o.accreditationStatus === 'REJECTED' || o.accreditationStatus === 'SUSPENDED' ? 'red' : 'amber'} title="Your stall is not live yet">
            {o.accreditationStatus === 'DRAFT' && 'Complete your business details and documents, then submit for accreditation. Need help with NCR registration? Choose assisted accreditation.'}
            {o.accreditationStatus === 'SUBMITTED' && (o.assistedAccreditation && !o.accreditationFeePaid ? 'Pay the assisted accreditation fee so our compliance team can start.' : 'Submitted — our compliance team will review it shortly.')}
            {o.accreditationStatus === 'UNDER_REVIEW' && 'Our compliance team is reviewing your application.'}
            {(o.accreditationStatus === 'REJECTED' || o.accreditationStatus === 'SUSPENDED') && (o.reviewNotes ?? 'Contact XTRA-CASH compliance.')}
            <div className="mt-2">
              <Link href="/lender/accreditation" className="font-semibold underline">Go to accreditation →</Link>
            </div>
          </Alert>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/lender/funds" label="Available to lend" value={formatZAR(s.availableCents)} icon={<Banknote className="h-4 w-4" />} sub={`${formatZAR(s.totalLoadedCents)} loaded to date`} />
        <Stat href="/lender/loans" label="Outstanding book" value={formatZAR(s.outstandingCents)} icon={<FileStack className="h-4 w-4" />} sub={`${s.activeLoans} active loans`} />
        <Stat href="/lender/loans" label="Advanced to date" value={formatZAR(s.totalAdvancedCents)} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat href="/lender/loans" label="Repaid to you" value={formatZAR(s.totalRepaidCents)} icon={<HandCoins className="h-4 w-4" />} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat href="/lender/applications" label="Loan applications" value={applications.data?.length ?? '…'} sub="Latest applications sent to your stall" />
        <Stat href="/lender/loans?status=IN_ARREARS" label="Loans in arrears" value={s.loansInArrears} icon={<AlertTriangle className="h-4 w-4" />} sub={s.activeLoans ? `${((s.loansInArrears / s.activeLoans) * 100).toFixed(1)}% of active loans` : undefined} />
        <Stat href="/lender/offers" label="Live offers" value={s.activeOffers} icon={<Tags className="h-4 w-4" />} sub={accredited ? 'Matching shoppers now' : 'Will go live once accredited'} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/lender/funds"><Button>Load funds</Button></Link>
        <Link href="/lender/offers"><Button variant="secondary">Create an offer</Button></Link>
      </div>
    </div>
  );
}
