'use client';
import Link from 'next/link';
import { ArrowRight, Banknote, CircleAlert, CreditCard, FileStack, Landmark, TrendingUp, Users, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Card, Loading, PageHeader, RecordActions, Stat, StatusBadge, useApi, useToast, useClient } from '@xtra/ui';
import { VolumeChart } from '@/components/VolumeChart';

export default function Dashboard() {
  const stats = useApi((c) => c.admin.stats());
  const ledger = useApi((c) => c.request<{ balanced: boolean; trialBalanceCents: number }>('GET', '/admin/ledger/check'));
  const client = useClient();
  const toast = useToast();
  if (!stats.data) return <Loading />;
  const s = stats.data;
  const queues = [
    { label: 'KYC reviews', n: s.kycPending, href: '/kyc' },
    { label: 'Lender accreditations', n: s.lendersPendingReview, href: '/lenders' },
    { label: 'Funding confirmations', n: s.fundingPending, href: '/funding' },
    { label: 'Affiliate commissions', n: s.commissionsPending, href: '/affiliates' },
    { label: 'Affiliate payouts', n: s.payoutsPending, href: '/affiliates?tab=payouts' },
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Platform overview" subtitle="Key activity and the next work waiting across XTRA-CASH." actions={<RecordActions label="Dashboard actions" actions={[{ label: 'Run arrears check', onSelect: async () => { const r = await client.admin.runArrearsJob(); toast(`Arrears check: ${r.overdueInstallments} installments overdue, ${r.loansInArrears} loans flagged`); stats.reload(); } }]} />} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat href="/applications" label="Personal-loan applications" value={s.personalApplications ?? 0} sub="Open the application queue" icon={<FileStack className="h-4 w-4 text-brand-purple" />} />
        <Stat href="/transactions" label="Approved card volume · 30 days" value={formatZAR(s.transactions.last30DaysVolumeCents, { decimals: false })} sub={`${s.transactions.last30DaysCount} approved transactions`} icon={<CreditCard className="h-4 w-4 text-brand-purple" />} />
        <Stat href="/loans" label="Outstanding loan book" value={formatZAR(s.loans.outstandingCents, { decimals: false })} sub={`${s.loans.active} active · ${s.loans.inArrears} in arrears`} icon={<Landmark className="h-4 w-4 text-brand-purple" />} />
        <Stat href="/reports" label="Platform revenue" value={formatZAR(s.platformRevenueCents, { decimals: false })} sub="Repayment share + accreditation fees" icon={<Wallet className="h-4 w-4 text-brand-purple" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3"><div><h2 className="font-bold">Approved card volume</h2><p className="text-xs text-muted">Daily · last 30 days</p></div><Link href="/transactions" className="whitespace-nowrap text-xs font-semibold text-brand-purple">View activity <ArrowRight className="inline h-3.5 w-3.5" /></Link></div>
          <VolumeChart data={s.dailyVolume} />
        </Card>
        <Card className="space-y-2 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Work queues</h2><p className="text-xs text-muted">Items requiring staff action</p></div><StatusBadge status={`${queues.reduce((n, q) => n + q.n, 0)} OPEN`} /></div>
          <div className="divide-y divide-line">
            {queues.map((q) => <Link key={q.href} href={q.href} className="flex min-h-11 items-center gap-3 py-2 text-sm hover:text-brand-purple"><span className="min-w-0 flex-1 truncate">{q.label}</span><span className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold ${q.n ? 'bg-brand-soft text-brand-purple' : 'bg-surface text-muted'}`}>{q.n}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" /></Link>)}
          </div>
        </Card>
      </div>

      <section aria-label="Platform pulse" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/users" className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"><Users className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">Users</span><strong>{s.users.total}</strong><span className="text-xs text-muted">+{s.users.newLast7Days} this week</span></Link>
        <Link href="/lenders" className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"><Banknote className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">Lender liquidity</span><strong>{formatZAR(s.lenderLiquidityCents, { decimals: false })}</strong></Link>
        <Link href="/transactions" className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"><TrendingUp className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">Credit used · 30 days</span><strong>{formatZAR(s.transactions.last30DaysCreditCents, { decimals: false })}</strong></Link>
        <Link href="/reports" className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"><CircleAlert className={`h-4 w-4 ${ledger.data && !ledger.data.balanced ? 'text-red-600' : 'text-muted'}`} /><span className="min-w-0 flex-1 truncate">Double-entry ledger</span><StatusBadge status={ledger.data ? (ledger.data.balanced ? 'BALANCED' : 'OUT_OF_BALANCE') : 'CHECKING'} /></Link>
      </section>
      {ledger.error && <Alert tone="amber" title="Ledger status unavailable">The dashboard could not retrieve the latest ledger check. Open Revenue & ledger and retry.</Alert>}
    </div>
  );
}
