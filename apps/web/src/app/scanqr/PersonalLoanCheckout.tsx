'use client';

import { useEffect, useRef, useState } from 'react';
import { CandidateOffers, useApi, useAuth } from '@xtra/ui';
import { formatZAR } from '@xtra/shared';
import { SimpleLoanRequest } from '@/components/SimpleLoanRequest';

type ApprovedOffer = {
  id: string; status: string; lender_name: string; content: string; digest: string; expires_at: string;
  terms: { principalCents: number; termMonths: number; monthlyInstallmentCents: number; totalRepayableCents: number };
};
type Offers = { offers: ApprovedOffer[]; configuration: { enabled: boolean; agreementsEnabled: boolean } };

export default function PersonalLoanCheckout({ tableToken, shortfall, onClose }: { tableToken: string; shortfall: number; onClose: () => void }) {
  const { client, me } = useAuth();
  const storageKey = 'xc.checkout.' + me?.id + '.' + tableToken;
  const [applicationId, setApplicationId] = useState('');
  const data = useApi(c => c.request<Offers>('GET', '/personal-checkout'));
  const [selected, setSelected] = useState('');
  const [apply, setApply] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [signature, setSignature] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const point = useRef<{x:number;y:number}|null>(null);
  const offer = data.data?.offers.find(item => item.id === selected);
  const applications = useApi(c => applicationId ? c.consumer.personalApplications() : Promise.resolve(undefined), [applicationId]);
  const application = applications.data?.find(item => item.id === applicationId);
  const awaitingLenders = application && ['SUBMITTED', 'REFERRED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(application.status);
  useEffect(() => {
    try { setSelected(sessionStorage.getItem(storageKey + '.offer') || ''); setApplicationId(sessionStorage.getItem(storageKey + '.application') || ''); } catch { /* Optional session memory. */ }
  }, [storageKey]);
  useEffect(() => {
    const refresh = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) {
        void data.reload();
        if (applicationId) void applications.reload();
      }
    }, 15000);
    return () => window.clearInterval(refresh);
  }, [data.reload, applications.reload, applicationId]);
  function select(id: string) {
    setSelected(id); setAcknowledged(false); setSignature(''); setPassword(''); setMessage('');
    try { sessionStorage.setItem(storageKey + '.offer', id); } catch { /* Optional session memory. */ }
  }
  async function run(task:()=>Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await task(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not continue this loan.'); }
    finally { setBusy(false); }
  }
  return <section className="sq-card sq-schedule">
    <div className="sq-row"><strong>Personal loan</strong><button className="sq-text-button" type="button" onClick={onClose}>Back to bill</button></div>
    <p className="sq-note">Wallet shortfall {formatZAR(shortfall)}</p>
    {data.loading && !data.data && <p>Checking your offers…</p>}
    {data.error && <p role="alert" className="sq-error">{data.error}</p>}
    {data.data && !offer && !apply && <>
      {data.data.offers.map(item => <button key={item.id} type="button" className="sq-secondary" onClick={() => select(item.id)}>
        {item.lender_name} · {formatZAR(item.terms.principalCents)} · {item.terms.termMonths} months
      </button>)}
      {awaitingLenders && <CandidateOffers key={applicationId} applicationId={applicationId} autoRefresh onSelected={() => {
        select(applicationId);
        void data.reload();
        void applications.reload();
      }} />}
      {application?.status === 'DISBURSED' && <p className="sq-note">Your loan was disbursed. Check your wallet to pay the bill.</p>}
      {application && !awaitingLenders && application.status !== 'DISBURSED' && <p className="sq-note">Latest request: {application.status.toLowerCase().replaceAll('_', ' ')}.</p>}
      {!data.data.offers.length && !applicationId && <p className="sq-note">Submit a personal loan request to receive lender offers.</p>}
      {!awaitingLenders && !applications.loading && <button className="sq-secondary" type="button" onClick={() => setApply(true)}>New loan request</button>}
    </>}
    {apply && <SimpleLoanRequest initialAmountCents={Math.min(10000000, Math.max(50000, shortfall))}
      onSubmitted={id => {
        setApplicationId(id);
        setApply(false);
        void data.reload();
        setMessage('Request submitted. Lender offers will appear here when available.');
        try { sessionStorage.setItem(storageKey + '.application', id); } catch { /* Optional session memory. */ }
      }} />}
    {offer && <>
      <h2 className="font-bold">{offer.lender_name}</h2>
      <div className="sq-row"><span>Wallet funding</span><strong>{formatZAR(offer.terms.principalCents)}</strong></div>
      <div className="sq-row"><span>Monthly instalment</span><strong>{formatZAR(offer.terms.monthlyInstallmentCents)}</strong></div>
      <div className="sq-row"><span>Total repayment</span><strong>{formatZAR(offer.terms.totalRepayableCents)}</strong></div>
      <details className="sq-doc"><summary>Read loan agreement</summary><p className="whitespace-pre-wrap">{offer.content}</p></details>
      {['ACCEPTED','FUNDING_PENDING'].includes(offer.status) && <p className="sq-note">{offer.status === 'FUNDING_PENDING' ? 'Funding is processing. Your wallet balance will refresh when confirmed.' : 'Agreement accepted. Complete repayment setup to request funding.'}</p>}
      {offer.status !== 'FUNDING_PENDING' && <>
        <button className="sq-secondary" type="button" disabled={busy || !data.data?.configuration.enabled} onClick={() => void run(async () => {
          const result = await client.request<{url:string}>('POST', `/personal-checkout/${offer.id}/repayment`, {tableToken});
          window.location.assign(result.url);
        })}>Link repayment card</button>
        <label className="sq-checkbox"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I have read and accept this quotation and loan agreement.</span></label>
        <div className="rounded-xl border border-purple-200 bg-white p-2">
          <canvas key={offer.id} ref={canvas} width={640} height={220} aria-label="Sign your loan agreement" className="w-full touch-none"
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect=event.currentTarget.getBoundingClientRect();
              point.current={x:(event.clientX-rect.left)*640/rect.width,y:(event.clientY-rect.top)*220/rect.height};
            }}
            onPointerMove={event => {
              if (!point.current) return;
              const rect=event.currentTarget.getBoundingClientRect();
              const next={x:(event.clientX-rect.left)*640/rect.width,y:(event.clientY-rect.top)*220/rect.height};
              const context=event.currentTarget.getContext('2d');
              if (!context) return;
              context.lineWidth=3; context.lineCap='round'; context.strokeStyle='#32134b';
              context.beginPath(); context.moveTo(point.current.x,point.current.y); context.lineTo(next.x,next.y); context.stroke();
              point.current=next;
              setSignature(event.currentTarget.toDataURL('image/png'));
            }}
            onPointerUp={() => {point.current=null;}} onPointerCancel={() => {point.current=null;}} onLostPointerCapture={() => {point.current=null;}} />
          <button type="button" className="sq-text-button" onClick={() => {canvas.current?.getContext('2d')?.clearRect(0,0,640,220);setSignature('');}}>Clear signature</button>
        </div>
        <label className="sq-id-label">Confirm account password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="sq-primary" type="button" disabled={busy || !signature || !password || !acknowledged || !data.data?.configuration.enabled || !data.data.configuration.agreementsEnabled} onClick={() => void run(async () => {
          await client.request('POST', `/personal-checkout/${offer.id}/complete`, {digest:offer.digest,acknowledged:true,signature,password});
          setPassword(''); setMessage('Funding requested. Your wallet will update after confirmation.'); data.reload();
        })}>{busy ? 'Processing…' : 'Sign and request wallet funding'}</button>
      </>}
      {!data.data?.configuration.enabled && <p className="sq-note">Card repayment setup and automatic funding are awaiting activation.</p>}
      <button type="button" className="sq-text-button" onClick={() => select('')}>Other offers</button>
    </>}
    {message && <p className="sq-note" role="status">{message}</p>}
  </section>;
}
