import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import type { NearbyCampaign } from '@xtra/shared';
import { useApi, useAuth } from '../src/auth';
import { enableBackgroundOffers, enableNativePush, reportLocation, stopNearby, unregisterNearbyDevice } from '../src/nearby';
import { Button, Card, H1, H2, Muted, Screen } from '../src/ui';
export default function Nearby() {
  const { me, client } = useAuth(), prefs = useApi(c => c.request<{ marketing: boolean; locationEnabled: boolean }>('GET', '/marketing/preferences'));
  const [marketing, setMarketing] = useState(false), [locationEnabled, setLocationEnabled] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [offers, setOffers] = useState<NearbyCampaign[]>([]);
  useEffect(() => { if (prefs.data) { setMarketing(prefs.data.marketing); setLocationEnabled(prefs.data.locationEnabled); } }, [prefs.data]);
  async function action(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not complete this action'); } finally { setBusy(false); } }
  if (!me) return null;
  return <Screen><H1>Offers near you</H1><Muted>Nearby advertising is optional and does not affect your ability to apply for credit.</Muted><Card>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text>Marketing offers</Text><Switch accessibilityLabel="Marketing offers" value={marketing} onValueChange={v => { setMarketing(v); if (!v) setLocationEnabled(false); }} /></View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text>Use my location</Text><Switch accessibilityLabel="Use my location" disabled={!marketing} value={locationEnabled} onValueChange={setLocationEnabled} /></View>
    <Muted>Only your latest location is stored, encrypted. It expires after 24 hours and is removed by regular cleanup. Turning location off deletes it immediately.</Muted>
    <Button title="Save choices" loading={busy} onPress={() => action(async () => { await client.request('PUT', '/marketing/preferences', { marketing, locationEnabled: marketing && locationEnabled }); if (!marketing) await unregisterNearbyDevice(); else if (!locationEnabled) await stopNearby(); await prefs.reload(); setOffers([]); setMessage('Your choices have been saved.'); })} />
  </Card>{prefs.data?.marketing && prefs.data.locationEnabled && <><Button title="Check nearby offers" loading={busy} onPress={() => action(async () => { if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('Allow location in device settings to find nearby offers.'); const r = await reportLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), client); setOffers(r.offers); if (r.needsVerification) setMessage('Complete identity verification to see matching nearby offers.'); else if (!r.offers.length) setMessage('No matching offers nearby right now.'); })} />
    <Button title="Enable notifications" variant="secondary" loading={busy} onPress={() => action(async () => { await enableNativePush(); setMessage('Device notifications enabled.'); })} />
    <Card><H2>Arrival alerts</H2><Muted>Background location can detect when you arrive near an offer while the app is closed. Device permissions, GPS accuracy and battery settings affect detection. You can keep this off and still check offers manually.</Muted><Button title="Enable background arrival alerts" variant="secondary" loading={busy} onPress={() => action(async () => { await enableBackgroundOffers(me.id); setMessage('Arrival detection enabled for currently active offer areas.'); })} /><Button title="Stop background arrival alerts" variant="secondary" loading={busy} onPress={() => action(async () => { await stopNearby(); setMessage('Background arrival detection stopped.'); })} /></Card></>}
    <Muted>One push per offer per day. At most two marketing pushes per day. Quiet hours: 20:00–08:00 South African time.</Muted>{(message || prefs.error) && <Text accessibilityRole="alert">{message || prefs.error}</Text>}{offers.map(o => <Card key={o.id}><H2>{o.title}</H2><Muted>{o.place}</Muted><Button title="View and share" onPress={() => router.push(`/offer/${o.id}`)} /></Card>)}
  </Screen>;
}
