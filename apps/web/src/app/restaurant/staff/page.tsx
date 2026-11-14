'use client';
import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useApi, useAuth } from '@xtra/ui';

type Staff = { employee_code: string; trading_name: string; status: string; merchant_status: string; shift_expires_at: string | null; qrUrl: string; tips_enabled: boolean };

export default function RestaurantStaffPage() {
  const { client, me, loading } = useAuth();
  const data = useApi(c => c.request<Staff>('GET', '/restaurant-staff/me'), [me?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setBusy(true); setError('');
    try { await client.request('POST', '/restaurant-staff/shift', {}); data.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start your shift.'); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="p-6">Loading…</main>;
  if (!me) return <main className="grid min-h-screen place-items-center p-6"><Link href="/login?next=%2Frestaurant%2Fstaff" className="rounded-xl bg-purple-700 px-5 py-3 text-white">Log in to your staff account</Link></main>;
  const active = data.data?.status === 'ACTIVE' && data.data.merchant_status === 'ACTIVE' && new Date(data.data.shift_expires_at ?? 0).getTime() > Date.now();
  return <main className="min-h-screen bg-[#f8f3fd] p-5 text-[#241239]"><div className="mx-auto max-w-md space-y-5"><Link href="/app" className="text-sm text-purple-700">← XTRA-CASH</Link><header><h1 className="text-2xl font-bold">Your restaurant QR</h1><p>Show this code to a guest when the table QR is unavailable.</p></header>{data.error && <p className="rounded-xl bg-white p-4">{data.error}</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-4">{error}</p>}{data.data && <div className="space-y-5 rounded-3xl bg-white p-6 text-center shadow-sm"><h2 className="text-xl font-bold">{data.data.trading_name}</h2><p>Employee code <strong className="font-mono tracking-widest">{data.data.employee_code}</strong></p>{active ? <><div className="mx-auto w-fit rounded-2xl border p-4"><QRCodeSVG value={data.data.qrUrl} size={220} /></div><p className="text-sm">Guests scan this to open the bill. {data.data.tips_enabled ? 'They can choose an optional tip.' : 'Tipping is off for this restaurant.'}</p><button className="rounded-xl border border-purple-700 px-5 py-3" onClick={() => void navigator.clipboard.writeText(data.data!.qrUrl)}>Copy guest link</button><p className="text-xs text-slate-500">Valid until {new Date(data.data.shift_expires_at!).toLocaleString('en-ZA')}</p></> : <><p>Your QR becomes active when you start a shift.</p><button disabled={busy || data.data.status !== 'ACTIVE' || data.data.merchant_status !== 'ACTIVE'} className="rounded-xl bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50" onClick={() => void start()}>{busy ? 'Starting…' : 'Start shift and show QR'}</button></>}</div>}</div></main>;
}
