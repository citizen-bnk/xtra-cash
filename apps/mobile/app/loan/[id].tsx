import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { errorMessage, useApi, useAuth } from '../../src/auth';
import { Button, Card, ErrorText, Field, H1, H2, Loading, Muted, Notice, Row, Screen, Status, toCents } from '../../src/ui';
import { colors } from '../../src/theme';

export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, client, refreshMe } = useAuth();
  const loan = useApi((c) => c.consumer.loan(id), [id]);
  const [amountText, setAmountText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = loan.data;
  if (!l) return <Loading />;
  const next = l.nextDue ? l.nextDue.amountCents - l.nextDue.paidCents : 0;

  const pay = async (cents: number) => {
    setLoading(true);
    setError(null);
    try {
      await client.consumer.repay(id, cents);
      await Promise.all([loan.reload(), refreshMe()]);
      setAmountText('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H1>{l.lenderName}</H1>
        <Status status={l.status} />
      </View>
      {l.status === 'IN_ARREARS' && <Notice tone="red" title="Payment overdue">Pay your overdue installment to unlock new XTRA-CASH credit.</Notice>}
      <Card>
        <Row k="Borrowed" v={formatZAR(l.principalCents)} />
        <Row k="Total repayable" v={formatZAR(l.totalRepayableCents)} />
        <Row k="Outstanding" v={formatZAR(l.outstandingCents)} />
        <Muted style={{ fontSize: 12 }}>
          {bpsToPercent(l.monthlyInterestRateBps)} p/m · initiation {formatZAR(l.initiationFeeCents)} · service {formatZAR(l.monthlyServiceFeeCents)}/m · settle early with no penalty
        </Muted>
      </Card>
      {l.status !== 'SETTLED' && (
        <Card>
          <H2>Make a payment</H2>
          <Muted>From your wallet ({formatZAR(me?.walletBalanceCents)})</Muted>
          <Field label="Amount (R)" keyboardType="decimal-pad" value={amountText} onChangeText={setAmountText} placeholder={next ? String(next / 100) : ''} />
          <ErrorText>{error}</ErrorText>
          <Button title={`Pay ${formatZAR(toCents(amountText) ?? next)}`} loading={loading} onPress={() => pay(toCents(amountText) ?? next)} disabled={!(toCents(amountText) ?? next)} />
          <Button title={`Settle in full · ${formatZAR(l.outstandingCents)}`} variant="secondary" onPress={() => pay(l.outstandingCents)} />
        </Card>
      )}
      <H2>Schedule</H2>
      <Card>
        {(l.installments ?? []).map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ color: colors.ink }}>
              {i.seq}. {new Date(i.dueDate).toLocaleDateString('en-ZA')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontWeight: '600', color: colors.ink }}>{formatZAR(i.amountCents)}</Text>
              <Status status={i.status} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
