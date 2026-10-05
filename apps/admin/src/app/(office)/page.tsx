'use client';
import Link from 'next/link';
import { ArrowRight, Banknote, CircleAlert, CreditCard, Landmark, TrendingUp, Users, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Button, Card, Loading, PageHeader, Stat, useApi, useToast, useClient } from '@xtra/ui';
import { VolumeChart } from '@/components/VolumeChart';

export default function Dashboard() {
  const stats = useApi((c) => c.admin.stats());
  const ledger = useApi((c) => c.request<{ balanced: boolean; trialBalanceCents: number }>('GET', '/admin/ledger/check'));
  const client = useClient();
  const toast = useToast();
  if (!stats.data) return <Loading />;
  const s = stats.data;
  const queues = [
    { label: 'KYC submissions to review', n: s.kycPending, href: '/kyc' },
    { label: 'Lender accreditations', n: s.lendersPendingReview, href: '/lenders' },
    { label: 'Lender EFTs / withdrawals to confirm', n: s.fundingPending, href: '/funding' },
    { label: 'Affiliate commissions to approve', n: s.commissionsPending, href: '/affiliates' },
    { label: 'Affiliate payouts to pay', n: s.payoutsPending, href: '/affiliates?tab=payouts' },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        subtitle="Everything happening across XTRA-CASH right now."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await client.admin.runArrearsJob();
              toast(`Arrears check: ${r.overdueInstallments} installments overdue, ${r.loansInArrears} loans flagged`);
              stats.reload();
            }}
          >
            Run arrears check
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/transactions" label="Card volume (30 days)" value={formatZAR(s.transactions.last30DaysVolumeCents, { decimals: false })} sub={`${s.transactions.last30DaysCount} approved payments`} icon={<CreditCard className="h-4 w-4" />} />
        <Stat href="/transactions" label="XTRA-CASH credit used (30d)" value={formatZAR(s.transactions.last30DaysCreditCents, { decimals: false })} sub={`Decline rate ${(s.transactions.declineRate * 100).toFixed(1)}%`} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat href="/loans" label="Outstanding loan book" value={formatZAR(s.loans.outstandingCents, { decimals: false })} sub={`${s.loans.active} active · ${s.loans.inArrears} in arrears`} icon={<Landmark className="h-4 w-4" />} />
        <Stat href="/reports" label="Platform revenue" value={formatZAR(s.platformRevenueCents, { decimals: false })} sub="Repayment share + accreditation fees" icon={<Wallet className="h-4 w-4" />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Daily approved card volume</h2>
            <span className="text-xs text-muted">Last 30 days</span>
          </div>
          <VolumeChart data={s.dailyVolume} />
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Work queues</h2>
          <div className="divide-y divide-line">
            {queues.map((q) => (
              <Link key={q.href} href={q.href} className="flex items-center justify-between py-2.5 text-sm hover:text-ink">
                <span className={q.n ? 'font-medium' : 'text-muted'}>{q.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 text-xs font-bold ${q.n ? 'bg-brand text-white' : 'bg-surface text-muted'}`}>{q.n}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted" />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/users" label="Users" value={s.users.total} sub={`${s.users.newLast7Days} new this week`} icon={<Users className="h-4 w-4" />} />
        <Stat href="/applications" label="Personal-loan applications" value={s.personalApplications ?? 0} sub="Applications and document review" icon={<Landmark className="h-4 w-4" />} />
        <Stat href="/users" label="Shoppers · Lenders · Affiliates" value={`${s.users.consumers} · ${s.users.lenders} · ${s.users.affiliates}`} />
        <Stat href="/lenders" label="Lender liquidity" value={formatZAR(s.lenderLiquidityCents, { decimals: false })} sub="Uncommitted funds across stalls" icon={<Banknote className="h-4 w-4" />} />
        <Stat
          href="/reports" label="Ledger"
          value={ledger.data ? (ledger.data.balanced ? 'Balanced' : 'OUT OF BALANCE') : '…'}
          sub="Double-entry trial balance"
          icon={<CircleAlert className={`h-4 w-4 ${ledger.data && !ledger.data.balanced ? 'text-red-600' : ''}`} />}
        />
      </div>
    </div>
  );
}
