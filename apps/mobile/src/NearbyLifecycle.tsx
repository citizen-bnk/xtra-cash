import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuth } from './auth';
import { reportLocation, syncRegions, stopNearby } from './nearby';
export function NearbyLifecycle() {
  const { me, client, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!me?.roles.includes('CONSUMER')) { void stopNearby().catch(() => {}); return; }
    let active = true;
    async function refresh() { try { const prefs = await client.request<{ marketing: boolean; locationEnabled: boolean }>('GET', '/marketing/preferences'); if (!active) return; if (!prefs.marketing || !prefs.locationEnabled) { await stopNearby(); return; } if ((await Location.getForegroundPermissionsAsync()).status === 'granted') { const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); if (active) await reportLocation(p, client); } if (active) await syncRegions(); } catch { /* Main app remains usable without marketing. */ } }
    const open = (response: Notifications.NotificationResponse) => { const id = response.notification.request.content.data?.campaignId; if (typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)) router.push(`/offer/${id}`); };
    const notification = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(r => { if (r && active) { open(r); void Notifications.clearLastNotificationResponseAsync(); } });
    const state = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); }); void refresh();
    return () => { active = false; state.remove(); notification.remove(); };
  }, [client, me?.id, loading]);
  return null;
}
