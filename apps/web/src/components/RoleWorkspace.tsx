'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatZAR, type Role } from '@xtra/shared';
import { useApi } from '@xtra/ui';
import { ADMIN_URL } from '@/lib/config';
import { useLenderPerformance } from './useLenderPerformance';

export function WorkspaceLinks({ roles }: { roles: Role[] }) {
  const workspaces = [
    { label: 'Back office', href: ADMIN_URL, allowed: roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') },
    { label: 'Lender portal', href: '/lender', allowed: roles.includes('LENDER') },
    { label: 'Affiliate portal', href: '/affiliate', allowed: roles.includes('AFFILIATE') },
    { label: 'XTRA Payday', href: '/team', allowed: roles.includes('SALES_REP') },
  ].filter(workspace => workspace.allowed);
  if (!workspaces.length) return null;
  return <nav aria-label="Switch workspace" className="mt-3 flex flex-wrap gap-2">
    {workspaces.map(({ label, href }) => <Link key={href} href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-bold text-[#5c2394] shadow-sm">
      {label}<ArrowUpRight className="h-4 w-4" aria-hidden />
    </Link>)}
  </nav>;
}

function Metrics({ title, values, message }: { title: string; values: [string, string | number][]; message?: string }) {
  return <section aria-label={title} className="mt-3 rounded-[24px] border border-white/80 bg-[#fff7ff] p-4 text-[#1b1030] shadow-lg">
    <h2 className="font-black">{title}</h2>
    {values.length > 0 && <dl className="mt-2 grid grid-cols-2 gap-2">
      {values.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-[#f4e5ff] p-2.5">
        <dt className="text-xs font-semibold text-[#592e74]">{label}</dt>
        <dd className="break-words text-base font-black tabular-nums">{value}</dd>
      </div>)}
    </dl>}
    {message && <p className="mt-2 text-xs text-[#592e74]">{message}</p>}
  </section>;
}

function LenderHome() {
  const { data, error } = useLenderPerformance(5000);
  return <Metrics title="Lender portfolio" values={data ? [
    ['Outstanding principal', formatZAR(data.outstandingCents)],
    ['Repaid to date', formatZAR(data.totalRepaidCents)],
    ['Realised return', formatZAR(data.totals.realizedReturnCents)],
    ['Accrued return (estimated)', formatZAR(Math.round(data.totals.estimatedAccruedMicros / 10000))],
  ] : []} message={error ? 'Portfolio refresh unavailable. Figures show the last successful update.' : data ? 'Updates every 5 seconds while open.' : 'Loading your portfolio…'} />;
}

function AdminHome() {
  const { data, error } = useApi(c => c.admin.stats());
  return <Metrics title="Platform operations" values={data ? [
    ['Identity reviews', data.kycPending],
    ['Lenders to review', data.lendersPendingReview],
    ['Funding requests', data.fundingPending],
    ['Payouts pending', data.payoutsPending],
  ] : []} message={error ? 'Operational figures are unavailable.' : data ? undefined : 'Loading operations…'} />;
}

function AffiliateHome() {
  const { data, error } = useApi(c => c.affiliate.summary());
  return <Metrics title="Affiliate activity" values={data ? [
    ['Referrals', data.referrals],
    ['Commission balance', formatZAR(data.commissionBalanceCents)],
  ] : []} message={error ? 'Affiliate figures are unavailable.' : data ? undefined : 'Loading activity…'} />;
}

export function RoleHome({ roles }: { roles: Role[] }) {
  const admin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const lender = roles.includes('LENDER');
  return <>
    {admin && <AdminHome />}
    {lender && <LenderHome />}
    {!admin && !lender && roles.includes('AFFILIATE') && <AffiliateHome />}
    <WorkspaceLinks roles={roles} />
  </>;
}
