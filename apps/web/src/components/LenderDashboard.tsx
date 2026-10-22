'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Banknote, FileStack, HandCoins } from 'lucide-react';
import { formatZAR, type LendingProduct } from '@xtra/shared';
import { Alert, Button, Card, Loading, PageHeader, Select, Stat, StatusBadge, useApi } from '@xtra/ui';
import { useLenderPerformance } from './useLenderPerformance';

const labels: Record<LendingProduct, string> = { BNPL: 'BNPL', PERSONAL: 'Personal loans', BUSINESS: 'Business loans', OTHER: 'Other lending' };
const precise = (micros: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(micros / 1000000);

export function LenderDashboard() {
  const org = useApi(c => c.lender.org());
  const [interval, setInterval] = useState(5000);
  const pulse = useLenderPerformance(interval);
  const baseline = useRef<number | null>(null);
  useEffect(() => { if (pulse.data && baseline.current === null) baseline.current = pulse.data.totals.estimatedAccruedMicros; }, [pulse.data]);
  if (!org.data || !pulse.data) return org.error || pulse.error ? <Alert tone="amber" title="Your dashboard is reconnecting">{org.error || pulse.error} {org.error ? <button type="button" className="font-semibold underline" onClick={org.reload}>Try again</button> : 'Your figures will update when the connection returns.'}</Alert> : <Loading />;
  const o = org.data, s = pulse.data, t = s.totals;
  const state = !pulse.visible ? 'Paused' : pulse.error ? 'Reconnecting' : 'Live';
  const change = t.estimatedAccruedMicros - (baseline.current ?? t.estimatedAccruedMicros);
  return <div className="space-y-5">
    <PageHeader title={o.tradingName || o.name} subtitle="Your Credit Mall, at a glance" actions={<StatusBadge status={o.accreditationStatus} />} />
    {o.accreditationStatus !== 'ACCREDITED' && <Alert tone="amber" title="Your stall is not live yet">{o.reviewNotes || 'Complete accreditation to start lending.'} <Link className="font-semibold underline" href="/lender/accreditation">View accreditation</Link></Alert>}
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-purple"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${state === 'Live' ? 'bg-emerald-600' : 'bg-amber-500'}`} />{state} · your estimated return</div>
        <label className="flex items-center gap-2 text-xs text-muted">Refresh<Select aria-label="Dashboard refresh interval" className="h-8 w-auto" value={interval} onChange={e => setInterval(Number(e.target.value))}><option value={5000}>5 seconds</option><option value={10000}>10 seconds</option></Select></label>
      </div>
      <div className="mt-4 font-display text-[clamp(1.5rem,5.5vw,3rem)] font-bold leading-tight tabular-nums text-brand-purple" data-testid="estimated-return">{precise(t.estimatedAccruedMicros)}</div>
      <p className="mt-2 text-sm text-muted">Estimated return to date · before operating costs and tax</p>
      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted">Since opening this dashboard</p><p className="mt-1 font-semibold tabular-nums">{change > 0 ? '+' : ''}{precise(change)}</p></div>
        <div><p className="text-xs text-muted">Estimated daily pace</p><p className="mt-1 font-semibold">{formatZAR(Math.round(t.estimatedDailyMicros / 10000))}</p></div>
        <div><p className="text-xs text-muted">Realised return · settled loans</p><p className="mt-1 font-semibold">{formatZAR(t.realizedReturnCents)}</p></div>
      </div>
      <p className="mt-4 text-xs text-muted">A time-based estimate from funded loans and current platform fees. Extra decimals show movement below one cent. It is not cash received or a guaranteed return. Overdue loans stop accruing in this view.</p>
      <p className="mt-2 text-xs text-muted">Updated {new Date(s.asOf).toLocaleTimeString('en-ZA')}{pulse.error ? ' · Keeping your last successful figures while reconnecting.' : ''}</p>
    </Card>
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat href="/lender/funds" label="Available to lend" value={formatZAR(s.availableCents)} icon={<Banknote className="h-4 w-4" />} />
      <Stat href="/lender/loans" label="Outstanding book" value={formatZAR(s.outstandingCents)} sub={`${s.activeLoans} active loans`} icon={<FileStack className="h-4 w-4" />} />
      <Stat href="/lender/loans" label="Net cash received" value={formatZAR(t.netReceivedCents)} sub="Includes capital repaid; after platform deductions" icon={<HandCoins className="h-4 w-4" />} />
    </div>
    <Card>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Your lending streams</h2><Link href="/lender/loans" className="text-sm font-semibold text-brand-purple underline">View loan book</Link></div>
      <div className="divide-y divide-line">{s.models.filter(m => m.product !== 'OTHER' || m.fundedLoans > 0).map(m => <Link key={m.product} href={m.product === 'OTHER' ? '/lender/loans' : `/lender/loans?product=${m.product}`} className="flex items-center justify-between gap-3 rounded-lg py-4 focus-visible:outline-2 focus-visible:outline-brand-purple">
        <div><div className="font-semibold">{labels[m.product]}</div><p className="mt-1 text-xs text-muted">{m.fundedLoans ? `${m.activeLoans} active · ${formatZAR(m.netReceivedCents)} received` : 'No funded loans yet'}</p></div>
        <div className="flex items-center gap-2"><div className="text-right"><div className="font-semibold tabular-nums">{formatZAR(Math.round(m.estimatedAccruedMicros / 10000))}</div><div className="text-xs text-muted">estimated return</div></div><ArrowUpRight aria-hidden="true" className="h-4 w-4 text-muted" /></div>
      </Link>)}</div>
      <p className="mt-2 text-xs text-muted">Applications contribute only after a loan is funded. A stream with no funded loans stays at zero.</p>
    </Card>
    {(s.loansInArrears > 0 || s.pendingApplications > 0) && <div className="flex flex-wrap gap-4 rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold">{s.loansInArrears > 0 && <Link href="/lender/loans?status=IN_ARREARS" className="underline">{s.loansInArrears} {s.loansInArrears === 1 ? 'loan needs' : 'loans need'} attention</Link>}{s.pendingApplications > 0 && <Link href="/lender/applications" className="underline">{s.pendingApplications} {s.pendingApplications === 1 ? 'application' : 'applications'} to review</Link>}</div>}
    <div className="flex flex-wrap gap-2"><Link href="/lender/funds"><Button variant="accent">Load funds</Button></Link><Link href="/lender/offers"><Button variant="secondary">Manage offers · {s.activeOffers} live</Button></Link></div>
  </div>;
}
