import { useEffect, useState } from 'react';
import { Linking, Share, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatZAR, type NearbyCampaign } from '@xtra/shared';
import { useApi, useAuth } from '../../src/auth';
import { Button, Card, H1, Loading, Muted, Screen } from '../../src/ui';
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://xtra-cash.vercel.app';
export default function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>(), { client, me } = useAuth();
  const offer = useApi(c => c.request<NearbyCampaign>('GET', `${me?.roles.includes('CONSUMER') ? '/marketing' : ''}/campaigns/${id}`), [id, me?.id]), [error, setError] = useState('');
  useEffect(() => { if (me?.roles.includes('CONSUMER')) void client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'OPEN' }).catch(() => {}); }, [client, id, me?.id]);
  if (!offer.data) return <Screen>{offer.error ? <Text>{offer.error}</Text> : <Loading />}</Screen>;
  const o = offer.data;
  return <Screen><H1>{o.title}</H1><Card><Muted>{o.place}</Muted><Text>{formatZAR(o.minAmountCents)}–{formatZAR(o.maxAmountCents)} · {o.termMonths} months</Text><Muted>{o.message}</Muted><Muted>Sharing does not transfer eligibility. Lender names remain private until verification.</Muted></Card>
    <Button title={o.productType === 'PERSONAL' ? 'Apply' : 'Explore BNPL'} onPress={async () => { const next = o.productType === 'PERSONAL' ? `/personal-loan?amountCents=${Math.max(50000, Math.min(o.maxAmountCents, Math.max(100000, o.minAmountCents)))}&termMonths=${o.termMonths}` : '/app'; try { await Linking.openURL(WEB_URL + next); if (me?.roles.includes('CONSUMER')) await client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'APPLY' }); } catch { setError('Could not open the offer. Please try again.'); } }} />
    <Button title="Share offer" variant="secondary" onPress={async () => { try { const result = await Share.share({ message: `Explore this XTRA-CASH offer: ${WEB_URL}/offers/${id}` }); if (result.action === Share.sharedAction && me?.roles.includes('CONSUMER')) await client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'SHARE' }); } catch { setError('Could not share this offer.'); } }} />{error && <Text>{error}</Text>}
  </Screen>;
}
