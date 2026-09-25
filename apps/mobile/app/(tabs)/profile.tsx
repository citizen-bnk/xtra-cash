import { Share } from 'react-native';
import { router } from 'expo-router';
import { EMPLOYMENT_LABELS, formatZAR } from '@xtra/shared';
import { useAuth } from '../../src/auth';
import { Button, Card, H1, H2, Muted, Row, Screen, Status } from '../../src/ui';

export default function Profile() {
  const { me, client, refreshMe, logout } = useAuth();
  if (!me) return null;
  return (
    <Screen>
      <H1>Profile</H1>
      <Card>
        <Row k="Name" v={`${me.firstName} ${me.lastName}`} />
        <Row k="Email" v={me.email} />
        <Row k="Mobile" v={me.phone} />
        <Row k="Wallet" v={formatZAR(me.walletBalanceCents)} />
        <Row k="Verification" v={<Status status={me.kyc?.status ?? 'NOT_STARTED'} />} />
        {me.kyc && <Row k="Employment" v={EMPLOYMENT_LABELS[me.kyc.employmentStatus]} />}
        {me.kyc && <Row k="Income" v={formatZAR(me.kyc.monthlyIncomeCents)} />}
      </Card>
      <Button title="Update income & expenses" variant="secondary" onPress={() => router.push('/kyc')} />
      <Card>
        <H2>Invite friends, earn commission</H2>
        {me.affiliate ? (
          <>
            <Muted>Your code: {me.referralCode} · balance {formatZAR(me.affiliate.commissionBalanceCents)}</Muted>
            <Button title="Share my invite" onPress={() => Share.share({ message: `Get the XTRA-CASH card — credit at the till. Use my code ${me.referralCode} when you sign up.` })} />
          </>
        ) : (
          <>
            <Muted>Join the affiliate programme and earn when people you onboard use XTRA-CASH.</Muted>
            <Button title="Become an affiliate" onPress={async () => { await client.affiliate.join(); await refreshMe(); }} />
          </>
        )}
      </Card>
      <Button title="Sign out" variant="danger" onPress={async () => { await logout(); router.replace('/(auth)/login'); }} />
    </Screen>
  );
}
