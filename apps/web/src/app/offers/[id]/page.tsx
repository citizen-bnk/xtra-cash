'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatZAR, type NearbyCampaign } from '@xtra/shared';
import { Alert, Button, Card, Loading, useApi, useAuth } from '@xtra/ui';
import { AuthPageShell } from '@/components/AuthPageShell';
export default function CampaignPage() {
  const { id } = useParams<{ id: string }>(), { client, me } = useAuth(), router = useRouter();
  const offer = useApi(c => c.request<NearbyCampaign>('GET', `${me?.roles.includes('CONSUMER') ? '/marketing' : ''}/campaigns/${id}`), [id, me?.id]);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (me?.roles.includes('CONSUMER')) void client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'OPEN' }).catch(() => {}); }, [client, id, me]);
  async function share() { const url = `${location.origin}/offers/${id}`; try { if (navigator.share) await navigator.share({ title: 'XTRA-CASH nearby offer', url }); else { await navigator.clipboard.writeText(url); setNotice('Offer link copied.'); } if (me?.roles.includes('CONSUMER')) await client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'SHARE' }); } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setNotice('Could not share. You can copy the page address.'); } }
  async function apply() {
    if (!offer.data) return;
    const o = offer.data, amount = Math.max(50000, Math.min(10000000, o.maxAmountCents, Math.max(100000, o.minAmountCents)));
    if (o.productType === 'PERSONAL') sessionStorage.setItem('xtra-personal-request', JSON.stringify({ amountCents: amount, termMonths: o.termMonths, selectedAt: Date.now(), campaignId: id, offerId: o.offerId }));
    if (me?.roles.includes('CONSUMER')) void client.request('POST', `/marketing/campaigns/${id}/events`, { kind: 'APPLY' }).catch(() => {});
    const next = o.productType === 'PERSONAL' ? '/app/personal-loan' : '/app';
    router.push(me ? next : `/register?type=CONSUMER&next=${encodeURIComponent(next)}`);
  }
  return <AuthPageShell currentPath="/offers"><Card className="w-full max-w-lg space-y-5 p-6 sm:p-8">{offer.error ? <Alert tone="amber">{offer.error}</Alert> : !offer.data ? <Loading /> : <><span className="text-xs font-bold uppercase tracking-widest text-brand-purple">Nearby offers</span><h1 className="text-3xl font-bold">{offer.data.title}</h1><p>{offer.data.place}</p><p className="text-sm text-muted">{offer.data.message}</p><div className="rounded-xl bg-brand-soft p-4"><p className="font-semibold">{formatZAR(offer.data.minAmountCents)}–{formatZAR(offer.data.maxAmountCents)}</p><p className="mt-1 text-sm">{offer.data.termMonths} months · {offer.data.productType === 'PERSONAL' ? 'Personal loan' : 'BNPL'}</p></div><p className="text-xs text-muted">Sharing does not transfer eligibility. Each person applies with their own profile. Lender names remain private until verification. Being nearby does not guarantee approval.</p>{notice && <p role="status" className="text-sm">{notice}</p>}<div className="flex flex-wrap gap-2"><Button onClick={apply}>{offer.data.productType === 'PERSONAL' ? 'Start application' : 'Explore BNPL'}</Button><Button variant="secondary" onClick={share}>Share offer</Button></div></>}</Card></AuthPageShell>;
}
