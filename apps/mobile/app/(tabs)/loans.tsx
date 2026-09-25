import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatZAR } from '@xtra/shared';
import { useApi } from '../../src/auth';
import { Card, H1, Loading, Muted, Screen, Status } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Loans() {
  const loans = useApi((c) => c.consumer.loans());
  useFocusEffect(() => {
    loans.reload();
  });
  if (!loans.data) return <Loading />;
  const owed = loans.data.filter((l) => l.status !== 'SETTLED').reduce((s, l) => s + l.outstandingCents, 0);
  return (
    <Screen refreshing={loans.loading} onRefresh={loans.reload}>
      <H1>Repayments</H1>
      <Muted>You owe {formatZAR(owed)} in total.</Muted>
      {loans.data.length === 0 && (
        <Card>
          <Muted>You haven't used XTRA-CASH credit yet.</Muted>
        </Card>
      )}
      {loans.data.map((l) => (
        <Pressable key={l.id} onPress={() => router.push(`/loan/${l.id}`)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{l.lenderName}</Text>
              <Status status={l.status} />
            </View>
            <Muted style={{ fontSize: 12 }}>{l.offerName} · borrowed {formatZAR(l.principalCents)} on {new Date(l.createdAt).toLocaleDateString('en-ZA')}</Muted>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 12 }}>{l.nextDue ? `Next due ${new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}` : 'Paid up'}</Muted>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{formatZAR(l.outstandingCents)}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
