'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CreditCard, HandCoins, Plus, ReceiptText, ScanLine, Wallet, Zap } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Loading, StatusBadge, useApi, useAuth } from '@xtra/ui';
import { PayModal, TopUpModal } from '@/components/PayModal';
import { InstallBanner } from '@/components/InstallApp';
import { PAY_EVENT } from '@/lib/pay-event';

export default function ConsumerHome() {
  const { me, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const cards = useApi((c) => c.consumer.cards());
  const loans = useApi((c) => c.consumer.loans());
  const applications = useApi((c) => c.consumer.personalApplications());
  const [pay, setPay] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const [payRequested, setPayRequested] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') === '1') {
      setPayRequested(true);
      router.replace('/app');
    }
    const onPay = () => setPayRequested(true);
    window.addEventListener(PAY_EVENT, onPay);
    return () => window.removeEventListener(PAY_EVENT, onPay);
  }, [router]);

  const reloadAll = () => { balance.reload(); loans.reload(); refreshMe(); };
  const b = balance.data;
  const card = cards.data?.[0];
  const kyc = me?.kyc;
  const canPay = !!(card && card.status === 'ACTIVE' && b);
  const requestPay = useCallback(() => setPayRequested(true), []);
  useEffect(() => {
    if (!payRequested || balance.loading || cards.loading) return;
    setPayRequested(false);
    if (canPay) setPay(true);
    else if (kyc?.status !== 'VERIFIED') router.push('/app/kyc');
    else if (card?.status === 'FROZEN') router.push('/app/card');
  }, [payRequested, balance.loading, cards.loading, canPay, kyc?.status, card?.status, router]);

  if (balance.loading && !balance.data) return <Loading />;
  const openLoans = (loans.data ?? []).filter((l) => l.status !== 'SETTLED');
  const nextLoan = openLoans[0];
  const application = applications.data?.[0];
  const QUICK = [
    { label: 'Pay', icon: ScanLine, onClick: requestPay, primary: true },
    { label: 'Top up', icon: Plus, onClick: () => setTopUp(true) },
    { label: 'Bank transfer', icon: Wallet, href: '/app/wallet' },
    { label: 'Get a loan', icon: HandCoins, href: '/app/loans' },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-5">
      {kyc && kyc.status !== 'VERIFIED' && <Alert tone={kyc.status === 'REJECTED' ? 'red' : 'amber'} title={kyc.status === 'PENDING' ? 'Verification in progress' : kyc.status === 'REJECTED' ? 'Verification needs an update' : 'Verify your details to unlock XTRA-CASH'}>
        {kyc.status === 'PENDING' ? 'We’ll notify you when the review is complete.' : kyc.status === 'REJECTED' ? kyc.rejectionReason : 'Complete identity and affordability checks to use your card and see eligible credit offers.'}
        {kyc.status !== 'PENDING' && <Link href="/app/kyc" className="ml-1 font-semibold underline">{kyc.status === 'REJECTED' ? 'Update details' : 'Verify now'} →</Link>}
      </Alert>}

      <section aria-labelledby="balance-heading" className="relative overflow-hidden rounded-3xl bg-brand-purple p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-orange/35 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="text-sm font-medium text-white/75">Sawubona{me?.firstName ? `, ${me.firstName}` : ''}</p><h1 id="balance-heading" className="mt-1 text-lg font-bold">Your XTRA-Balance</h1></div>
          <Link href="/app/activity" aria-label="View account activity" className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><ReceiptText className="h-5 w-5" /></Link>
        </div>
        {b ? <>
          <Link href="/app/activity" aria-label={`Available to spend ${formatZAR(b.xtraBalanceCents)}, view activity`} className="relative mt-5 block w-fit rounded-lg text-4xl font-black tabular-nums tracking-tight hover:underline sm:text-5xl">{formatZAR(b.xtraBalanceCents)}</Link>
          <div className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80"><span className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Wallet {formatZAR(b.walletCents)}</span><span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-brand-orange" /> Credit {formatZAR(b.creditCents)}</span></div>
          {b.reasonIfNone && kyc?.status === 'VERIFIED' && <p className="relative mt-3 text-xs text-white/75">{b.reasonIfNone}</p>}
        </> : <p className="mt-4 text-sm text-white/80">Your current balance is unavailable. Pull down to retry.</p>}
        <div className="relative mt-5 hidden gap-2 sm:flex"><Button variant="accent" onClick={requestPay} disabled={!card || card.status !== 'ACTIVE'}>Pay with XTRA-CASH</Button><Button variant="secondary" onClick={() => setTopUp(true)}> <Plus className="h-4 w-4" /> Top up</Button></div>
      </section>

      <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2 sm:gap-3">
        {QUICK.map((item) => {
          const content = <><span className={`grid h-12 w-12 place-items-center rounded-2xl ${item.primary ? 'bg-brand-purple text-white' : 'border border-line bg-white text-brand-purple'}`}><item.icon className="h-5 w-5" /></span><span className="text-center text-xs font-semibold sm:text-sm">{item.label}</span></>;
          return item.href ? <Link key={item.label} href={item.href} className="pressable flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl hover:bg-brand-soft">{content}</Link> : <button key={item.label} onClick={item.onClick} disabled={!canPay} className="pressable flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl disabled:opacity-50">{content}</button>;
        })}
      </nav>

      <InstallBanner className="sm:hidden" />

      <section aria-label="Your next step" className="grid gap-3 sm:grid-cols-2">
        <Card className="min-w-0 p-4">
          <div className="flex items-center gap-2"><HandCoins className="h-4 w-4 text-brand-purple" /><h2 className="font-bold">Personal loan</h2></div>
          {application ? <><div className="mt-3 flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{formatZAR(application.amountCents)} · {application.termMonths} months</span><StatusBadge status={application.status} /></div><Link href={`/app/applications/${application.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-purple">Track application <ArrowRight className="h-4 w-4" /></Link></> : <><p className="mt-2 text-sm text-muted">Choose the amount and repayment period, then track offers and updates here.</p><Link href="/app/loans" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-purple">View loans <ArrowRight className="h-4 w-4" /></Link></>}
        </Card>

        <Card className="min-w-0 p-4">
          <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-purple" /><h2 className="font-bold">Next repayment</h2></div>
          {nextLoan ? <><div className="mt-3 flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{nextLoan.lenderName}</p><p className="mt-1 text-xs text-muted">{nextLoan.nextDue ? `Due ${new Date(nextLoan.nextDue.dueDate).toLocaleDateString('en-ZA')}` : 'No upcoming instalment'}</p></div><strong className="shrink-0 text-sm tabular-nums">{nextLoan.nextDue ? formatZAR(nextLoan.nextDue.amountCents - nextLoan.nextDue.paidCents) : formatZAR(nextLoan.outstandingCents)}</strong></div><Link href="/app/loans" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-purple">View loan details <ArrowRight className="h-4 w-4" /></Link></> : <><p className="mt-2 text-sm text-muted">No active repayments.</p><Link href="/app/loans" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-purple">Explore loans <ArrowRight className="h-4 w-4" /></Link></>}
        </Card>
      </section>

      <Link href="/app/card" className="pressable flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand-purple"><CreditCard className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Manage your XTRA-CASH card</strong><span className="block text-xs text-muted">View card details, make a payment or freeze your card.</span></span><ArrowRight className="h-4 w-4 shrink-0 text-muted" />
      </Link>
      <TopUpModal open={topUp} onClose={() => setTopUp(false)} onDone={reloadAll} />
      {card && b && <PayModal open={pay} onClose={() => setPay(false)} cardId={card.id} balance={b} onDone={reloadAll} />}
    </div>
  );
}
