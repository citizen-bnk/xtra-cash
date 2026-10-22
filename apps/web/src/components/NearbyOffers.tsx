'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { NearbyCampaign } from '@xtra/shared';
import { Alert, Button, Card, useApi, useAuth } from '@xtra/ui';
export type MarketingPreferences = { marketing: boolean; locationEnabled: boolean; webPush: boolean; vapidPublicKey: string | null; devices: { id: string; platform: string }[] };
export const MARKETING_CHANGED = 'xtra-marketing-changed';
export function NearbyOffers() {
  const { client } = useAuth(), prefs = useApi(c => c.request<MarketingPreferences>('GET', '/marketing/preferences'));
  const [marketing, setMarketing] = useState(false), [locationEnabled, setLocationEnabled] = useState(false), [offers, setOffers] = useState<NearbyCampaign[]>([]), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (prefs.data) { setMarketing(prefs.data.marketing); setLocationEnabled(prefs.data.locationEnabled); } }, [prefs.data]);
  async function save() { setBusy(true); setNotice(''); try { await client.request('PUT', '/marketing/preferences', { marketing, locationEnabled: marketing && locationEnabled }); if (!marketing && 'serviceWorker' in navigator) { const registration = await navigator.serviceWorker.getRegistration(); await (await registration?.pushManager.getSubscription())?.unsubscribe(); } await prefs.reload(); setOffers([]); window.dispatchEvent(new Event(MARKETING_CHANGED)); setNotice('Your choices have been saved.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save preferences'); } finally { setBusy(false); } }
  async function enablePush() { setBusy(true); setNotice(''); try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push is not available in this browser. On iPhone, install XTRA-CASH on the Home Screen and open it there.');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications are not allowed. You can change this in browser or device settings.');
    const registration = await navigator.serviceWorker.ready;
    const key = prefs.data?.vapidPublicKey; if (!key) throw new Error('Notifications are not configured yet.');
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/')), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await client.request('POST', '/marketing/devices', { platform: 'WEB', payload: subscription.toJSON() }); await prefs.reload(); setNotice('Notifications enabled on this device.');
  } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not enable notifications'); } finally { setBusy(false); } }
  function check() { if (!navigator.geolocation) { setNotice('Location is not supported on this device.'); return; } setBusy(true); setNotice(''); navigator.geolocation.getCurrentPosition(async p => { try { const result = await client.request<{ offers: NearbyCampaign[]; needsVerification: boolean }>('POST', '/marketing/location', { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() }); setOffers(result.offers); setNotice(result.needsVerification ? 'Complete identity verification to see offers that fit your profile.' : result.offers.length ? '' : 'No matching nearby offers right now. GPS accuracy may affect small areas.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not check nearby offers'); } finally { setBusy(false); } }, () => { setNotice('Location was not available. Check device permissions and try again.'); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }
  return <Card className="space-y-4"><h2 className="text-xl font-bold">Offers near you</h2><p className="text-sm text-muted">Choose whether to receive nearby advertising. This is optional and does not affect your ability to apply for credit.</p>{prefs.error && <Alert tone="amber">{prefs.error}</Alert>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={marketing} onChange={e => { setMarketing(e.target.checked); if (!e.target.checked) setLocationEnabled(false); }} />I want marketing offers from XTRA-CASH.</label>
    <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!marketing} checked={locationEnabled} onChange={e => setLocationEnabled(e.target.checked)} />Use my current location to find nearby offers. Keep only my latest location, expiring after 24 hours and removed by regular cleanup.</label>
    <p className="text-xs text-muted">At most two marketing notifications per day, one per offer. Quiet hours: 20:00–08:00 South African time. On the website, location updates run while the app is open and visible. Turn this off to stop updates and delete your saved location.</p>
    <div className="flex flex-wrap gap-2"><Button loading={busy} onClick={save}>Save choices</Button>{prefs.data?.marketing && <Button disabled={busy || !prefs.data.webPush} variant="secondary" onClick={enablePush}>Enable device notifications</Button>}{prefs.data?.marketing && prefs.data.locationEnabled && <Button disabled={busy} variant="secondary" onClick={check}>Check nearby offers</Button>}</div>
    {prefs.data?.marketing && !prefs.data.webPush && <p className="text-xs text-muted">Device notifications are not configured yet. You can still view nearby offers here.</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {offers.map(o => <Link key={o.id} href={`/offers/${o.id}`} className="block rounded-xl border border-line p-4 hover:bg-brand-soft"><p className="font-semibold">{o.title}</p><p className="mt-1 text-sm text-muted">{o.place} · {o.termMonths} months</p><span className="mt-2 inline-block text-sm font-semibold text-brand-purple underline">View and share offer</span></Link>)}
  </Card>;
}
