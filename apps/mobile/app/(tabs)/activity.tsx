import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatZAR } from '@xtra/shared';
import { useApi } from '../../src/auth';
import { Card, H1, Loading, Muted, Screen, Status } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Activity() {
  const tx = useApi((c) => c.consumer.transactions(1));
  useFocusEffect(() => {
    tx.reload();
  });
  if (!tx.data) return <Loading />;
  return (
    <Screen refreshing={tx.loading} onRefresh={tx.reload}>
      <H1>Activity</H1>
      {tx.data.items.length === 0 && (
        <Card>
          <Muted>No payments yet.</Muted>
        </Card>
      )}
      {tx.data.items.map((t) => (
        <Card key={t.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: colors.ink, flex: 1 }}>{t.merchantName}</Text>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{formatZAR(t.amountCents)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Muted style={{ fontSize: 12 }}>{new Date(t.createdAt).toLocaleString('en-ZA')}</Muted>
            <Status status={t.status} />
          </View>
          {t.status === 'APPROVED' ? (
            <Muted style={{ fontSize: 12 }}>Wallet {formatZAR(t.fromWalletCents)} · XTRA-CASH {formatZAR(t.fromCreditCents)}</Muted>
          ) : (
            <Text style={{ color: colors.red, fontSize: 12 }}>{t.declineReason}</Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}
