'use client';
import { useEffect } from 'react';
import { useAuth } from '@xtra/ui';
import { MARKETING_CHANGED, type MarketingPreferences } from './NearbyOffers';
/** Foreground only. No permission prompt until the member explicitly opts in. */
export function MarketingLocationObserver() {
  const { client, me } = useAuth();
  useEffect(() => {
    if (!me?.roles.includes('CONSUMER') || !navigator.geolocation || !navigator.permissions) return;
    let alive = true, watch: number | undefined, lastSent = 0, sending = false, generation = 0;
    const stop = () => { generation++; if (watch !== undefined) navigator.geolocation.clearWatch(watch); watch = undefined; };
    const sync = async () => {
      stop(); const ticket = generation;
      if (document.hidden) return;
      try {
        const [prefs, permission] = await Promise.all([client.request<MarketingPreferences>('GET', '/marketing/preferences'), navigator.permissions.query({ name: 'geolocation' })]);
        if (!alive || ticket !== generation || document.hidden || !prefs.marketing || !prefs.locationEnabled || permission.state !== 'granted') return;
        watch = navigator.geolocation.watchPosition(async p => {
          if (sending || document.hidden || !alive || ticket !== generation || Date.now() - lastSent < 30000 || p.coords.accuracy > 1000) return;
          sending = true; lastSent = Date.now();
          try { await client.request('POST', '/marketing/location', { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() }); } catch { /* Explicit nearby checks show connection/permission errors. */ } finally { sending = false; }
        }, () => stop(), { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 });
      } catch { /* Marketing availability never blocks the main application. */ }
    };
    document.addEventListener('visibilitychange', sync); window.addEventListener(MARKETING_CHANGED, sync); void sync();
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', sync); window.removeEventListener(MARKETING_CHANGED, sync); };
  }, [client, me]);
  return null;
}
