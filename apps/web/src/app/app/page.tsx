'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Banknote, CreditCard, Gift, Grid2X2, HandCoins, House, MapPin, Menu, Mic, ReceiptText, ScanLine, ShoppingCart, Sparkles, X } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Logo, Modal, useApi, useAuth, LoanActionCentre } from '@xtra/ui';
import { PayModal, TopUpModal } from '@/components/PayModal';
import { PAY_EVENT } from '@/lib/pay-event';

type ChatMessage = { role: 'assistant' | 'user'; text: string; action?: { label: string; href: string } };

export default function ConsumerHome() {
  const { me, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const cards = useApi((c) => c.consumer.cards());
  const [pay, setPay] = useState(false), [topUp, setTopUp] = useState(false), [payRequested, setPayRequested] = useState(false);
  const [chatOpen, setChatOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [reply, setReply] = useState(''), [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const router = useRouter();
  const b = balance.data, card = cards.data?.[0], kyc = me?.kyc;
  const canPay = !!(card && card.status === 'ACTIVE' && b);
  const name = me?.firstName?.trim() || 'there';
  const initials = `${me?.firstName?.[0] ?? 'X'}${me?.lastName?.[0] ?? ''}`.toUpperCase();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') === '1') {
      setPayRequested(true);
      router.replace('/app');
    }
    const onPay = () => setPayRequested(true);
    window.addEventListener(PAY_EVENT, onPay);
    return () => window.removeEventListener(PAY_EVENT, onPay);
  }, [router]);
  useEffect(() => {
    if (!payRequested || balance.loading || cards.loading) return;
    setPayRequested(false);
    if (canPay) setPay(true);
    else if (kyc?.status !== 'VERIFIED') router.push('/app/kyc');
    else if (card?.status === 'FROZEN') router.push('/app/card');
    else setNotice('Your XTRA-CASH card is not ready for payments yet. Open My Card to check its status.');
  }, [payRequested, balance.loading, cards.loading, canPay, kyc?.status, card?.status, router]);

  const reloadAll = () => { balance.reload(); refreshMe(); };
  const requestPay = useCallback(() => setPayRequested(true), []);
  const unavailable = (label: string) => setNotice(`${label} is not available yet. You can use your personal-loan, wallet, card and transaction features here.`);
  const openChat = () => {
    if (!messages.length) setMessages([{ role: 'assistant', text: `Hi ${name}! 👋 I can help you request a personal loan, check your balance, manage your card or view transactions. What would you like to do?` }]);
    setChatOpen(true);
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('assistant') === '1') {
      openChat();
      router.replace('/app');
    }
  // The query is a one-time navigation intent from the shared app menu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = reply.trim();
    if (!text) return;
    const query = text.toLowerCase();
    let answer = 'I can help with your loan request, wallet, card or account activity. Choose one of the actions below.';
    let action: ChatMessage['action'] = { label: 'Get a loan', href: '/app/loans' };
    if (query.includes('balance') || query.includes('wallet') || query.includes('money')) { answer = `Open your wallet to view your available cash${b ? ` (${formatZAR(b.walletCents)})` : ''} and transfer status.`; action = { label: 'Open wallet', href: '/app/wallet' }; }
    else if (query.includes('card') || query.includes('pay')) { answer = 'You can view your XTRA-CASH card, make a payment or freeze it from the card screen.'; action = { label: 'Open my card', href: '/app/card' }; }
    else if (query.includes('transaction') || query.includes('activity')) { answer = 'Your latest card payments and account activity are available here.'; action = { label: 'View activity', href: '/app/activity' }; }
    else if (query.includes('bill')) { answer = 'Open the bill payment journey to choose a biller and review your payment details.'; action = { label: 'Pay a bill', href: '/app/bills' }; }
    else if (query.includes('voucher')) { answer = 'Explore vouchers and partner rewards in the vouchers hub.'; action = { label: 'View vouchers', href: '/app/vouchers' }; }
    else if (query.includes('store') || query.includes('bnpl') || query.includes('buy now')) { answer = 'Explore participating merchants and shop-now-pay-later options.'; action = { label: 'Explore stores', href: '/app/bnpl' }; }
    else if (query.includes('payroll') || query.includes('salary')) { answer = 'Open your salary and payroll area to review employer-linked services.'; action = { label: 'Open payroll', href: '/app/payroll' }; }
    else if (query.includes('loan') || query.includes('borrow') || query.includes('credit')) { answer = 'Start a personal-loan request by choosing an amount and repayment period. Lenders review requests and send offers for you to consider.'; action = { label: 'Get a loan', href: '/app/loans' }; }
    setMessages(all => [...all, { role: 'user', text }, { role: 'assistant', text: answer, action }]);
    setReply('');
  }

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

    <div className="relative mx-auto min-h-[100dvh] w-full max-w-[520px] px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))] pt-[calc(.5rem+env(safe-area-inset-top,0px))]">
      <header className="flex h-12 items-center justify-between gap-2">
        <button type="button" aria-label="Open app menu" onClick={() => setMenuOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-xl text-white hover:bg-white/10"><Menu className="h-6 w-6" /><span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#1b1030]" /></button>
        <Link href="/app" aria-label="XTRA-CASH home" className="flex-1 text-center"><Logo light size={30} className="mx-auto" /></Link>
        <LoanActionCentre variant="immersive" />
      </header>

      <section className="mt-5 flex items-center gap-3" aria-label="Account overview">
        <div className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full border-[3px] border-white bg-gradient-to-br from-orange-300 via-pink-400 to-purple-700 text-lg font-black text-white shadow-[0_0_18px_rgba(255,95,222,.65)]">{initials}</div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-black leading-tight">Hi {name} <span aria-hidden>👋</span></h1><p className="mt-1 text-sm text-white/85">How can I help you today?</p></div>
        <Link href="/app/loans" className="min-w-[112px] rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-left text-ink shadow-lg shadow-purple-950/25"><span className="block text-[11px] font-medium">Available Credit</span><strong className="mt-0.5 block truncate text-lg font-black leading-tight">{b ? formatZAR(b.creditCents) : 'Check limit'}</strong></Link>
      </section>

      <button type="button" onClick={openChat} className="group mt-5 flex w-full items-center gap-3 rounded-full border-[3px] border-white bg-gradient-to-r from-[#ecd8f8] via-white to-[#fbe7ee] px-4 py-3 text-left text-[#1b1030] shadow-[0_0_12px_#a617d3,0_0_30px_rgba(217,31,99,.5)] transition active:scale-[.99]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"><Sparkles className="h-5 w-5" /></span><span className="min-w-0 flex-1 truncate text-xl font-bold">Ask XTRA-CASH…</span><Mic className="h-6 w-6 shrink-0 text-[#5c2394]" />
      </button>

      <nav aria-label="Suggested actions" className="mt-4 grid grid-cols-6 gap-2">
        {suggestions.map(item => item.href ? <Link key={item.label} href={item.href} className={`${item.size} flex min-h-10 items-center justify-center rounded-full border border-white/80 bg-white/95 px-2 text-center text-[11px] font-bold text-ink shadow-md sm:text-xs`}>{item.label}</Link> : <button key={item.label} type="button" onClick={() => unavailable(item.label.replace(/^[^ ]+ /, ''))} className={`${item.size} flex min-h-10 items-center justify-center rounded-full border border-white/80 bg-white/95 px-2 text-center text-[11px] font-bold text-ink shadow-md sm:text-xs`}>{item.label}</button>)}
      </nav>

      <section className="mt-4 rounded-[24px] border border-white/75 bg-gradient-to-br from-white/90 via-[#f3e7f8]/90 to-[#f7dce7]/90 p-3.5 text-ink shadow-[0_8px_28px_rgba(37,0,65,.32)] backdrop-blur" aria-label="XTRA-CASH assistant">
        <div className="flex items-center gap-2"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5c2394] to-[#d91f63] shadow-md"><Logo light markOnly size={30} /></span><div className="min-w-0"><p className="text-sm font-black">XTRA-CASH Assistant</p><p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5c2394]"><span className="h-2 w-2 rounded-full bg-green-500" /> Ready to help</p></div><Sparkles className="ml-auto h-5 w-5 text-fuchsia-600" /></div>
        <p className="ml-12 mt-2 rounded-2xl rounded-tl-md bg-white/95 px-3.5 py-3 text-sm leading-snug text-ink shadow-sm">Hi {name}! 👋 You can ask me about personal loans, your balance, card or account activity. What would you like to do?</p>
      </section>

      <section className="mt-3 grid grid-cols-4 gap-2" aria-label="XTRA-CASH services">
        {shortcuts.map(item => {
          const content = <><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#f3e7f8] to-white text-[#a617d3]"><item.icon className="h-6 w-6" /></span><span className="max-w-full text-center text-[11px] font-bold leading-tight text-ink">{item.label}</span></>;
          return item.href ? <Link key={item.label} href={item.href} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/70 bg-white/95 px-1.5 py-2 text-ink shadow-md shadow-purple-950/20 transition hover:-translate-y-0.5">{content}</Link> : <button key={item.label} type="button" onClick={() => unavailable(item.label)} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/70 bg-white/95 px-1.5 py-2 text-ink shadow-md shadow-purple-950/20 transition hover:-translate-y-0.5">{content}</button>;
        })}
      </section>

      <Link href="/app/loans" className="relative mt-4 flex min-h-[150px] items-center overflow-hidden rounded-[26px] border border-orange-200/70 bg-gradient-to-r from-[#fb9320] via-[#d91f63] to-[#5c2394] p-4 shadow-[0_8px_28px_rgba(35,0,59,.35)]">
        <span aria-hidden className="absolute inset-0 bg-[url('/brand/fire-poster.jpg')] bg-cover bg-center opacity-25 mix-blend-screen" />
        <span aria-hidden className="absolute -right-8 -top-12 h-44 w-44 rounded-full bg-yellow-300/50 blur-2xl" />
        <span className="relative z-10 grid h-20 w-20 shrink-0 place-items-center rounded-full border border-white/60 bg-white/15 shadow-inner"><Banknote className="h-12 w-12 text-yellow-200 drop-shadow" /></span>
        <span className="relative z-10 ml-3 min-w-0 flex-1"><strong className="block text-lg font-black italic leading-tight">A personal loan<br />when you need it</strong><span className="mt-2 block text-[11px] font-semibold text-white/95">Choose an amount · review lender offers · track repayments</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-black">Start a request <ArrowRight className="h-4 w-4" /></span></span>
        <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#5c2394] shadow"><ArrowRight className="h-5 w-5" /></span>
      </Link>
    </div>

    <nav aria-label="Home navigation" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/95 text-[#1b1030] shadow-[0_-8px_30px_rgba(30,0,50,.28)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end px-1">
        <Link href="/app" aria-current="page" className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-[#5c2394]"><span className="grid h-7 w-10 place-items-center"><House className="h-5 w-5 fill-current" /></span><span className="text-[11px] font-bold">Home</span></Link>
        <Link href="/app/loans" className="flex min-h-16 flex-col items-center justify-center gap-0.5"><Banknote className="h-6 w-6" /><span className="text-[11px] font-semibold">Loans</span></Link>
        <button type="button" aria-label="Open XTRA-CASH Assistant" onClick={openChat} className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></button>
        <button type="button" onClick={requestPay} className="flex min-h-16 flex-col items-center justify-center gap-0.5"><ScanLine className="h-6 w-6" /><span className="text-[11px] font-semibold">Pay</span></button>
        <Link href="/app/profile" className="flex min-h-16 flex-col items-center justify-center gap-0.5"><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#5c2394] text-[11px] font-bold">{initials}</span><span className="text-[11px] font-semibold">Profile</span></Link>
      </div>
    </nav>

    <Modal open={chatOpen} title="✦ XTRA-CASH Assistant" onClose={() => setChatOpen(false)}>
      <div className="space-y-3">
        <div className="max-h-[48dvh] space-y-3 overflow-y-auto rounded-2xl bg-gradient-to-b from-[#fdf8ff] to-[#f3e7f8] p-3" role="log" aria-live="polite" aria-label="Assistant conversation">
          {messages.map((m, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm ${m.role === 'user' ? 'ml-auto rounded-br-sm bg-gradient-to-r from-[#5c2394] to-[#d91f63] text-white' : 'rounded-bl-sm border border-purple-100 bg-white text-ink shadow-sm'}`}><p>{m.text}</p>{m.action && <Link href={m.action.href} onClick={() => setChatOpen(false)} className="mt-2 inline-flex items-center gap-1 font-bold text-[#5c2394] underline">{m.action.label}<ArrowRight className="h-4 w-4" /></Link>}</div>)}
        </div>
        <div className="flex flex-wrap gap-2">{[{ label: 'Get a loan', href: '/app/loans' }, { label: 'My card', href: '/app/card' }, { label: 'My balance', href: '/app/wallet' }].map(x => <Link key={x.href} href={x.href} onClick={() => setChatOpen(false)} className="rounded-full border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-[#5c2394]">{x.label}</Link>)}</div>
        <form onSubmit={sendMessage} className="flex items-center gap-2 rounded-full border border-purple-200 bg-white p-1.5 pl-4 shadow-inner"><input value={reply} onChange={e => setReply(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" placeholder="Ask something else…" aria-label="Message XTRA-CASH assistant" /><button type="button" aria-label="Voice input" onClick={() => unavailable('Voice input')} className="grid h-9 w-9 place-items-center rounded-full text-[#5c2394]"><Mic className="h-5 w-5" /></button><button type="submit" aria-label="Send message" className="grid h-9 w-9 place-items-center rounded-full bg-[#a617d3] text-white"><ArrowRight className="h-4 w-4" /></button></form>
        <p className="text-center text-[11px] text-muted">I can help you navigate available account features.</p>
      </div>
    </Modal>

    <Modal open={menuOpen} title="XTRA-CASH menu" onClose={() => setMenuOpen(false)}>
      <div className="divide-y divide-line">{[{ label: 'My loans', href: '/app/loans' }, { label: 'My wallet', href: '/app/wallet' }, { label: 'My card', href: '/app/card' }, { label: 'Transactions', href: '/app/activity' }, { label: 'Profile & settings', href: '/app/profile' }].map(x => <Link key={x.href} href={x.href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center justify-between text-sm font-semibold">{x.label}<ArrowRight className="h-4 w-4 text-muted" /></Link>)}{me?.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN') && <Link href="https://xtra-cash-admin.vercel.app" onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center justify-between text-sm font-semibold text-brand-purple">Open Back Office<ArrowUpRight className="h-4 w-4" /></Link>}</div>
      <button type="button" onClick={() => setMenuOpen(false)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-muted"><X className="h-4 w-4" /> Close menu</button>
    </Modal>
    <Modal open={!!notice} title="Service update" onClose={() => setNotice('')}><Alert tone="amber">{notice}</Alert><Button className="mt-4 w-full" onClick={() => setNotice('')}>Got it</Button></Modal>
    <TopUpModal open={topUp} onClose={() => setTopUp(false)} onDone={reloadAll} />
    {card && b && <PayModal open={pay} onClose={() => setPay(false)} cardId={card.id} balance={b} onDone={reloadAll} />}
  </div>;
}
