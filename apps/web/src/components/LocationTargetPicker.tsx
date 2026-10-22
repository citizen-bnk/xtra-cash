'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { LocationTarget } from '@xtra/shared';
import { Alert, Button, Field, Input, useAuth } from '@xtra/ui';
const Map = dynamic(() => import('./TargetMap'), { ssr: false, loading: () => <p className="p-8 text-sm text-muted">Loading map…</p> });
const initial: LocationTarget = { latitude: -26.034, longitude: 28.046, radiusMeters: 500, label: 'Selected map pin' };
export function LocationTargetPicker({ value, onChange, suggestion }: { value: LocationTarget | null; onChange: (target: LocationTarget | null) => void; suggestion?: { query: string; radiusMeters: number } | null }) {
  const { client } = useAuth();
  const [query, setQuery] = useState(''), [results, setResults] = useState<Omit<LocationTarget, 'radiusMeters'>[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (suggestion) setQuery(suggestion.query); }, [suggestion]);
  async function search(nearby = false, center = value) {
    setError(''); setBusy(true);
    try { setResults(await client.request('GET', '/lender/marketing/places', undefined, { q: nearby ? '' : query, lat: center?.latitude, lng: center?.longitude })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not find places'); } finally { setBusy(false); }
  }
  function current() {
    if (!navigator.geolocation) { setError('Location is not supported on this device. Choose a map pin.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(p => { const target = { latitude: p.coords.latitude, longitude: p.coords.longitude, radiusMeters: value?.radiusMeters || 500, label: 'Current location' }; onChange(target); setBusy(false); void search(true, target); }, () => { setError('Location was not available. Search for a place or select a map pin.'); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  return <section className="space-y-3 rounded-xl border border-line p-4" aria-label="Location targeting">
    <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? { ...initial, radiusMeters: suggestion?.radiusMeters || 500 } : null)} className="mt-1" />Target nearby advertising</label>
    {suggestion && <p className="text-sm">Suggested area: <b>{suggestion.query}</b> · {suggestion.radiusMeters} m. Enable targeting and confirm the pin on the map.</p>}
    <p className="text-xs text-muted">Optional. Location targets adverts; it does not restrict applications or change credit decisions.</p>
    {value && <><div className="flex gap-2"><Input aria-label="Search for a place" placeholder="e.g. Mall of Africa, Waterfall" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} /><Button type="button" variant="secondary" disabled={!query.trim() || busy} onClick={() => search()}>Search</Button></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={current}>Use current location</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => search(true)}>Nearby places</Button></div>
      {error && <Alert tone="amber">{error}</Alert>}
      {results.length > 0 && <ul className="max-h-44 space-y-1 overflow-y-auto">{results.map(p => <li key={p.placeId}><button type="button" className="w-full rounded-lg border border-line p-2 text-left text-sm hover:bg-brand-soft" onClick={() => { onChange({ ...p, radiusMeters: value.radiusMeters }); setResults([]); }}>{p.label}</button></li>)}</ul>}
      <Map value={value} onChange={onChange} />
      <p className="text-xs text-muted">Tap the map to move the pin. Place search requires a connected Places provider.</p>
      <Field label="Place or pin name"><Input value={value.label} maxLength={160} onChange={e => onChange({ ...value, label: e.target.value })} /></Field>
      <Field label={`Advertising radius · ${value.radiusMeters.toLocaleString()} metres`}><input type="range" aria-label="Advertising radius" aria-valuetext={`${value.radiusMeters} metres`} min={50} max={5000} step={50} value={value.radiusMeters} onChange={e => onChange({ ...value, radiusMeters: Number(e.target.value) })} className="h-11 w-full accent-brand-purple" /><span className="flex justify-between text-xs text-muted"><span>50 m</span><span>5 km</span></span></Field>
      <p className="text-xs text-muted">GPS accuracy affects small areas. The member must be confidently inside the radius before an alert is sent.</p>
    </>}
  </section>;
}
