'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Plus, ShieldCheck, Sparkles, Wallet, Zap } from 'lucide-react';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { Alert, Badge, Button, Card, Loading, SecuritySettings, Stat, StatusBadge, useApi, useAuth } from '@xtra/ui';
import { PayModal, TopUpModal } from '@/components/PayModal';

export default function ConsumerHome() {
  const { me, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const cards = useApi((c) => c.consumer.cards());
  const loans = useApi((c) => c.consumer.loans());
  const applications = useApi(c => c.consumer.personalApplications());
  const [pay, setPay] = useState(false);
  const [topUp, setTopUp] = useState(false);

  const reloadAll = () => {
    balance.reload();
    loans.reload();
    refreshMe();
  };

  if (balance.loading && !balance.data) return <Loading />;
  const b = balance.data;
  const card = cards.data?.[0];
  const kyc = me?.kyc;
  const openLoans = (loans.data ?? []).filter((l) => l.status !== 'SETTLED');

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-muted">Sawubona{me?.firstName ? `, ${me.firstName}` : ''}</div>
        <h1 className="text-2xl font-bold">Your XTRA-Balance</h1>
      </div>

      {kyc && kyc.status !== 'VERIFIED' && (
        <Alert tone={kyc?.status === 'REJECTED' ? 'red' : 'amber'} title={kyc?.status === 'PENDING' ? 'Verification in progress' : kyc?.status === 'REJECTED' ? 'Verification unsuccessful' : 'Unlock XTRA-CASH credit'}>
          {kyc?.status === 'PENDING'
            ? 'We are reviewing your details. You will be notified once approved.'
            : kyc?.status === 'REJECTED'
              ? kyc.rejectionReason
              : 'Verify your ID, income and expenses (takes 2 minutes) to get your card and matched credit offers.'}
          {kyc?.status !== 'PENDING' && (
            <div className="mt-2">
              <Link href="/app/kyc" className="font-semibold underline">
                {kyc ? 'Update details' : 'Verify now'} →
              </Link>
            </div>
          )}
        </Alert>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-5"><div><span className="text-xs font-bold uppercase tracking-widest text-white/75">Beyond BNPL</span><h2 className="mt-2 text-2xl font-black">Need a personal loan?</h2><p className="mt-2 max-w-lg text-sm text-white/80">Apply one question at a time. View your progress and see matched lenders after KYC and FICA review.</p></div><Link href="/app/personal-loan"><Button variant="secondary" size="lg">Apply for a loan <ArrowRight className="h-4 w-4" /></Button></Link></div>
      </section>
      <SecuritySettings compact />
      <div className="grid gap-3 sm:grid-cols-3"><Stat href="/app/personal-loan" label="Loan applications" value={applications.data?.length ?? '…'} sub="Latest personal-loan requests" /><Stat href="/app/loans" label="Open advances" value={openLoans.length} sub="View repayment details" /><Stat href="#matched-offers" label="BNPL matches" value={b?.offers.length ?? 0} sub="View matched card-credit offers" /></div>

      {b && (
        <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-sm text-white/60">Available to spend now</div>
              <Link href="/app/activity" aria-label="View balance activity" className="mt-1 block rounded-lg text-4xl font-black tabular-nums tracking-tight hover:underline focus-visible:ring-2 sm:text-5xl">{formatZAR(b.xtraBalanceCents)}</Link>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-white/60" /> Wallet {formatZAR(b.walletCents)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-brand-orange" /> XTRA-CASH credit {formatZAR(b.creditCents)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="accent" size="lg" onClick={() => setPay(true)} disabled={!card || card.status !== 'ACTIVE'}>
                Pay
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setTopUp(true)}>
                <Plus className="h-4 w-4" /> Top up
              </Button>
            </div>
          </div>
          {b.reasonIfNone && kyc?.status === 'VERIFIED' && <div className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-sm text-white/80">{b.reasonIfNone}</div>}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-3 md:col-span-3">
          <div className="flex items-center justify-between">
            <h2 id="matched-offers" className="scroll-mt-20 font-bold">Your matched lender offers</h2>
            <Badge tone="brand">
              <Sparkles className="mr-1 h-3 w-3" /> {b?.offers.length ?? 0} match{b?.offers.length === 1 ? '' : 'es'}
            </Badge>
          </div>
          {b?.offers.length ? (
            b.offers.map((o, i) => (
              <Card key={o.offerId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {o.offerName} {i === 0 && <Badge tone="green">Lowest cost</Badge>}
                    </div>
                    <div className="text-sm text-muted">{o.lenderName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums">{formatZAR(o.availableCents)}</div>
                    <div className="text-xs text-muted">available</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{bpsToPercent(o.monthlyInterestRateBps)} p/m interest</span>
                  <span>{o.termMonths} months</span>
                  <span>Initiation {formatZAR(o.initiationFeeCents)}</span>
                  <span>Service {formatZAR(o.monthlyServiceFeeCents)}/m</span>
                </div>
                {o.exampleQuote && (
                  <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">
                    Borrow {formatZAR(o.exampleQuote.principalCents)} → {o.termMonths} × {formatZAR(o.exampleQuote.monthlyInstallmentCents)} (total {formatZAR(o.exampleQuote.totalRepayableCents)})
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Card className="text-sm text-muted">{b?.reasonIfNone ?? 'No offers yet.'}</Card>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-4 w-4" /> When you pay, the cheapest matching offer is used first. We cap installments at what you can afford.
          </p>
        </div>

        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Upcoming repayments</h2>
            <Link href="/app/loans" className="text-sm font-medium text-muted hover:text-ink">
              All <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          </div>
          {openLoans.length ? (
            openLoans.slice(0, 4).map((l) => (
              <Link key={l.id} href={`/app/loans/${l.id}`}>
                <Card className="mb-3 p-4 transition hover:border-ink/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-semibold">{l.lenderName}</div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="min-w-0 text-xs text-muted">
                      Next: {l.nextDue ? `${formatZAR(l.nextDue.amountCents - l.nextDue.paidCents)} on ${new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}` : '—'}
                    </div>
                    <div className="shrink-0 text-sm font-bold tabular-nums">{formatZAR(l.outstandingCents)}</div>
                  </div>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="text-sm text-muted">No repayments due. Nice!</Card>
          )}
        </div>
      </div>

      {card && b && <PayModal open={pay} onClose={() => setPay(false)} cardId={card.id} balance={b} onDone={reloadAll} />}
      <TopUpModal open={topUp} onClose={() => setTopUp(false)} onDone={reloadAll} />
    </div>
  );
}
