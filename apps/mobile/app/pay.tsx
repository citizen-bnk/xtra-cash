import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatZAR, type Transaction } from '@xtra/shared';
import { errorMessage, useApi, useAuth } from '../src/auth';
import { Button, Card, Chip, ErrorText, Field, H1, Loading, Muted, Row, Screen, toCents } from '../src/ui';
import { colors } from '../src/theme';

/** Pay (in-app / marketplace / demo swipe) or top up the wallet. */
export default function Pay() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { client, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const cards = useApi((c) => c.consumer.cards());
  const [amountText, setAmountText] = useState('');
  const [merchant, setMerchant] = useState('');
  const [channel, setChannel] = useState<'IN_STORE' | 'ONLINE' | 'MARKETPLACE'>('IN_STORE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Transaction | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const amount = toCents(amountText) ?? 0;
  const b = balance.data;
  const fromWallet = Math.min(b?.walletCents ?? 0, amount);
  const fromCredit = Math.max(0, amount - fromWallet);

  useEffect(() => {
    setEstimate(null);
    const best = b?.offers.find((o) => o.availableCents >= fromCredit);
    if (mode === 'topup' || !best || fromCredit < 100) return;
    const t = setTimeout(() => {
      client.consumer.quote(best.offerId, fromCredit).then((q) => setEstimate(`${best.termMonths} × ${formatZAR(q.monthlyInstallmentCents)} with ${best.lenderName} (total ${formatZAR(q.totalRepayableCents)})`)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [fromCredit, b, client, mode]);

  if (!b || !cards.data) return <Loading />;

  if (mode === 'topup') {
    const topUp = async () => {
      setLoading(true);
      setError(null);
      try {
        await client.consumer.topUp(amount);
        await refreshMe();
        router.back();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    return (
      <Screen>
        <H1>Top up wallet</H1>
        <Muted>Your wallet always pays first, so topping up means you borrow less.</Muted>
        <Field label="Amount (R)" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} placeholder="0.00" />
        <ErrorText>{error}</ErrorText>
        <Button title={`Top up ${amount ? formatZAR(amount) : ''}`} onPress={topUp} loading={loading} disabled={amount < 100} />
      </Screen>
    );
  }

  if (result)
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 6, marginTop: 20 }}>
          <Text style={{ fontSize: 48 }}>{result.status === 'APPROVED' ? '✅' : '❌'}</Text>
          <H1>{result.status === 'APPROVED' ? 'Approved' : 'Declined'}</H1>
          <Muted>{result.merchantName} · {formatZAR(result.amountCents)}</Muted>
        </View>
        <Card>
          {result.status === 'APPROVED' ? (
            <>
              <Row k="From wallet" v={formatZAR(result.fromWalletCents)} />
              {result.loans?.map((l) => <Row key={l.id} k={`XTRA-CASH · ${l.lenderName}`} v={formatZAR(l.principalCents)} />)}
            </>
          ) : (
            <Text style={{ color: colors.red }}>{result.declineReason}</Text>
          )}
        </Card>
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );

  const card = cards.data[0];
  const pay = async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await client.consumer.purchase(card.id, {
        amountCents: amount,
        merchantName: merchant,
        channel,
        idempotencyKey: `app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setResult(t);
      refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Muted>XTRA-Balance {formatZAR(b.xtraBalanceCents)}</Muted>
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="e.g. Shoprite Soweto" />
      <Field label="Amount (R)" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} placeholder="0.00" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label="In store" on={channel === 'IN_STORE'} onPress={() => setChannel('IN_STORE')} />
        <Chip label="Online" on={channel === 'ONLINE'} onPress={() => setChannel('ONLINE')} />
        <Chip label="Marketplace" on={channel === 'MARKETPLACE'} onPress={() => setChannel('MARKETPLACE')} />
      </View>
      {amount > 0 && (
        <Card>
          <Row k="From wallet" v={formatZAR(fromWallet)} />
          <Row k="XTRA-CASH credit" v={formatZAR(fromCredit)} />
          {estimate && <Muted style={{ fontSize: 12 }}>Est. {estimate}</Muted>}
        </Card>
      )}
      {amount > b.xtraBalanceCents && <ErrorText>This is more than your XTRA-Balance.</ErrorText>}
      <ErrorText>{error}</ErrorText>
      <Button title={`Pay ${amount ? formatZAR(amount) : ''}`} onPress={pay} loading={loading} disabled={!card || card.status !== 'ACTIVE' || !merchant || amount < 100 || amount > b.xtraBalanceCents} />
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>Credit comes from accredited lenders and is only offered when affordable.</Muted>
    </Screen>
  );
}
