'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Banknote, CreditCard, ReceiptText, ScanLine, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, Modal, useApi } from '@xtra/ui';

const action = 'flex min-h-20 items-center gap-3 rounded-2xl border border-[#e8d9f3] bg-white p-4 text-left shadow-sm';

export default function PayPage() {
  const balance = useApi(c => c.consumer.balance());
  const [topUpOpen, setTopUpOpen] = useState(false);
  const spending = balance.data?.xtraBalanceCents;
  const wallet = balance.data?.walletCents;
  return <section className="mx-auto w-full max-w-xl space-y-4 pb-6">
    <header className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#7d32a3]">XTRA-CASH</p><h1 className="text-2xl font-black text-[#1b1030]">Pay</h1></div><Image src="/brand/photo/customer-phone.png" alt="" aria-hidden width={76} height={76} className="h-16 w-16 rounded-full bg-gradient-to-br from-[#f9dfff] to-[#f9a444] object-cover object-top" /></header>
    <div className="relative aspect-[1.586] w-full overflow-hidden rounded-[24px] border border-white/50 bg-[#4c146e] bg-[url('/brand/card.jpg')] bg-cover bg-center p-5 text-white shadow-[0_16px_34px_rgba(37,0,65,.26)]" aria-label={`XTRA-CASH spending card. Available to spend: ${spending === undefined ? 'loading' : formatZAR(spending)}`}>
      <div className="absolute inset-0 bg-gradient-to-t from-[#24013d]/85 via-[#24013d]/15 to-transparent" />
      <div className="relative flex h-full flex-col justify-end"><p className="text-xs font-semibold uppercase tracking-[.14em] text-white/85">Available to spend</p><strong className="mt-1 text-3xl font-black tabular-nums sm:text-4xl">{spending === undefined ? '—' : formatZAR(spending)}</strong><p className="mt-2 text-xs text-white/85">Wallet and eligible credit</p></div>
    </div>
    <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#e8d9f3] bg-white px-4 py-3 shadow-sm"><Wallet className="h-6 w-6 shrink-0 text-[#8c00cf]" /><div className="min-w-0 flex-1"><p className="text-xs text-muted">Wallet balance</p><strong className="text-lg font-black tabular-nums text-[#1b1030]">{wallet === undefined ? '—' : formatZAR(wallet)}</strong></div>{wallet === 0 && <button type="button" onClick={() => setTopUpOpen(true)} className="shrink-0 rounded-full bg-[#5c2394] px-3 py-2 text-xs font-bold text-white">Top up funds</button>}</div>
    {balance.loading && <Loading />}
    {balance.error && <Alert tone="red">{balance.error}</Alert>}
    <nav aria-label="Payment actions" className="grid gap-3">
      <Link href="/scanqr/" className={action}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><ScanLine className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Scan a restaurant bill</strong><span className="block text-xs text-muted">Explore the checkout preview</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
      <Link href="/app/loans" className={action}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><Banknote className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Get a loan</strong><span className="block text-xs text-muted">Request a personal loan and review lender offers</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
      <Link href="/app/bills" className={action}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><ReceiptText className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Pay a bill</strong><span className="block text-xs text-muted">Choose a biller and review details</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
      <Link href="/app/card" className={action}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><CreditCard className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">My card</strong><span className="block text-xs text-muted">View card and payment status</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
    </nav>
    <Modal open={topUpOpen} onClose={() => setTopUpOpen(false)} title="Top up funds"><p className="text-sm leading-relaxed">Wallet top-ups will be available after the payment provider is connected. You can still request a loan or explore the restaurant checkout preview.</p><Link href="/app/loans" className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-[#5c2394] px-4 font-bold text-white">Get a loan</Link></Modal>
  </section>;
}
