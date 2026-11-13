'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Banknote, CreditCard, Gift, Grid2X2, HandCoins, MapPin, Mic, ReceiptText, ShoppingCart, Sparkles } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Logo, Modal, useApi, useAuth } from '@xtra/ui';
import { PAY_EVENT } from '@/lib/pay-event';
import { CustomerBottomNav } from '@/components/CustomerBottomNav';
import { CustomerHeader } from '@/components/CustomerHeader';

export default function ConsumerHome() {
  const { me } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const [notice, setNotice] = useState('');
  const router = useRouter();
  const b = balance.data;
  const name = me?.firstName?.trim() || 'there';
  const initials = `${me?.firstName?.[0] ?? 'X'}${me?.lastName?.[0] ?? ''}`.toUpperCase();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') === '1') {
      router.replace('/app/pay');
    }
    const onPay = () => router.push('/app/pay');
    window.addEventListener(PAY_EVENT, onPay);
    return () => window.removeEventListener(PAY_EVENT, onPay);
  }, [router]);
  const unavailable = (label: string) => setNotice(`${label} is not available yet. You can use your personal-loan, wallet, card and transaction features here.`);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('assistant') === '1') {
      router.replace('/app/assistant');
    }
  }, [router]);

  const shortcuts = [
    { label: 'Get a Loan', icon: HandCoins, href: '/app/loans' },
    { label: 'BNPL Shop Now', icon: ShoppingCart, href: '/app/bnpl' },
    { label: 'Pay Bills', icon: ReceiptText, href: '/app/bills' },
    { label: 'Vouchers & Rewards', icon: Gift, href: '/app/vouchers' },
    { label: 'Nearby Stores', icon: MapPin, href: '/app/bnpl' },
    { label: 'My Card', icon: CreditCard, href: '/app/card' },
    { label: 'Transactions', icon: ArrowRight, href: '/app/activity' },
    { label: 'More', icon: Grid2X2, href: '/app/profile' },
  ];
  const suggestions = [
    { label: '💸 Get a loan', href: '/app/loans', size: 'col-span-2' },
    { label: '🛒 Buy now, pay later', href: '/app/bnpl', size: 'col-span-2' },
    { label: '🧾 Pay a bill', href: '/app/bills', size: 'col-span-2' },
    { label: '📍 Find stores near me', href: '/app/bnpl', size: 'col-span-3' },
    { label: '🎁 Get a voucher', href: '/app/vouchers', size: 'col-span-3' },
  ];

  return <div className="xc-app-theme relative min-h-[100dvh] overflow-hidden bg-[#1b1030] text-white">
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_8%,rgba(166,23,211,.65),transparent_36%),radial-gradient(ellipse_at_95%_70%,rgba(217,31,99,.55),transparent_35%),linear-gradient(165deg,#1b1030_0%,#5c2394_44%,#d91f63_78%,#fb9320_115%)]" />
    <div aria-hidden className="pointer-events-none absolute -right-20 top-56 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute -left-32 bottom-24 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />

    <CustomerHeader />
    <div className="relative mx-auto min-h-[100dvh] w-full max-w-[520px] px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))] pt-2">

      <section className="mt-5 flex items-center gap-3" aria-label="Account overview">
        <div className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full border-[3px] border-white bg-gradient-to-br from-orange-300 via-pink-400 to-purple-700 text-lg font-black text-white shadow-[0_0_18px_rgba(255,95,222,.65)]">{initials}</div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-black leading-tight">Hi {name} <span aria-hidden>👋</span></h1><p className="mt-1 text-sm text-white/85">How can I help you today?</p></div>
        <Link href="/app/loans" className="min-w-[112px] rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-left text-ink shadow-lg shadow-purple-950/25"><span className="block text-[11px] font-medium">Available Credit</span><strong className="mt-0.5 block truncate text-lg font-black leading-tight">{b ? formatZAR(b.creditCents) : 'Check limit'}</strong></Link>
      </section>

      <Link href="/app/assistant" className="group mt-5 flex w-full items-center gap-3 rounded-full border-[3px] border-white bg-gradient-to-r from-[#ecd8f8] via-white to-[#fbe7ee] px-4 py-3 text-left text-[#1b1030] shadow-[0_0_12px_#a617d3,0_0_30px_rgba(217,31,99,.5)] transition active:scale-[.99]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"><Sparkles className="h-5 w-5" /></span><span className="min-w-0 flex-1 truncate text-xl font-bold">Ask XTRA-CASH…</span><Mic className="h-6 w-6 shrink-0 text-[#5c2394]" />
      </Link>

      <nav aria-label="Suggested actions" className="mt-4 grid grid-cols-6 gap-2">
        {suggestions.map(item => item.href ? <Link key={item.label} href={item.href} className={`${item.size} flex min-h-10 items-center justify-center rounded-full border border-white/80 bg-white/95 px-2 text-center text-[11px] font-bold text-ink shadow-md sm:text-xs`}>{item.label}</Link> : <button key={item.label} type="button" onClick={() => unavailable(item.label.replace(/^[^ ]+ /, ''))} className={`${item.size} flex min-h-10 items-center justify-center rounded-full border border-white/80 bg-white/95 px-2 text-center text-[11px] font-bold text-ink shadow-md sm:text-xs`}>{item.label}</button>)}
      </nav>

      <section className="mt-4 rounded-[24px] border border-white/75 bg-gradient-to-br from-white/90 via-[#f3e7f8]/90 to-[#f7dce7]/90 p-3.5 text-ink shadow-[0_8px_28px_rgba(37,0,65,.32)] backdrop-blur" aria-label="XTRA-CASH assistant">
        <div className="flex items-center gap-2"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5c2394] to-[#d91f63] shadow-md"><Logo light markOnly size={30} /></span><div className="min-w-0"><p className="text-sm font-black">XTRA-CASH Assistant</p><p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5c2394]"><span className="h-2 w-2 rounded-full bg-green-500" /> Ready to help</p></div><Sparkles className="ml-auto h-5 w-5 text-fuchsia-600" /></div>
        <p className="ml-12 mt-2 rounded-2xl rounded-tl-md bg-white/95 px-3.5 py-3 text-sm leading-snug text-ink shadow-sm">Hi {name}! 👋 Ask me anything about XTRA-CASH.</p>
      </section>

      <section className="mt-3 grid grid-cols-4 gap-2" aria-label="XTRA-CASH services">
        {shortcuts.map(item => {
          const content = <><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#f3e7f8] to-white text-[#a617d3]"><item.icon className="h-6 w-6" /></span><span className="max-w-full text-center text-[11px] font-bold leading-tight text-ink">{item.label}</span></>;
          return item.href ? <Link key={item.label} href={item.href} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/70 bg-white/95 px-1.5 py-2 text-ink shadow-md shadow-purple-950/20 transition hover:-translate-y-0.5">{content}</Link> : <button key={item.label} type="button" onClick={() => unavailable(item.label)} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/70 bg-white/95 px-1.5 py-2 text-ink shadow-md shadow-purple-950/20 transition hover:-translate-y-0.5">{content}</button>;
        })}
      </section>

      <Link href="/app/loans" className="relative mt-4 flex min-h-[150px] items-center overflow-hidden rounded-[26px] border border-orange-200/70 bg-gradient-to-r from-[#fb9320] via-[#d91f63] to-[#5c2394] p-4 shadow-[0_8px_28px_rgba(35,0,59,.35)]">
        <span aria-hidden className="absolute -bottom-4 -left-4 h-40 w-36 bg-[url('/brand/photo/customer-loan.png')] bg-contain bg-bottom bg-no-repeat opacity-90" />
        <span aria-hidden className="absolute -right-8 -top-12 h-44 w-44 rounded-full bg-yellow-300/50 blur-2xl" />
        <span className="relative z-10 ml-28 min-w-0 flex-1"><strong className="block text-lg font-black italic leading-tight">A personal loan<br />when you need it</strong><span className="mt-2 block text-[11px] font-semibold text-white/95">Choose an amount · review lender offers · track repayments</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-black">Start a request <ArrowRight className="h-4 w-4" /></span></span>
        <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#5c2394] shadow"><ArrowRight className="h-5 w-5" /></span>
      </Link>
    </div>

    <CustomerBottomNav />

    <Modal open={!!notice} title="Service update" onClose={() => setNotice('')}><Alert tone="amber">{notice}</Alert><Button className="mt-4 w-full" onClick={() => setNotice('')}>Got it</Button></Modal>
  </div>;
}
