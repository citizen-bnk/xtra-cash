'use client';

import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { useAction, useApi, useAuth } from './api';
import { Alert, Button, Card, Field, MoneyInput } from './components';

const allocations = [
  ['bnplLimit', 'BNPL allocation'],
  ['personalLimit', 'Personal loan allocation'],
  ['guaranteeLimit', 'Guarantee allocation'],
  ['bnplCustomerLimit', 'BNPL cap per customer'],
] as const;
type Limits = Record<(typeof allocations)[number][0], number>;
type Capacity = { [K in keyof Limits]: number | null } & {
  configured: boolean;
  availableCents: number;
  bnplCommitted: number;
  personalCommitted: number;
};

export function LenderCapacity({ path }: { path: string }) {
  const capacity = useApi(c => c.request<Capacity>('GET', path), [path]);
  if (capacity.error) return <Alert tone="red">{capacity.error}</Alert>;
  if (!capacity.data) return null;
  return <CapacityEditor key={path} value={capacity.data} path={path} onSaved={() => void capacity.reload()} />;
}

function CapacityEditor({ value, path, onSaved }: { value: Capacity; path: string; onSaved: () => void }) {
  const { client } = useAuth();
  const [limits, setLimits] = useState<Limits>({
    bnplLimit: value.bnplLimit ?? 0,
    personalLimit: value.personalLimit ?? 0,
    guaranteeLimit: value.guaranteeLimit ?? 0,
    bnplCustomerLimit: value.bnplCustomerLimit ?? 0,
  });
  const save = useAction(async () => {
    await client.request('PUT', path, limits);
    onSaved();
  });
  return <Card className="mb-4">
    <details>
      <summary className="cursor-pointer font-bold text-ink">Funding allocations {value.configured ? '· Active' : '· Set limits'}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink">Lender funds available {formatZAR(value.availableCents)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {allocations.map(([key, label]) => <Field label={label} key={key}>
            <MoneyInput cents={limits[key]} onCents={amount => setLimits(previous => ({ ...previous, [key]: amount ?? 0 }))} />
          </Field>)}
        </div>
        {value.configured && <div className="grid gap-2 text-sm text-ink sm:grid-cols-2">
          <p>BNPL remaining {formatZAR((value.bnplLimit ?? 0) - value.bnplCommitted)}</p>
          <p>Personal loans remaining {formatZAR((value.personalLimit ?? 0) - value.personalCommitted)}</p>
        </div>}
        <p className="text-sm text-ink">Repayments don’t reset these caps. The guarantee allocation is reserved for a later release.</p>
        {save.error && <Alert tone="red">{save.error}</Alert>}
        <Button size="sm" loading={save.loading} onClick={() => save.run()}>Save allocations</Button>
      </div>
    </details>
  </Card>;
}
