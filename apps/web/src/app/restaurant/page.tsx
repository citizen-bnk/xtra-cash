'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Banknote, CircleCheck, Clock3, Copy, RefreshCw, Store } from 'lucide-react';
import { useApi, useAuth } from '@xtra/ui';

type MerchantDashboard = {
  merchant: { id: string; trading_name: string; status: string; display_code: string; qrUrl: string; payout_mode: string; bank_account_mask: string | null; bank_recipient_configured: boolean };
  totals: { paid_cents: string; available_cents: string; payout_pending_cents: string };
  transactions: { id: string; label: string; amount_cents: number; paid_at: string; bill_reference: string; diner_name: string | null; payout_status: string | null }[];
  payouts: { id: string; amount_cents: number; payout_reference: string; status: string; mode: string; bank_reference: string | null; created_at: string }[];
  eftEnabled: boolean;
};
const money = (value: number | string) => `R${(Number(value) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RestaurantPortal() {
  const { client, me, loading } = useAuth();
  const data = useApi(c => c.request<MerchantDashboard>('GET', '/restaurant-portal'), [me?.id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function payout() {
    if (!data.data || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await client.request<{ payoutReference: string }>('POST', '/restaurant-portal/payouts', { merchantId: data.data.merchant.id });
      setMessage(`Payout ${result.payoutReference} requested. Bank transfer confirmation is pending.`);
      data.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not request payout.'); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="min-h-screen bg-[#f8f3fd] p-6">Loading restaurant account…</main>;
  if (!me) return <main className="grid min-h-screen place-items-center bg-[#f8f3fd] p-6"><div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><Store className="mx-auto mb-4 text-[#7920ae]" size={42} /><h1 className="text-2xl font-bold">Restaurant back office</h1><p className="my-4 text-sm text-slate-600">Sign in with the XTRA-CASH account assigned to your restaurant.</p><Link className="inline-block rounded-xl bg-[#7620b3] px-6 py-3 font-bold text-white" href="/login?next=%2Frestaurant">Log in</Link></div></main>;
  return <main className="min-h-screen bg-[#f8f3fd] text-[#241239]"><header className="bg-gradient-to-r from-[#40005f] via-[#8700a5] to-[#d91f63] px-5 py-5 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-white/75">XTRA-CASH</p><h1 className="text-2xl font-bold">Restaurant back office</h1></div><Link className="rounded-full border border-white/50 px-3 py-2 text-sm" href="/app">Customer app</Link></div></header><div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    {data.loading && <p>Loading restaurant transactions…</p>}
    {data.error && <div className="rounded-2xl border border-amber-200 bg-white p-5"><p>{data.error}</p><p className="mt-2 text-sm text-slate-600">Ask XTRA-CASH admin to link your account to your restaurant.</p></div>}
    {data.data && <><section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{data.data.merchant.trading_name}</h2><p className="text-sm text-slate-600">{data.data.merchant.status} · {data.data.merchant.payout_mode === 'DAILY' ? 'Daily payout requests' : 'Payout on request'}</p></div><div className="rounded-2xl bg-[#f3e8fb] px-5 py-3 text-center"><p className="text-xs text-slate-600">Code printed below QR</p><strong className="font-mono text-2xl tracking-widest">{data.data.merchant.display_code}</strong></div></div><div className="mt-4 flex flex-wrap items-center gap-3"><a href={data.data.merchant.qrUrl} className="text-sm font-semibold text-[#7620b3] underline">Open customer QR link</a><button className="inline-flex items-center gap-1 text-sm text-[#7620b3]" onClick={() => void navigator.clipboard.writeText(data.data!.merchant.qrUrl)}><Copy size={15} /> Copy link</button></div></section>
      <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Wallet payments received</p><strong className="text-2xl">{money(data.data.totals.paid_cents)}</strong></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Available for payout</p><strong className="text-2xl">{money(data.data.totals.available_cents)}</strong></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Requested, awaiting bank</p><strong className="text-2xl">{money(data.data.totals.payout_pending_cents)}</strong></div></section>
      <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Payouts</h2><p className="text-sm text-slate-600">Verified bank account {data.data.merchant.bank_account_mask ?? 'not configured'}. A request reserves the paid transactions once.</p></div><button disabled={busy || !Number(data.data.totals.available_cents) || data.data.merchant.status !== 'ACTIVE'} onClick={() => void payout()} className="inline-flex items-center gap-2 rounded-xl bg-[#7620b3] px-4 py-2 font-bold text-white disabled:opacity-50"><Banknote size={18} /> Request payout</button></div>{message && <p role="status" className="mt-3 rounded-xl bg-[#f3e8fb] p-3 text-sm">{message}</p>}{!data.data.eftEnabled && <p className="mt-3 text-sm text-amber-700">Automated EFT submission is awaiting the banking connection. Payout requests remain pending until bank confirmation.</p>}<div className="mt-4 space-y-2">{data.data.payouts.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eee5f4] py-3 text-sm"><span><strong>{p.payout_reference}</strong><small className="ml-2 text-slate-500">{new Date(p.created_at).toLocaleString('en-ZA')}</small></span><span>{money(p.amount_cents)} · {p.status}{p.bank_reference && ` · ${p.bank_reference}`}</span></div>)}{!data.data.payouts.length && <p className="text-sm text-slate-500">No payout requests yet.</p>}</div></section>
      <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Paid bill items</h2><button aria-label="Refresh transactions" onClick={() => data.reload()}><RefreshCw size={17} /></button></div><div className="mt-3 space-y-2">{data.data.transactions.map(t => <div key={t.id} className="flex items-center gap-3 border-t border-[#eee5f4] py-3 text-sm"><CircleCheck size={18} className="shrink-0 text-green-600"/><div className="min-w-0 flex-1"><strong>{t.label}</strong><p className="text-xs text-slate-500">Bill {t.bill_reference} · {t.diner_name ?? 'Diner'} · {new Date(t.paid_at).toLocaleString('en-ZA')}</p></div><div className="text-right"><strong>{money(t.amount_cents)}</strong><p className="text-xs text-slate-500">{t.payout_status ?? 'Available'}</p></div></div>)}{!data.data.transactions.length && <p className="text-sm text-slate-500">No paid bill items yet.</p>}</div></section></>}
  </div></main>;
}
