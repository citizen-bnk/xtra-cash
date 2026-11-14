import { useEffect, useState } from 'react';
import { Image, ImageBackground, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatZAR, type Transaction } from '@xtra/shared';
import { errorMessage, useApi, useAuth } from '../src/auth';
import { Button, Card, Chip, ErrorText, Field, H1, Loading, Muted, Row, Screen, toCents } from '../src/ui';
import { colors } from '../src/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://xtra-cash.vercel.app';
const CARD_ART = require('../assets/card.jpg');
const CUSTOMER_PHOTO = require('../assets/customer-phone.png');

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
  const [view, setView] = useState<'home' | 'merchant'>('home');
  const [topUpInfo, setTopUpInfo] = useState(false);
  const amount = toCents(amountText) ?? 0;
  const b = balance.data;
  const fromWallet = Math.min(b?.walletCents ?? 0, amount);
  const fromCredit = Math.max(0, amount - fromWallet);

  async function openRestaurantCheckout() {
    setError(null);
    try {
      await Linking.openURL(new URL('/scanqr/', WEB_URL).toString());
    } catch {
      setError('Could not open restaurant checkout. Please try again.');
    }
  }

  useEffect(() => {
    setEstimate(null);
    const best = b?.offers.find((o) => o.availableCents >= fromCredit);
    if (mode === 'topup' || !best || fromCredit < 100) return;
    const t = setTimeout(() => {
      client.consumer.quote(best.offerId, fromCredit).then((q) => setEstimate(`${best.termMonths} × ${formatZAR(q.monthlyInstallmentCents)} with ${best.lenderName} (total ${formatZAR(q.totalRepayableCents)})`)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [fromCredit, b, client, mode]);

  if (!b) {
    return <Screen>
      <Button title="Scan a restaurant bill · Demo" onPress={openRestaurantCheckout} />
      <ErrorText>{error || balance.error || cards.error}</ErrorText>
      {(balance.loading || cards.loading) && <Loading />}
    </Screen>;
  }

  if (mode === 'topup') {
    return <Screen><H1>Top up funds</H1><Card><Muted>Wallet top-ups will be available after the payment provider is connected. No funds will be moved from this screen yet.</Muted></Card><Button title="Get a loan" onPress={() => router.push('/(tabs)/loans')} /><Button title="Back to Pay" variant="secondary" onPress={() => router.replace('/pay')} /></Screen>;
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

  const card = cards.data?.[0];
  if (view === 'home') return <Screen>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><H1>Pay</H1><Image source={CUSTOMER_PHOTO} resizeMode="cover" style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#e9caef' }} /></View>
    <ImageBackground source={CARD_ART} resizeMode="cover" imageStyle={{ borderRadius: 22 }} style={{ aspectRatio: 1.586, borderRadius: 22, overflow: 'hidden', padding: 20, justifyContent: 'flex-end', backgroundColor: colors.purple }}>
      <Text style={{ color: colors.white, fontSize: 12, fontWeight: '800', textShadowColor: '#24013d', textShadowRadius: 5 }}>AVAILABLE TO SPEND</Text>
      <Text style={{ color: colors.white, fontSize: 34, fontWeight: '900', textShadowColor: '#24013d', textShadowRadius: 7 }}>{formatZAR(b.xtraBalanceCents)}</Text>
      <Text style={{ color: colors.white, fontSize: 12, textShadowColor: '#24013d', textShadowRadius: 5 }}>Wallet and eligible credit</Text>
    </ImageBackground>
    <Card><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View><Muted>Wallet balance</Muted><Text style={{ color: colors.ink, fontWeight: '900', fontSize: 20 }}>{formatZAR(b.walletCents)}</Text></View>{b.walletCents === 0 ? <Pressable accessibilityRole="button" onPress={() => setTopUpInfo(true)} style={{ backgroundColor: colors.purple, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ color: colors.white, fontWeight: '800' }}>Top up funds</Text></Pressable> : null}</View></Card>
    {topUpInfo ? <Card><Muted>Wallet top-ups will be available when the payment provider is connected.</Muted><Button title="Close" variant="secondary" onPress={() => setTopUpInfo(false)} /></Card> : null}
    <Button title="Scan a restaurant bill · Preview" onPress={openRestaurantCheckout} />
    <Button title="Get a loan" variant="secondary" onPress={() => router.push('/(tabs)/loans')} />
    <Button title="Pay a merchant" variant="secondary" onPress={() => setView('merchant')} />
    <Button title="My card" variant="secondary" onPress={() => router.push('/(tabs)/card')} />
  </Screen>;
  const pay = async () => {
    if (!card) { setError('Activate your XTRA-CASH card before paying a merchant.'); return; }
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
      <Button title="← Back to Pay" variant="secondary" onPress={() => setView('home')} />
      <H1>Pay a merchant</H1>
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
