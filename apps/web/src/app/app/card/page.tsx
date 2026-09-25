'use client';
import { useState } from 'react';
import { Lock, Snowflake, Unlock } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Empty, Loading, PageHeader, StatusBadge, useApi, useAuth, useToast, XtraCard } from '@xtra/ui';
import { PayModal } from '@/components/PayModal';

export default function CardPage() {
  const { me, client } = useAuth();
  const toast = useToast();
  const cards = useApi((c) => c.consumer.cards());
  const balance = useApi((c) => c.consumer.balance());
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);

  if (cards.loading && !cards.data) return <Loading />;
  const card = cards.data?.[0];

  if (!card)
    return (
      <>
        <PageHeader title="XTRA-CASH card" />
        <Empty title="No card yet" icon={<Lock className="h-8 w-8" />}>
          {me?.kyc?.status === 'VERIFIED' ? (
            <Button className="mt-3" onClick={() => client.consumer.issueCard().then(() => cards.reload())}>
              Issue my virtual card
            </Button>
          ) : (
            'Verify your profile to get your virtual card instantly.'
          )}
        </Empty>
      </>
    );

  const frozen = card.status === 'FROZEN';
  const toggle = async () => {
    setBusy(true);
    try {
      await client.consumer.freezeCard(card.id, !frozen);
      toast(frozen ? 'Card unfrozen' : 'Card frozen — all payments will be declined');
      cards.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="XTRA-CASH card" subtitle="Use it anywhere Mastercard is accepted — in store, online and on the XTRA-CASH marketplace." />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <XtraCard
            name={`${me?.firstName} ${me?.lastName}`.toUpperCase()}
            maskedPan={card.maskedPan}
            expiry={`${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`}
            frozen={frozen}
          />
          <div className="flex gap-2">
            <Button onClick={() => setPay(true)} disabled={frozen || !balance.data}>
              Make a payment
            </Button>
            <Button variant="secondary" onClick={toggle} loading={busy}>
              {frozen ? <Unlock className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />} {frozen ? 'Unfreeze' : 'Freeze card'}
            </Button>
          </div>
        </div>
        <Card className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Status</span>
            <StatusBadge status={card.status} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Type</span>
            <span className="font-medium">{card.kind === 'VIRTUAL' ? 'Virtual' : 'Physical'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Spending power</span>
            <span className="font-semibold">{formatZAR(balance.data?.xtraBalanceCents)}</span>
          </div>
          <Alert tone="blue">
            Each payment uses your wallet first. Any shortfall is covered instantly by your best matched lender offer and repaid in fixed monthly installments.
          </Alert>
        </Card>
      </div>
      {balance.data && <PayModal open={pay} onClose={() => setPay(false)} cardId={card.id} balance={balance.data} onDone={() => balance.reload()} />}
    </div>
  );
}
