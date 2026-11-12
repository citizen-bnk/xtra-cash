import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { formatZAR } from '@xtra/shared';
import { useApi, useAuth } from '../../src/auth';
import { Button, Card, H1, Loading, Muted, Screen, Status } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Loans() {
  const { me } = useAuth();
  const loans = useApi((c) => c.consumer.loans());
  const applications = useApi((c) => c.consumer.personalApplications(), [me?.id]);
  useFocusEffect(() => {
    loans.reload();
    applications.reload();
  });
  if (!loans.data || !applications.data) return <Loading />;
  const owed = loans.data.filter((l) => l.status !== 'SETTLED').reduce((s, l) => s + l.outstandingCents, 0);
  return (
    <Screen refreshing={loans.loading || applications.loading} onRefresh={() => { void loans.reload(); void applications.reload(); }}>
      <View style={{ gap: 4 }}>
        <H1>Loans</H1>
        <Muted>Applications and repayments in one place.</Muted>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Your applications</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/personal-loan')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.brandDark, fontWeight: '800' }}>Get a new loan +</Text>
        </Pressable>
      </View>
      {applications.data.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 17 }}>Your first loan starts here</Text>
          <Muted style={{ textAlign: 'center' }}>Choose an amount and term. Your applications will appear here.</Muted>
          <Button title="Take your first loan" onPress={() => router.push('/personal-loan')} />
        </Card>
      ) : applications.data.map((application) => (
        <Pressable key={application.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/personal-loan', params: { applicationId: application.id } })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: colors.ink, fontWeight: '800', flex: 1 }}>{formatZAR(application.amountCents)} · {application.termMonths} months</Text>
              <Status status={application.status} />
            </View>
            <Muted style={{ fontSize: 12 }}>{application.purpose} · {new Date(application.createdAt).toLocaleDateString('en-ZA')}</Muted>
            <View style={{ height: 3, backgroundColor: colors.line, borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
              <View style={{ width: ['OFFERED', 'ACCEPTED', 'AGREED', 'FUNDING_PENDING', 'DISBURSED'].includes(application.status) ? '82%' : ['UNDER_REVIEW', 'REFERRED', 'ACTION_REQUIRED'].includes(application.status) ? '52%' : '18%', height: '100%', backgroundColor: colors.brand }} />
            </View>
            <Text style={{ color: colors.brandDark, fontSize: 12, fontWeight: '700', marginTop: 3 }}>{application.status === 'OFFERED' ? 'Offer ready · Tap to review' : application.status === 'ACTION_REQUIRED' ? 'Action needed · Tap to respond' : 'Tap to view progress'}</Text>
          </Card>
        </Pressable>
      ))}

      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Active repayments</Text>
        <Muted>You owe {formatZAR(owed)} in total.</Muted>
      </View>
      {loans.data.length === 0 ? <Card><Muted>No active repayments.</Muted></Card> : null}
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
