'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, HandCoins, Plus, ReceiptText, ScanLine, ShieldCheck, Sparkles, Wallet, Zap } from 'lucide-react';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { Alert, Badge, Button, Card, Loading, SecuritySettings, Stat, StatusBadge, useApi, useAuth } from '@xtra/ui';
import { PayModal, TopUpModal } from '@/components/PayModal';
import { InstallBanner } from '@/components/InstallApp';
import { PAY_EVENT } from '@/lib/pay-event';

export default function ConsumerHome() {
  const { me, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const cards = useApi((c) => c.consumer.cards());
  const loans = useApi((c) => c.consumer.loans());
  const applications = useApi(c => c.consumer.personalApplications());
  const [pay, setPay] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [payRequested, setPayRequested] = useState(false);
  const router = useRouter();

  // Pay from the tab bar (PAY_EVENT) or the home-screen shortcut (/app?pay=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') === '1') {
      setPayRequested(true);
      router.replace('/app');
    }
    const onPay = () => setPayRequested(true);
    window.addEventListener(PAY_EVENT, onPay);
    return () => window.removeEventListener(PAY_EVENT, onPay);
  }, [router]);

  const reloadAll = () => {
    balance.reload();
    loans.reload();
    refreshMe();
  };

  const b = balance.data;
  const card = cards.data?.[0];
  const kyc = me?.kyc;
  const canPay = !!(card && card.status === 'ACTIVE' && b);
  const requestPay = useCallback(() => setPayRequested(true), []);
  // Once the balance and card have loaded, open the payment sheet, or send the shopper to finish KYC first.
  useEffect(() => {
    if (!payRequested || balance.loading || cards.loading) return;
    setPayRequested(false);
    if (canPay) setPay(true);
    else if (kyc?.status !== 'VERIFIED') router.push('/app/kyc');
    else if (card?.status === 'FROZEN') router.push('/app/card');
  }, [payRequested, balance.loading, cards.loading, canPay, kyc?.status, card?.status, router]);

  if (balance.loading && !balance.data) return <Loading />;
  const openLoans = (loans.data ?? []).filter((l) => l.status !== 'SETTLED');
  const QUICK = [
    { label: 'Pay', icon: ScanLine, onClick: requestPay, primary: true },
    { label: 'Top up', icon: Plus, onClick: () => setTopUp(true) },
    { label: 'Activity', icon: ReceiptText, href: '/app/activity' },
    { label: 'Loan', icon: HandCoins, href: '/app/personal-loan' },
  ];

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="order-1 hidden md:block">
        <div className="text-sm text-muted">Sawubona{me?.firstName ? `, ${me.firstName}` : ''}</div>
        <h1 className="text-2xl font-bold">Your XTRA-Balance</h1>
      </div>

      {kyc && kyc.status !== 'VERIFIED' && (
        <div className="order-2"><Alert tone={kyc?.status === 'REJECTED' ? 'red' : 'amber'} title={kyc?.status === 'PENDING' ? 'Verification in progress' : kyc?.status === 'REJECTED' ? 'Verification unsuccessful' : 'Unlock XTRA-CASH credit'}>
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
        </Alert></div>
      )}

      <section className="relative order-7 overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white md:order-3">
        <div className="flex flex-wrap items-center justify-between gap-5"><div><span className="text-xs font-bold uppercase tracking-widest text-white/75">Beyond BNPL</span><h2 className="mt-2 text-2xl font-black">Need a personal loan?</h2><p className="mt-2 max-w-lg text-sm text-white/80">Apply one question at a time. View your progress and see matched lenders after KYC and FICA review.</p></div><Link href="/app/personal-loan"><Button variant="secondary" size="lg">Apply for a loan <ArrowRight className="h-4 w-4" /></Button></Link></div>
      </section>
      <div className="order-9 md:order-4"><SecuritySettings compact /></div>
      <div className="order-8 grid gap-3 sm:grid-cols-3 md:order-5"><Stat href="/app/personal-loan" label="Loan applications" value={applications.data?.length ?? '…'} sub="Latest personal-loan requests" /><Stat href="/app/loans" label="Open advances" value={openLoans.length} sub="View repayment details" /><Stat href="#matched-offers" label="BNPL matches" value={b?.offers.length ?? 0} sub="View matched card-credit offers" /></div>

      {b && (
        <div className="relative order-3 overflow-hidden rounded-3xl bg-ink p-6 text-white md:order-6">
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
            <div className="hidden gap-2 md:flex">
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

      {/* Phones: one-tap actions under the balance, like a banking app. */}
      <div className="order-4 grid grid-cols-4 gap-2 md:hidden">
        {QUICK.map((q) => {
          const inner = (
            <>
              <span className={q.primary ? 'grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-md shadow-brand/30' : 'grid h-14 w-14 place-items-center rounded-2xl border border-line bg-white text-ink'}>
                <q.icon className="h-6 w-6" />
              </span>
              <span className="text-xs font-semibold text-ink">{q.label}</span>
            </>
          );
          return q.href ? (
            <Link key={q.label} href={q.href} className="pressable flex flex-col items-center gap-1.5">{inner}</Link>
          ) : (
            <button key={q.label} onClick={q.onClick} className="pressable flex flex-col items-center gap-1.5">{inner}</button>
          );
        })}
      </div>
      <InstallBanner className="order-5 md:hidden" />

      <div className="order-6 grid gap-6 md:order-7 md:grid-cols-5">
        <div className="order-2 space-y-3 md:order-1 md:col-span-3">
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

        <div className="order-1 space-y-3 md:order-2 md:col-span-2">
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
