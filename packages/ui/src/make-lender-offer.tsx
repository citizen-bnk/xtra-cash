'use client';

import { useState, type FormEvent } from 'react';
import { formatZAR, quoteLoan, type PersonalLoanApplication } from '@xtra/shared';
import { useApi, useAuth } from './api';
import { Alert, Button, Field, Input, MoneyInput, Select } from './components';

export function MakeLenderOffer({ application, office, onSent }: {
  application: PersonalLoanApplication;
  office: boolean;
  onSent: () => void;
}) {
  const { client } = useAuth();
  const lenders = useApi(c => office && !application.lenderId ? c.admin.lenders('ACCREDITED') : Promise.resolve([]), [office, application.lenderId]);
  const products = useApi(c => office ? c.admin.offers() : c.lender.offers(), [office]);
  const [lender, setLender] = useState(application.lenderId ?? '');
  const [rate, setRate] = useState('');
  const [initiationFee, setInitiationFee] = useState<number | null>(null);
  const [serviceFee, setServiceFee] = useState<number | null>(null);
  const [preset, setPreset] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = products.data?.filter(p => p.productType === 'PERSONAL' && p.active && !p.suspended && !p.applicationId
    && (!office || p.lenderId === lender)) ?? [];
  const validRate = /^\d{1,3}(?:\.\d{1,2})?$/.test(rate) && Number(rate) <= 100;
  const pricing = {
    termMonths: application.termMonths,
    monthlyInterestRateBps: Math.round(Number(rate) * 100),
    initiationFeeCents: initiationFee ?? 0,
    monthlyServiceFeeCents: serviceFee ?? 0,
  };
  const valid = validRate && pricing.initiationFeeCents <= 200000 && pricing.monthlyServiceFeeCents <= 100000;
  const quote = valid ? quoteLoan(application.amountCents, pricing) : null;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !valid || (office && !lender)) return;
    setBusy(true);
    setError('');
    try {
      await client.request('POST', `/loan-operations/applications/${application.id}/offer`, {
        ...pricing,
        amountCents: application.amountCents,
        ...(office ? { lenderId: lender } : {}),
      });
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the offer.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={send} className="space-y-4">
    <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold">
      {formatZAR(application.amountCents)} · {application.termMonths} {application.termMonths === 1 ? 'month' : 'months'}
    </p>
    {office && !application.lenderId && <Field label="Lender">
      <Select value={lender} onChange={event => {
        setLender(event.target.value);
        setPreset(''); setRate(''); setInitiationFee(null); setServiceFee(null);
      }}>
        <option value="">Choose an accredited lender</option>
        {lenders.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
    </Field>}
    {lenders.error && <Alert tone="red">{lenders.error}</Alert>}
    {available.length > 0 && <Field label="Saved pricing (optional)">
      <Select value={preset} onChange={event => {
        const product = available.find(item => item.id === event.target.value);
        setPreset(product?.id ?? '');
        setRate(product ? String(product.monthlyInterestRateBps / 100) : '');
        setInitiationFee(product?.initiationFeeCents ?? null);
        setServiceFee(product?.monthlyServiceFeeCents ?? null);
      }}>
        <option value="">Enter pricing</option>
        {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
    </Field>}
    <Field label="Monthly interest (%)">
      <Input type="number" inputMode="decimal" min="0" max="100" step="0.01" required value={rate} onChange={event => setRate(event.target.value)} placeholder="0.00" />
    </Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Initiation fee (optional)"><MoneyInput cents={initiationFee} onCents={setInitiationFee} /></Field>
      <Field label="Monthly service fee (optional)"><MoneyInput cents={serviceFee} onCents={setServiceFee} /></Field>
    </div>
    {!valid && (pricing.initiationFeeCents > 200000 || pricing.monthlyServiceFeeCents > 100000) && <Alert tone="red">Check the fee amounts. The maximum entries are R2,000 initiation and R1,000 monthly service, subject to platform limits.</Alert>}
    {quote && <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
      <div><dt className="text-muted">First instalment</dt><dd className="font-bold">{formatZAR(quote.monthlyInstallmentCents)}</dd></div>
      <div><dt className="text-muted">Total repayment</dt><dd className="font-bold">{formatZAR(quote.totalRepayableCents)}</dd></div>
    </dl>}
    <p className="text-xs text-muted">Sending confirms the lender has completed its assessment and approved these terms. The applicant can review the offer before accepting.</p>
    {error && <Alert tone="red">{error}</Alert>}
    <Button type="submit" className="w-full" loading={busy} disabled={!valid || (office && !lender)}>Send offer</Button>
  </form>;
}
