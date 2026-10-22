import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { XtraClient, type NearbyCampaign } from '@xtra/shared';
import { API_URL, tokenStore } from './session';
const TASK = 'xtra-nearby-arrival', DEVICE = 'xtra.marketing-device', OWNER = 'xtra.nearby-owner';
const client = () => new XtraClient({ baseUrl: API_URL, tokens: tokenStore });
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data || !(await tokenStore.get())) return;
  const owner = await SecureStore.getItemAsync(OWNER);
  if (!owner) return;
  const api = client();
  try {
    const me = await api.auth.me(); if (me.id !== owner) { await stopNearby(); return; }
    const prefs = await api.request<{ marketing: boolean; locationEnabled: boolean }>('GET', '/marketing/preferences');
    if (!prefs.marketing || !prefs.locationEnabled) { await stopNearby(); return; }
    const event = data as { eventType: Location.GeofencingEventType };
    if (event.eventType !== Location.GeofencingEventType.Enter) return;
    const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await reportLocation(point, api);
  } catch { /* No queued stale alert or automatic retry after an uncertain send. */ }
});
export async function reportLocation(point: Location.LocationObject, api = client()) {
  if ((point.coords.accuracy ?? 10000) > 1000 || Date.now() - point.timestamp > 300000) return { offers: [] as NearbyCampaign[], needsVerification: false };
  return api.request<{ offers: NearbyCampaign[]; needsVerification: boolean }>('POST', '/marketing/location', { latitude: point.coords.latitude, longitude: point.coords.longitude, accuracy: point.coords.accuracy ?? 1000, capturedAt: new Date(point.timestamp).toISOString() });
}
export async function stopNearby() {
  if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
  await SecureStore.deleteItemAsync(OWNER);
}
export async function syncRegions() {
  const owner = await SecureStore.getItemAsync(OWNER); if (!owner || !(await tokenStore.get())) return;
  const api = client(), me = await api.auth.me(); if (me.id !== owner) { await stopNearby(); return; }
  const regions = await api.request<{ identifier: string; latitude: number; longitude: number; radiusMeters: number }[]>('GET', '/marketing/regions');
  if (!regions.length) { if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK); return; }
  await Location.startGeofencingAsync(TASK, regions.slice(0, Platform.OS === 'ios' ? 20 : 100).map(r => ({ identifier: r.identifier, latitude: r.latitude, longitude: r.longitude, radius: r.radiusMeters, notifyOnEnter: true, notifyOnExit: false })));
}
export async function enableBackgroundOffers(userId: string) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') throw new Error('Location permission is required for nearby offers.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') throw new Error('Allow background location in device settings to receive arrival alerts.');
  await reportLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  await SecureStore.setItemAsync(OWNER, userId); await syncRegions();
}
export async function enableNativePush() {
  const api = client(), config = await api.request<{ nativePush: boolean }>('GET', '/marketing/preferences');
  if (!config.nativePush) throw new Error('Native push delivery is not enabled yet.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('offers', { name: 'Nearby offers', importance: Notifications.AndroidImportance.DEFAULT });
  if ((await Notifications.requestPermissionsAsync()).status !== 'granted') throw new Error('Notifications are not allowed. You can change this in device settings.');
  const projectId = Constants.easConfig?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('This app build needs an EAS project connection before push can be enabled.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const device = await api.request<{ id: string }>('POST', '/marketing/devices', { platform: 'EXPO', payload: { token } });
  await SecureStore.setItemAsync(DEVICE, device.id);
}
export async function unregisterNearbyDevice() {
  await stopNearby();
  const device = await SecureStore.getItemAsync(DEVICE);
  if (device) { await client().request('DELETE', `/marketing/devices/${device}`).catch(() => {}); await SecureStore.deleteItemAsync(DEVICE); }
}
