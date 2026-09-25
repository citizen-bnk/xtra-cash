import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { useApi, useAuth } from '../../src/auth';
import { Button, Card, H2, Loading, Muted, Notice, Screen, Status } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Home() {
  const { me, refreshMe } = useAuth();
  const balance = useApi((c) => c.consumer.balance());
  const loans = useApi((c) => c.consumer.loans());
  const reload = useCallback(() => {
    balance.reload();
    loans.reload();
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(reload);

  const b = balance.data;
  if (!b) return <Loading />;
  const kyc = me?.kyc;
  const open = (loans.data ?? []).filter((l) => l.status !== 'SETTLED');

  return (
    <Screen refreshing={balance.loading} onRefresh={reload}>
      <Muted>Sawubona, {me?.firstName}</Muted>
      {(!kyc || kyc.status !== 'VERIFIED') && (
        <Notice title={kyc?.status === 'PENDING' ? 'Verification in progress' : 'Unlock XTRA-CASH credit'}>
          <Text style={{ color: colors.ink }}>{kyc?.status === 'PENDING' ? "We're reviewing your details." : kyc?.status === 'REJECTED' ? kyc.rejectionReason : 'Verify your ID, income and expenses to get your card and matched offers.'}</Text>
          {kyc?.status !== 'PENDING' && (
            <Pressable onPress={() => router.push('/kyc')}>
              <Text style={{ fontWeight: '700', marginTop: 6, color: colors.ink }}>Verify now →</Text>
            </Pressable>
          )}
        </Notice>
      )}

      <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 20, gap: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)' }}>XTRA-Balance · available now</Text>
        <Text style={{ color: colors.white, fontSize: 38, fontWeight: '900', letterSpacing: -1 }}>{formatZAR(b.xtraBalanceCents)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)' }}>Wallet {formatZAR(b.walletCents)} · Credit {formatZAR(b.creditCents)}</Text>
        {b.reasonIfNone && kyc?.status === 'VERIFIED' && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{b.reasonIfNone}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button title="Pay" variant="accent" style={{ flex: 1 }} onPress={() => router.push('/pay')} disabled={kyc?.status !== 'VERIFIED'} />
          <Button title="Top up" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/pay', params: { mode: 'topup' } })} />
        </View>
      </View>

      <H2>Matched lender offers</H2>
      {b.offers.length ? (
        b.offers.map((o, i) => (
          <Card key={o.offerId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{o.offerName}{i === 0 ? '  · lowest cost' : ''}</Text>
                <Muted>{o.lenderName}</Muted>
              </View>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{formatZAR(o.availableCents)}</Text>
            </View>
            <Muted style={{ fontSize: 12 }}>
              {bpsToPercent(o.monthlyInterestRateBps)} p/m · {o.termMonths} months · fees {formatZAR(o.initiationFeeCents)} + {formatZAR(o.monthlyServiceFeeCents)}/m
            </Muted>
            {o.exampleQuote && (
              <Muted style={{ fontSize: 12 }}>
                {formatZAR(o.exampleQuote.principalCents)} → {o.termMonths} × {formatZAR(o.exampleQuote.monthlyInstallmentCents)}
              </Muted>
            )}
          </Card>
        ))
      ) : (
        <Card>
          <Muted>{b.reasonIfNone ?? 'No offers yet.'}</Muted>
        </Card>
      )}

      <H2>Upcoming repayments</H2>
      {open.length ? (
        open.map((l) => (
          <Pressable key={l.id} onPress={() => router.push(`/loan/${l.id}`)}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{l.lenderName}</Text>
                <Status status={l.status} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 12 }}>{l.nextDue ? `Next ${formatZAR(l.nextDue.amountCents - l.nextDue.paidCents)} · ${new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}` : ''}</Muted>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{formatZAR(l.outstandingCents)}</Text>
              </View>
            </Card>
          </Pressable>
        ))
      ) : (
        <Card>
          <Muted>No repayments due.</Muted>
        </Card>
      )}
    </Screen>
  );
}
