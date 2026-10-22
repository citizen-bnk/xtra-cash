'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Field, Input, Loading, PageHeader, Select, StatusBadge, Textarea, useApi, useAuth } from '@xtra/ui';
type Campaign = { id: string; title: string; message: string; status: string; startsAt: string; endsAt: string; target: { label: string; radiusMeters: number }; accepted: number; failed: number; events: Record<string, number> };
export default function Campaigns() {
  const { client } = useAuth(), campaigns = useApi(c => c.request<Campaign[]>('GET', '/lender/marketing/campaigns')), offers = useApi(c => c.lender.offers());
  const [offerId, setOfferId] = useState(''), [title, setTitle] = useState(''), [message, setMessage] = useState('Explore an offer near you. Eligibility checks and lender approval apply.');
  const [end, setEnd] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function create() { setBusy(true); setError(''); try { await client.request('POST', '/lender/marketing/campaigns', { offerId, title, message, startsAt: new Date().toISOString(), endsAt: new Date(end).toISOString() }); setOfferId(''); setTitle(''); await campaigns.reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save campaign'); } finally { setBusy(false); } }
  async function status(id: string, state: string) { setBusy(true); setError(''); try { await client.request('PUT', `/lender/marketing/campaigns/${id}/status`, { status: state }); await campaigns.reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update campaign'); } finally { setBusy(false); } }
  return <div className="space-y-5"><PageHeader title="Nearby campaigns" subtitle="Reach members who opt in to offers near them." />
    <Alert tone="blue">Location controls advertising only. Applications use normal checks. One alert per offer per member per day; at most two marketing pushes per day. Quiet hours: 20:00–08:00 South African time.</Alert>
    {(error || campaigns.error) && <Alert tone="red">{error || campaigns.error}</Alert>}
    <Card><h2 className="mb-4 text-xl font-bold">Create a campaign</h2><form className="space-y-4" onSubmit={e => { e.preventDefault(); void create(); }}>
      <Field label="Offer with an advertising location"><Select required value={offerId} onChange={e => setOfferId(e.target.value)}><option value="">Choose an offer</option>{offers.data?.filter(o => o.locationTarget).map(o => <option value={o.id} key={o.id}>{o.name} · {o.locationTarget!.label} · {o.locationTarget!.radiusMeters} m</option>)}</Select></Field>
      <p className="text-xs text-muted">Set a pin and radius in <Link href="/lender/offers" className="underline">Offers & criteria</Link> first. Campaigns retain a snapshot of that area.</p>
      <Field label="Campaign name"><Input required value={title} maxLength={80} minLength={2} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="Campaign description" hint="Lock-screen notifications use a neutral message without personal or lender details."><Textarea required value={message} maxLength={200} minLength={5} onChange={e => setMessage(e.target.value)} /></Field>
      <Field label="End date and time" hint="Within 90 days. The campaign starts when activated."><Input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} /></Field>
      <Button loading={busy}>Save campaign draft</Button>
    </form></Card>
    {!campaigns.data ? <Loading /> : campaigns.data.length === 0 ? <p className="text-sm text-muted">No campaigns yet.</p> : campaigns.data.map(c => <Card key={c.id}><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">{c.title}</h2><StatusBadge status={c.status} /></div><p className="mt-2 text-sm">{c.target.label} · {c.target.radiusMeters} m</p><p className="mt-1 text-xs text-muted">Ends {new Date(c.endsAt).toLocaleString('en-ZA')}</p><div className="my-4 flex flex-wrap gap-5 text-sm"><span><b>{c.accepted}</b> accepted by push provider</span><span><b>{c.failed}</b> failed attempts</span><span><b>{c.events.OPEN || 0}</b> members opened</span><span><b>{c.events.SHARE || 0}</b> members shared</span><span><b>{c.events.APPLY || 0}</b> application starts</span></div><p className="mb-4 text-xs text-muted">Provider acceptance does not confirm the member saw a notification. Open and share counts are recorded separately.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} variant={c.status === 'ACTIVE' ? 'secondary' : 'accent'} onClick={() => status(c.id, c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}>{c.status === 'ACTIVE' ? 'Pause' : 'Activate'}</Button><Link href={`/offers/${c.id}`} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">View share page</Link></div></Card>)}
  </div>;
}
