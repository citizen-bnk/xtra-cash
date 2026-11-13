'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CreditCard, ReceiptText, ScanLine, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, useApi } from '@xtra/ui';
import { PayModal } from '@/components/PayModal';

export default function PayPage() {
  const balance = useApi(c => c.consumer.balance());
  const cards = useApi(c => c.consumer.cards());
  const [payOpen, setPayOpen] = useState(false);
  const card = cards.data?.[0];
  const ready = card?.status === 'ACTIVE' && !!balance.data;
  return <section className="mx-auto w-full max-w-xl space-y-4 pb-6">
    <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_100%_0%,#f6008f_0%,transparent_32%),linear-gradient(145deg,#1b1030_0%,#5c2394_55%,#a617d3_100%)] p-5 text-white shadow-[0_14px_32px_rgba(37,0,65,.25)]">
      <div className="absolute -bottom-20 -right-6 h-44 w-44 rounded-full bg-[#fb9320] blur-3xl" />
      <div className="relative"><p className="text-xs font-bold uppercase tracking-[.18em] text-white/75">XTRA-CASH</p><h1 className="mt-2 text-2xl font-black">Pay</h1><p className="mt-1 text-sm text-white/85">Pay using your XTRA-CASH wallet or card.</p></div>
      <div className="relative mt-5 flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/95 p-4 text-[#1b1030] shadow-lg"><Wallet className="h-7 w-7 text-[#8c00cf]" /><div><p className="text-xs text-muted">Available to spend</p><strong className="text-xl font-black">{balance.data ? formatZAR(balance.data.xtraBalanceCents) : '—'}</strong></div></div>
    </div>
    {(balance.loading || cards.loading) && <Loading />}
    {balance.error && <Alert tone="red">{balance.error}</Alert>}
    {cards.error && <Alert tone="red">{cards.error}</Alert>}
    <div className="grid gap-3">
      <button type="button" disabled={!ready} onClick={() => setPayOpen(true)} className="flex min-h-20 items-center gap-3 rounded-2xl border border-[#e8d9f3] bg-white p-4 text-left shadow-sm disabled:opacity-50"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><ScanLine className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Pay with XTRA-CASH</strong><span className="block text-xs text-muted">Choose a merchant and amount</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></button>
      <Link href="/app/bills" className="flex min-h-20 items-center gap-3 rounded-2xl border border-[#e8d9f3] bg-white p-4 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><ReceiptText className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">Pay a bill</strong><span className="block text-xs text-muted">Choose a biller and review details</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
      <Link href="/app/card" className="flex min-h-20 items-center gap-3 rounded-2xl border border-[#e8d9f3] bg-white p-4 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><CreditCard className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">My card</strong><span className="block text-xs text-muted">View card and payment status</span></span><ArrowRight className="h-5 w-5 text-[#8c00cf]" /></Link>
    </div>
    {!ready && !cards.loading && !balance.loading && <Alert tone="amber">Your XTRA-CASH card must be active before you can make a card payment. Open My Card to check its status.</Alert>}
    {ready && card && balance.data && <PayModal open={payOpen} onClose={() => setPayOpen(false)} cardId={card.id} balance={balance.data} onDone={balance.reload} />}
  </section>;
}
