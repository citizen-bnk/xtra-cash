'use client';

import { useRef, useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { useApi, useAuth } from './api';
import { Alert, Button, Card, Field, Input, MoneyInput, StatusBadge } from './components';

type Deposit = { id: string; amount_cents: number; reference: string; status: string; note?: string; first_name?: string; last_name?: string };

export function WalletTopUp() {
  const { client } = useAuth();
  const data = useApi(c => c.request<{ bankDetails: string | null; deposits: Deposit[] }>('GET', '/me/wallet/deposits'));
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deposit, setDeposit] = useState<Deposit>();
  const key = useRef('');
  async function request() {
    if (!amount || busy) return;
    setBusy(true); setError('');
    try {
      key.current ||= crypto.randomUUID();
      const created = await client.request<Deposit>('POST','/me/wallet/deposits',{amountCents:amount,clientKey:key.current});
      setDeposit(created);
      await data.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your deposit reference.'); }
    finally { setBusy(false); }
  }
  const recent = deposit ?? data.data?.deposits.find(item => item.status === 'PENDING');
  return <div className="space-y-3">
    {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
    {data.loading && !data.data && <p className="text-sm text-muted">Loading deposit details…</p>}
    {data.data && !data.data.bankDetails && <p className="text-sm">Bank top-ups are awaiting settlement account setup.</p>}
    {data.data?.bankDetails && <>
      {recent ? <Card className="space-y-2">
        <p className="text-sm">Transfer <strong>{formatZAR(recent.amount_cents)}</strong> using this reference.</p>
        <strong className="block font-mono">{recent.reference}</strong>
        <p className="whitespace-pre-wrap text-sm">{data.data.bankDetails}</p>
        <p className="text-xs text-muted">Your wallet updates after the deposit is confirmed.</p>
      </Card> : <><Field label="Amount to deposit"><MoneyInput cents={amount} onCents={value => { setAmount(value); key.current = ''; }} /></Field>
        <Button loading={busy} disabled={!amount || amount < 100 || amount > 10000000} onClick={() => void request()}>Get deposit reference</Button></>}
    </>}
    {data.data?.deposits.filter(item => item.id !== recent?.id).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm"><span>{item.reference} · {formatZAR(item.amount_cents)}{item.status === 'REJECTED' && item.note && <span className="block text-xs text-muted">{item.note}</span>}</span><StatusBadge status={item.status}/></div>)}
  </div>;
}
export function WalletDepositQueue() {
  const { client } = useAuth();
  const data = useApi(c => c.request<Deposit[]>('GET','/money/wallet/deposits'));
  const [selected, setSelected] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(action: 'CONFIRM' | 'REJECT') {
    setBusy(true); setError('');
    try {
      await client.request('POST','/money/wallet/deposits/'+selected+'/decision',{
        action,note,...(action === 'CONFIRM' ? {bankReference} : {}),
      });
      setSelected('');
      await data.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the deposit.'); }
    finally { setBusy(false); }
  }
  return <Card className="space-y-3"><h2 className="text-lg font-bold">Wallet deposits</h2>
    {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
    {data.data?.length === 0 && <p className="text-sm text-muted">No deposits to review.</p>}
    {data.data?.map(item => <div key={item.id} className="space-y-2 border-t border-line py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{item.first_name} {item.last_name} · {item.reference} · {formatZAR(item.amount_cents)}</span>
        {item.status === 'PENDING' ? <Button type="button" size="sm" variant="secondary" onClick={() => { setSelected(item.id);setBankReference('');setNote('');setError(''); }}>Review</Button> : <StatusBadge status={item.status}/>}
      </div>
      {selected === item.id && <div className="grid gap-3 rounded-xl bg-surface p-3">
        <Field label="Bank transaction reference"><Input value={bankReference} maxLength={150} onChange={e => setBankReference(e.target.value)} /></Field>
        <Field label="Receipt or rejection note"><Input value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={note.trim().length < 3 || bankReference.trim().length < 3} onClick={() => void decide('CONFIRM')}>Confirm receipt and credit</Button>
          <Button variant="secondary" disabled={busy || note.trim().length < 3} onClick={() => void decide('REJECT')}>Reject</Button>
        </div>
      </div>}
    </div>)}
  </Card>;
}
