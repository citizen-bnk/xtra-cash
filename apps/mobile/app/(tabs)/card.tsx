import { useState } from 'react';
import { router } from 'expo-router';
import { useApi, useAuth } from '../../src/auth';
import { Button, Card, H1, Loading, Muted, Row, Screen, Status } from '../../src/ui';
import { XtraCard } from '../../src/XtraCard';

export default function CardScreen() {
  const { me, client } = useAuth();
  const cards = useApi((c) => c.consumer.cards());
  const [busy, setBusy] = useState(false);
  if (!cards.data) return <Loading />;
  const card = cards.data[0];
  if (!card)
    return (
      <Screen>
        <H1>XTRA-CASH card</H1>
        <Card>
          <Muted>Verify your profile to get your virtual card instantly.</Muted>
          {me?.kyc?.status === 'VERIFIED' ? (
            <Button title="Issue my card" onPress={() => client.consumer.issueCard().then(cards.reload)} />
          ) : (
            <Button title="Verify now" onPress={() => router.push('/kyc')} />
          )}
        </Card>
      </Screen>
    );
  const frozen = card.status === 'FROZEN';
  const toggle = async () => {
    setBusy(true);
    try {
      await client.consumer.freezeCard(card.id, !frozen);
      await cards.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <H1>XTRA-CASH card</H1>
      <XtraCard
        name={`${me?.firstName} ${me?.lastName}`.toUpperCase()}
        maskedPan={card.maskedPan}
        expiry={`${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`}
        frozen={frozen}
      />
      <Card>
        <Row k="Status" v={<Status status={card.status} />} />
        <Row k="Type" v={card.kind === 'VIRTUAL' ? 'Virtual' : 'Physical'} />
      </Card>
      <Button title={frozen ? 'Unfreeze card' : 'Freeze card'} variant="secondary" onPress={toggle} loading={busy} />
      <Button title="Make a payment" onPress={() => router.push('/pay')} disabled={frozen} />
      <Muted style={{ fontSize: 12 }}>Each payment uses your wallet first; any shortfall is covered instantly by your best matched lender offer.</Muted>
    </Screen>
  );
}
