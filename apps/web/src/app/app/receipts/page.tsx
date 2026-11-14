'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Download, ReceiptText, ScanLine } from 'lucide-react';
import { useApi, useAuth } from '@xtra/ui';
import BillScanner from '../../scanqr/BillScanner';
import type { ParsedBill } from '../../scanqr/billScan';
import '../../scanqr/scan.css';

type Receipt = { id: string; kind: 'RESTAURANT_SHARE' | 'PERSONAL_ARCHIVE'; title: string; total_cents: number | null; digitized_json: { merchant?: string; reference?: string; items?: { label: string; cents: number }[] } | null; merchant_settlement_status: string | null; has_original: boolean; created_at: string; emailed_at: string | null };
const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

export default function ReceiptsPage() {
  const { client } = useAuth();
  const receipts = useApi(c => c.request<Receipt[]>('GET', '/me/receipts'));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function save(_scan: File, parsed: ParsedBill) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('title', parsed.merchant || file.name);
      data.append('digitizedJson', JSON.stringify(parsed));
      await client.request('POST', '/me/receipts', data);
      setFile(null); setNotice('Receipt saved. Check the extracted details against the original.');
      await receipts.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the receipt.'); }
    finally { setBusy(false); }
  }

  async function download(id: string) {
    try {
      const response = await fetch(`/api/me/receipts/${id}/original`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not download the original receipt.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `receipt-${id}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not download the receipt.'); }
  }

  return <section className="sq-root mx-auto min-h-[100dvh] max-w-2xl bg-[#f9f5fc] px-4 py-5 text-[#27133b]">
    <Link href="/app/pay" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#6526a0]"><ArrowLeft size={17} /> Pay</Link>
    <div className="mb-5 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#6526a0] text-white"><ReceiptText /></span><div><h1 className="text-2xl font-black">My receipts</h1><p className="text-sm text-[#695a75]">Restaurant shares and receipts you save yourself.</p></div></div>
    <label className="sq-secondary cursor-pointer"><ScanLine size={18} /> Scan and save another receipt<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { const chosen = event.target.files?.[0]; event.currentTarget.value = ''; setError(''); if (!chosen) return; if (!['image/jpeg','image/png','image/webp'].includes(chosen.type) || chosen.size > 12 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP image under 12 MB.'); return; } setFile(chosen); }} /></label>
    {file && <div className="mt-4 rounded-2xl border border-[#e8dff0] bg-white p-3"><BillScanner file={file} onDone={(_scan, parsed) => void save(_scan, parsed)} /><button className="sq-text-button mt-3" onClick={() => setFile(null)} disabled={busy}>Cancel</button></div>}
    {error && <p className="sq-error mt-4" role="alert">{error}</p>}
    {notice && <p className="sq-note mt-4" role="status">{notice}</p>}
    <div className="mt-6 grid gap-3">{receipts.data?.map(receipt => <article key={receipt.id} className="rounded-2xl border border-[#e8dff0] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><ReceiptText className="mt-0.5 shrink-0 text-[#6526a0]" /><div className="min-w-0 flex-1"><h2 className="font-bold">{receipt.title}</h2><p className="text-xs text-[#695a75]">{receipt.kind === 'RESTAURANT_SHARE' ? 'Your paid items' : 'Saved purchase'} · {new Date(receipt.created_at).toLocaleDateString('en-ZA')}</p></div><strong>{receipt.total_cents === null ? '—' : money(receipt.total_cents)}</strong></div>{receipt.digitized_json?.items?.length ? <details className="mt-3 border-t border-[#eee3f4] pt-2 text-sm"><summary className="cursor-pointer font-semibold text-[#6526a0]">View itemised receipt</summary>{receipt.digitized_json.items.map((item, i) => <div key={`${item.label}-${i}`} className="sq-row"><span>{item.label}</span><strong>{money(item.cents)}</strong></div>)}</details> : null}{receipt.kind === 'RESTAURANT_SHARE' && <p className="mt-2 text-xs text-[#695a75]">Merchant settlement: {receipt.merchant_settlement_status === 'SETTLED' ? 'settled' : 'pending payout'} · Email delivery: {receipt.emailed_at ? 'sent' : 'not active'}</p>}{receipt.has_original && <button className="sq-text-button mt-3 inline-flex items-center gap-1" onClick={() => void download(receipt.id)}><Download size={15} /> Original scan</button>}</article>)}{!receipts.loading && !receipts.data?.length && <p className="rounded-2xl border border-[#e8dff0] bg-white p-6 text-center text-sm text-[#695a75]">No receipts saved yet.</p>}{receipts.error && <p className="sq-error">{receipts.error}</p>}</div>
  </section>;
}
