'use client';

import PersonalLoanCheckout from './PersonalLoanCheckout';
import { useCallback, useEffect, useState } from 'react';
import { WalletTopUp, useAuth } from '@xtra/ui';
import { ArrowLeft, CircleCheck, Clock3, LockKeyhole, Share2, Wallet } from 'lucide-react';

type LiveItem = { id: string; label: string; amount_cents: number; tax_cents: number; bill_tip_cents: number; status: 'UNCLAIMED' | 'CLAIMED' | 'PAYMENT_PENDING' | 'PAID'; claimed_by: string | null; claimed_name: string | null };
type LiveData = { merchant_name: string; bill_reference: string; total_cents: number; status: 'OPEN' | 'FUNDED' | 'SETTLED' | 'CANCELLED'; canPayFromWallet: boolean; tips_enabled: boolean; waiter_name: string | null; has_original: boolean; items: LiveItem[]; shareToken: string };
const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

export default function LiveBill({ token, onBack }: { token: string; onBack: () => void }) {
  const { client, me, loading } = useAuth();
  const [funding, setFunding] = useState<'wallet' | 'loan' | null>(null);
  useEffect(() => {
    if (!me?.id) return;
    const key = 'xc.checkout.' + me.id + '.' + token;
    try {
      if (sessionStorage.getItem(key + '.offer') || sessionStorage.getItem(key + '.application')) setFunding('loan');
    } catch { /* Optional session memory. */ }
  }, [me?.id, token]);
  const [online, setOnline] = useState(true);
  const [bill, setBill] = useState<LiveData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [wallet, setWallet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tipMode, setTipMode] = useState<'percent' | 'amount'>('percent');
  const [tipOverride, setTipPercent] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState('0.00');
  const refresh = useCallback(async () => {
    const latest = await client.request<LiveData>('GET', `/restaurant-bills/${token}`);
    setBill(latest);
    if (me?.roles.includes('CONSUMER')) {
      const balance = await client.consumer.balance();
      setWallet(balance.walletCents);
    }
  }, [client, token, me]);

  useEffect(() => {
    let cancelled = false;
    const update = async () => { if (!navigator.onLine) return; try { await refresh(); if (!cancelled) setError(''); } catch (cause) { if (!cancelled && navigator.onLine && !(cause instanceof TypeError)) setError(cause instanceof Error ? cause.message : 'Could not load this bill.'); } };
    const connectionChanged = () => { setOnline(navigator.onLine); if (navigator.onLine) void update(); };
    connectionChanged();
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    const timer = window.setInterval(() => { if (!document.hidden) void update(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); };
  }, [refresh]);

  const mine = bill?.items.filter(item => item.claimed_by === me?.id && item.status === 'CLAIMED') ?? [];
  const myTotal = mine.reduce((sum, item) => sum + item.amount_cents, 0);
  const tax = mine.reduce((sum, item) => sum + (item.tax_cents ?? 0), 0);
  const printedTip = mine.reduce((sum, item) => sum + (item.bill_tip_cents ?? 0), 0);
  const tipBase = myTotal - printedTip;
  const tipPercent = tipOverride ?? (printedTip > 0 ? '0' : '10');
  const tipCents = bill?.tips_enabled && myTotal > 0 ? tipMode === 'percent' ? Math.round(tipBase * (Number(tipPercent) || 0) / 100) : Math.round((Number(tipAmount) || 0) * 100) : 0;
  const tipValid = Number.isSafeInteger(tipCents) && tipCents >= 0 && tipCents <= tipBase;
  const paymentTotal = myTotal + (tipValid ? tipCents : 0);
  const paidTotal = bill?.items.filter(item => item.status === 'PAID').reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/scanqr/?table=${token}` : '';

  async function act(task: () => Promise<unknown>) {
    if (!navigator.onLine) return;
    setBusy(true); setError(''); setNotice('');
    try { await task(); await refresh(); setSelected([]); }
    catch (cause) { if (navigator.onLine && !(cause instanceof TypeError)) setError(cause instanceof Error ? cause.message : 'Could not complete this action.'); }
    finally { setBusy(false); }
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${bill?.merchant_name ?? 'Restaurant'} bill`, text: 'Choose your items on the shared XTRA-CASH bill.', url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); setNotice('Bill link copied.'); }
    } catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) setError('Could not share the link.'); }
  }

  return <main className="sq-root"><div className="sq-live">
    <header className="sq-header"><button className="sq-back" aria-label="Back to scan" onClick={onBack}><ArrowLeft size={19} /></button><img src="/brand/ui/wordmark.png" alt="XTRA-CASH" /><span className="sq-demo">SHARED BILL</span></header>
    <div className="sq-body">
      <div className="sq-intro"><div className="sq-kicker">LIVE TABLE BILL</div><h1>{bill?.merchant_name ?? 'Loading bill…'}</h1><p>{bill ? `Bill ${bill.bill_reference} · ${money(bill.total_cents)}. Claim your items, then share the rest.` : 'Everyone sees the same item status.'}</p></div>
      {error && <p className="sq-error" role="alert">{error}</p>}
      {notice && <p className="sq-note" role="status">{notice}</p>}
      {bill && <>
        <div className="sq-card sq-schedule"><div className="sq-row"><span>Paid from wallets</span><strong>{money(paidTotal)}</strong></div><div className="sq-row"><span>Still to pay</span><strong>{money(bill.total_cents - paidTotal)}</strong></div><div className="sq-row sq-total"><span>Merchant settlement</span><strong>{bill.status === 'FUNDED' ? 'Pending payout' : bill.status === 'SETTLED' ? 'Settled' : 'Waiting for diners'}</strong></div></div>
        {bill.status === 'FUNDED' && <div className="sq-notice"><CircleCheck size={20} /><span><strong>All diners have funded the bill</strong><small>XTRA-CASH still needs to settle the restaurant. Each paid diner has a personal receipt record.</small></span></div>}
        {!bill.canPayFromWallet && bill.status === 'OPEN' && <div className="sq-notice"><LockKeyhole size={20} /><span><strong>Wallet payment is not active for this restaurant</strong><small>The restaurant QR and settlement arrangement must be approved first. Your wallet will not be debited here.</small></span></div>}
        <div className="sq-item-list">{bill.items.map(item => {
          const canSelect = !!me?.roles.includes('CONSUMER') && item.status === 'UNCLAIMED' && bill.status === 'OPEN';
          return <label key={item.id} className="sq-item-choice" data-paid={item.status === 'PAID'}>
            {canSelect ? <input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /> : item.status === 'PAID' ? <CircleCheck size={19} color="#17845d" /> : <Clock3 size={18} color="#956caa" />}
            <span><strong>{item.label}</strong><small>{item.status === 'UNCLAIMED' ? 'Available to claim' : `${item.claimed_name ?? 'A diner'} · ${item.status === 'PAID' ? 'Paid' : item.status === 'PAYMENT_PENDING' ? 'Payment pending' : 'Claimed, awaiting payment'}`}</small></span><strong>{money(item.amount_cents)}</strong>
          </label>;
        })}</div>
        {selected.length > 0 && <button className="sq-primary" disabled={!online || busy || !me} onClick={() => void act(() => client.request('POST', `/restaurant-bills/${token}/claim`, { itemIds: selected }))}>Claim {selected.length} item{selected.length === 1 ? '' : 's'}</button>}
        {!loading && !me && <div className="sq-notice"><LockKeyhole size={19} /><span><strong>Sign in to claim and pay</strong><small>Your items and wallet payment will be linked to your account.</small></span></div>}
        {!loading && !me && <div className="sq-text-row"><a className="sq-secondary" href={`/register?next=${encodeURIComponent(`/scanqr/?table=${token}`)}`}>Create account</a><a className="sq-secondary" href={`/login?next=${encodeURIComponent(`/scanqr/?table=${token}`)}`}>Log in</a></div>}
        {bill.tips_enabled && myTotal > 0 && <div className="sq-card sq-schedule"><strong>Extra tip for {bill.waiter_name ?? 'your waiter'} (optional)</strong><div className="sq-text-row"><button type="button" className="sq-secondary" onClick={() => { setTipMode('percent'); setTipPercent('0'); }}>No tip</button><button type="button" className="sq-secondary" onClick={() => { setTipMode('percent'); setTipPercent('10'); }}>10%</button><button type="button" className="sq-secondary" onClick={() => { setTipMode('percent'); setTipPercent('15'); }}>15%</button></div><div className="sq-text-row"><label>Percentage<input className="w-24 rounded-lg border p-2" type="number" min="0" max="100" step="0.1" value={tipMode === 'percent' ? tipPercent : tipBase ? (tipCents / tipBase * 100).toFixed(1) : '0'} onChange={e => { setTipMode('percent'); setTipPercent(e.target.value); }} />%</label><label>Amount<input className="w-28 rounded-lg border p-2" type="number" min="0" max={tipBase / 100} step="0.01" value={tipMode === 'amount' ? tipAmount : (tipCents / 100).toFixed(2)} onChange={e => { setTipMode('amount'); setTipAmount(e.target.value); }} /></label></div><p>{tipValid ? `${money(tipCents)} tip · ${tipBase ? (tipCents / tipBase * 100).toFixed(1) : '0'}%` : 'Tip cannot exceed your selected items.'}</p></div>}
        {me?.roles.includes('CONSUMER') && <div className="sq-card sq-schedule"><div className="sq-row"><span>Your picked items</span><strong>{money(myTotal - tax - printedTip)}</strong></div>{tax > 0 && <div className="sq-row"><span>Your VAT</span><strong>{money(tax)}</strong></div>}{printedTip > 0 && <div className="sq-row"><span>Your printed gratuity</span><strong>{money(printedTip)}</strong></div>}{tipCents > 0 && tipValid && <div className="sq-row"><span>Waiter tip</span><strong>{money(tipCents)}</strong></div>}<div className="sq-row"><span>XTRA-CASH wallet</span><strong>{wallet === null ? 'Loading…' : money(wallet)}</strong></div></div>}
        {bill.canPayFromWallet && myTotal > 0 && wallet !== null && wallet < paymentTotal && !funding && <section className="sq-card sq-schedule">
          <div className="sq-row"><strong>Wallet shortfall</strong><strong>{money(paymentTotal - wallet)}</strong></div>
          <div className="sq-text-row">
            <button type="button" className="sq-secondary" onClick={() => setFunding('wallet')}>Top up wallet</button>
            <button type="button" className="sq-secondary" onClick={() => setFunding('loan')}>Use a personal loan</button>
          </div>
        </section>}
        {funding === 'wallet' && <section className="sq-card sq-schedule">
          <div className="sq-row"><strong>Top up wallet</strong><button className="sq-text-button" onClick={() => setFunding(null)}>Back to bill</button></div>
          <WalletTopUp />
          <div className="sq-text-row">
            <button type="button" className="sq-secondary" disabled={busy || !online} onClick={() => void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not check your wallet.'))}>Check wallet balance</button>
            <button type="button" className="sq-secondary" onClick={() => setFunding('loan')}>Use a personal loan</button>
          </div>
        </section>}
        {funding === 'loan' && me?.roles.includes('CONSUMER') && wallet !== null && <PersonalLoanCheckout tableToken={token} shortfall={Math.max(0,paymentTotal-wallet)} onClose={() => setFunding(null)} />}
        {myTotal > 0 && <button className="sq-primary" disabled={!online || busy || !tipValid || !bill.canPayFromWallet || wallet === null || wallet < paymentTotal} onClick={() => void act(() => client.request('POST', `/restaurant-bills/${token}/pay-wallet`, { idempotencyKey: crypto.randomUUID(), tipCents }))}><Wallet size={18} /> Pay {money(paymentTotal)} from wallet</button>}
        {mine.length > 0 && <button className="sq-text-button sq-centred" disabled={!online || busy} onClick={() => void act(() => client.request('POST', `/restaurant-bills/${token}/release`, { itemIds: mine.map(item => item.id) }))}>Release my unpaid items</button>}
        <button className="sq-secondary" disabled={!bill.items.some(item => item.status === 'CLAIMED' || item.status === 'PAID') || !bill.items.some(item => item.status === 'UNCLAIMED')} onClick={() => void share()}><Share2 size={17} /> Share remaining items</button>
        <p className="sq-note">The green tick follows a successful wallet debit. Merchant payout and emailed receipts require their own activated services.</p>
      </>}
    </div>
  </div></main>;
}
