'use client';

import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, MoneyInput, Textarea, useAction, useApi, useAuth } from '@xtra/ui';

type Commitment = {
  required: boolean;
  projectedFeesCents: number | null;
  commitmentCents: number | null;
  agreementReference: string | null;
  forecastBasis: string | null;
  paidAt: string | null;
};

export function FeeCommitment({ lenderId }: { lenderId: string }) {
  const path = `/admin/lenders/${lenderId}/fee-commitment`;
  const commitment = useApi(c => c.request<Commitment>('GET', path), [path]);
  if (commitment.error) return <Alert tone="red">{commitment.error}</Alert>;
  if (!commitment.data) return null;
  return <FeeCommitmentDetails
    key={JSON.stringify(commitment.data)}
    value={commitment.data}
    path={path}
    onSaved={() => void commitment.reload()}
  />;
}

function FeeCommitmentDetails({ value, path, onSaved }: { value: Commitment; path: string; onSaved: () => void }) {
  const { client } = useAuth();
  const [projected, setProjected] = useState(value.projectedFeesCents ?? 0);
  const [agreement, setAgreement] = useState(value.agreementReference ?? '');
  const [forecast, setForecast] = useState(value.forecastBasis ?? '');
  const [reference, setReference] = useState('');
  const [received, setReceived] = useState(0);
  const save = useAction(async () => {
    await client.request('PUT', path, { projectedFeesCents: projected, agreementReference: agreement, forecastBasis: forecast });
    onSaved();
  });
  const confirm = useAction(async () => {
    await client.request('POST', `${path}/payment`, { paymentReference: reference, amountCents: received });
    onSaved();
  });

  return <Card>
    <details>
      <summary className="cursor-pointer font-bold">
        Platform fee commitment · {value.paidAt ? 'Paid' : value.commitmentCents !== null ? formatZAR(value.commitmentCents) + ' due' : 'Awaiting forecast'}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink">{value.required ? 'Required for offer activation.' : 'This lender predates the activation requirement.'}</p>
        {value.paidAt ? <p className="break-words text-sm text-ink">Agreement {value.agreementReference} · {formatZAR(value.projectedFeesCents ?? 0)} projected over three months</p> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Projected fees over three months"><MoneyInput cents={projected} onCents={c => setProjected(c ?? 0)} /></Field>
            <Field label="Signed agreement reference"><Input value={agreement} maxLength={120} onChange={e => setAgreement(e.target.value)} /></Field>
          </div>
          <Field label="Forecast basis"><Textarea value={forecast} maxLength={1000} onChange={e => setForecast(e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-sm">3% commitment · {formatZAR(Math.round(projected * 3 / 100))}</strong>
            <Button size="sm" loading={save.loading} disabled={projected < 100 || agreement.trim().length < 3 || forecast.trim().length < 10 || confirm.loading} onClick={() => save.run()}>Save commitment</Button>
          </div>
          {value.commitmentCents !== null && <div className="space-y-3 border-t border-line pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount received"><MoneyInput cents={received} onCents={c => setReceived(c ?? 0)} /></Field>
              <Field label="Verified bank payment reference"><Input value={reference} maxLength={120} onChange={e => setReference(e.target.value)} /></Field>
            </div>
            <Button size="sm" loading={confirm.loading} disabled={received !== value.commitmentCents || reference.trim().length < 3 || save.loading} onClick={() => confirm.run()}>Confirm payment</Button>
          </div>}
        </>}
        {(save.error || confirm.error) && <Alert tone="red">{save.error || confirm.error}</Alert>}
      </div>
    </details>
  </Card>;
}
