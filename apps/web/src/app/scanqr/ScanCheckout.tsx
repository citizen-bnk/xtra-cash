'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronRight, CircleCheck, CreditCard,
  Download, FileText, Fingerprint, ImagePlus, Landmark, LockKeyhole, PenLine,
  ReceiptText, ScanLine, ShieldCheck, Smartphone, Utensils, Wallet,
} from 'lucide-react';

type Stage = 'start' | 'capture' | 'bill' | 'identity' | 'offer' | 'link' | 'terms' | 'sign' | 'pay' | 'receipt';
type Repayment = 'card' | 'bank';
const stages: Stage[] = ['start', 'capture', 'bill', 'identity', 'offer', 'link', 'terms', 'sign', 'pay', 'receipt'];
const sample = { merchant: 'The Ember Table', bill: 'ET-1048', amount: '680.00' };
const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const phase: Record<Stage, number> = { start: 1, capture: 1, bill: 1, identity: 2, offer: 2, link: 3, terms: 3, sign: 3, pay: 4, receipt: 4 };
const labels = ['Bill', 'Offer', 'Agreement', 'Payment'];

function Signature({ signed, onChange }: { signed: boolean; onChange: (value: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const point = useRef<{ x: number; y: number } | null>(null);

  function position(e: PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) * 700 / box.width, y: (e.clientY - box.top) * 320 / box.height };
  }

  return <div className="sq-sign-wrap">
    <canvas ref={canvas} width={700} height={320} aria-label="Draw a sample signature" onPointerDown={e => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      point.current = position(e);
    }} onPointerMove={e => {
      if (!point.current) return;
      const next = position(e);
      const context = e.currentTarget.getContext('2d');
      if (!context) return;
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#562986';
      context.beginPath();
      context.moveTo(point.current.x, point.current.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      point.current = next;
      if (!signed) onChange(true);
    }} onPointerUp={() => { point.current = null; }} onPointerCancel={() => { point.current = null; }} onLostPointerCapture={() => { point.current = null; }} />
    <div className="sq-sign-line"><PenLine size={15} /> Signature</div>
    <div className="sq-sign-tools">
      <button type="button" className="sq-text-button" onClick={() => {
        const ctx = canvas.current?.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 700, 320);
        ctx.font = 'italic 72px Georgia';
        ctx.fillStyle = '#562986';
        ctx.fillText('Sample Diner', 75, 180);
        onChange(true);
      }}>Use sample signature</button>
      <button type="button" className="sq-text-button" onClick={() => {
        canvas.current?.getContext('2d')?.clearRect(0, 0, 700, 320);
        onChange(false);
      }}>Clear</button>
    </div>
  </div>;
}

export default function ScanCheckout() {
  const [stage, setStage] = useState<Stage>('start');
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [usingSample, setUsingSample] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [bill, setBill] = useState('');
  const [amount, setAmount] = useState('');
  const [finance, setFinance] = useState(true);
  const [identityConsent, setIdentityConsent] = useState(false);
  const [demoIdentity, setDemoIdentity] = useState(false);
  const [repayment, setRepayment] = useState<Repayment | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [payment, setPayment] = useState<'card' | 'wallet'>('card');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    setPlatform(ios ? 'ios' : android ? 'android' : 'desktop');
    setCaptureAvailable(ios || android || /Mobi/i.test(ua));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(preview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  useEffect(() => {
    if (stage === 'start') return;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [stage]);

  const validAmount = /^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount.trim());
  const total = validAmount ? Math.round(Number(amount.trim().replace(',', '.')) * 100) : 0;
  const advance = finance ? Math.floor(total * .75) : 0;
  const today = total - advance;
  const instalments = [Math.floor(advance / 3), Math.floor(advance / 3), advance - 2 * Math.floor(advance / 3)];
  const due = ['13 Dec 2026', '13 Jan 2027', '13 Feb 2027'];
  const wallet = platform === 'ios' ? 'Apple Pay' : platform === 'android' ? 'Google Pay' : null;
  const paymentLabel = payment === 'wallet' && wallet ? wallet : 'Card';
  const billReady = !!(merchant.trim() && bill.trim() && total >= 100);
  const title = {
    start: 'Pay your table bill.', capture: 'Capture your bill', bill: 'Check your bill', identity: 'Verify your identity',
    offer: 'Review your offer', link: 'Set up repayments', terms: 'Read your agreement',
    sign: 'Sign your agreement', pay: 'Confirm your payment', receipt: 'Bill paid in demo',
  }[stage];

  function go(next: Stage) {
    setError('');
    if (next === 'sign') setSigned(false);
    setStage(next);
  }

  function clearApplication() {
    setIdentityConsent(false);
    setDemoIdentity(false);
    setRepayment(null);
    setTermsAccepted(false);
    setSigned(false);
    setPayment('card');
  }

  function reset() {
    clearApplication();
    setPreview(null);
    setUsingSample(false);
    setMerchant('');
    setBill('');
    setAmount('');
    setFinance(true);
    go('start');
    window.scrollTo(0, 0);
  }

  function back() {
    if (stage === 'pay') { go(finance ? 'sign' : 'bill'); return; }
    go(stages[stages.indexOf(stage) - 1]);
  }

  function loadSample() {
    setPreview(null);
    setUsingSample(true);
    setMerchant(sample.merchant);
    setBill(sample.bill);
    setAmount(sample.amount);
    go('bill');
  }

  function loadImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) && !/\.(jpe?g|png|webp|hei[cf]|avif)$/i.test(file.name)) {
      setError('Choose a JPG, PNG, WebP or HEIC photo.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose a photo under 12 MB.');
      return;
    }
    setPreview(file);
    setUsingSample(false);
    setMerchant('');
    setBill('');
    setAmount('');
    go('bill');
  }

  function manualBill() {
    setPreview(null);
    setUsingSample(false);
    setMerchant('');
    setBill('');
    setAmount('');
    go('bill');
  }

  function download(kind: 'quote' | 'receipt') {
    const lines = kind === 'quote'
      ? ['XTRA-CASH | SAMPLE CREDIT QUOTATION AND AGREEMENT', 'Illustrative only. No credit agreement is created.',
        `Merchant: ${merchant.trim()}`, `Bill: ${bill.trim()}`, `Purchase: ${money(total)}`,
        `Pay today: ${money(today)}`, `Principal: ${money(advance)}`,
        'Annual interest: 0% (illustrative)', 'Fees and insurance: R0.00 (illustrative)',
        ...instalments.map((value, index) => `${due[index]}: ${money(value)}`), `Total repayment: ${money(advance)}`]
      : ['XTRA-CASH | SAMPLE PAYMENT RECEIPT', 'Simulated payment. No money moved.',
        `Merchant: ${merchant.trim()}`, `Bill: ${bill.trim()}`, `Bill total: ${money(total)}`,
        `Diner payment: ${money(today)}`, `Payment method: ${paymentLabel}`,
        `XTRA-CASH share: ${money(advance)}`, 'Reference: DEMO-1048'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `XTRA-CASH-sample-${kind}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="sq-root">
    <div className="sq-layout">
      <aside className="sq-aside">
        <img src="/brand/ui/wordmark_white.png" alt="XTRA-CASH" />
        <div className="sq-aside-content">
          <span className="sq-aside-kicker"><Utensils size={17} /> AT THE TABLE</span>
          <h2>From table QR<br />to paid bill.</h2>
          <p>Capture the bill, choose how to pay and keep the receipt in one checkout.</p>
          <ol>{labels.map((label, i) => <li key={label} data-current={phase[stage] === i + 1}><span>{i + 1}</span>{label}</li>)}</ol>
        </div>
        <small>Restaurant checkout preview</small>
      </aside>

      <section className="sq-phone" aria-label="Restaurant checkout">
        <header className="sq-header">
          {stage !== 'start' && stage !== 'receipt' && <button type="button" className="sq-back" aria-label="Go back" onClick={back}><ArrowLeft size={19} /></button>}
          <img src="/brand/ui/wordmark.png" alt="XTRA-CASH" />
          <span className="sq-demo">DEMO</span>
        </header>
        <div className="sq-body">
          {stage !== 'start' && stage !== 'receipt' && <nav className="sq-progress" aria-label="Checkout progress">
            {labels.map((label, i) => <span key={label} data-state={i + 1 === phase[stage] ? 'active' : i + 1 < phase[stage] ? 'done' : 'next'} aria-current={i + 1 === phase[stage] ? 'step' : undefined}>{label}</span>)}
          </nav>}
          {stage === 'start' && <div className="sq-hero" aria-hidden="true">
            <div className="sq-orbit sq-orbit-one" /><div className="sq-orbit sq-orbit-two" />
            <div className="sq-hero-bill"><Utensils size={20} /><i /><i /><i /><strong>R680.00</strong></div>
            <div className="sq-hero-scan"><ScanLine size={29} /></div>
            <div className="sq-hero-check"><Check size={20} strokeWidth={3} /></div>
          </div>}
          <div className="sq-intro">
            <div className="sq-kicker">{stage === 'start' ? 'RESTAURANT CHECKOUT' : stage === 'receipt' ? 'PAYMENT COMPLETE' : `STEP ${phase[stage]} OF 4 · ${labels[phase[stage] - 1].toUpperCase()}`}</div>
            <h1 ref={heading} tabIndex={-1}>{title}</h1>
            {stage === 'start' && <p>Pay in full or check if you qualify to pay part today with XTRA-CASH.</p>}
            {stage === 'capture' && <p>Include the restaurant name, bill number and full total in your photo.</p>}
            {stage === 'bill' && <p>{usingSample ? 'Check the details found on the sample bill.' : 'Enter and confirm the details shown on your bill.'}</p>}
            {stage === 'identity' && <p>We use your SA ID to verify you before checking eligibility and affordability.</p>}
            {stage === 'offer' && <p>See what you pay today and what you repay over time.</p>}
            {stage === 'link' && <p>Choose how you’ll repay the amount advanced by XTRA-CASH.</p>}
            {stage === 'terms' && <p>Review the sample credit quotation and agreement before you sign.</p>}
            {stage === 'sign' && <p>Draw a sample signature in the box below.</p>}
            {stage === 'pay' && <p>{finance ? 'Your sample agreement is signed and your XTRA-CASH share is ready for this bill.' : 'Review the total and choose how to pay.'}</p>}
            {stage === 'receipt' && <p>This receipt shows both parts of the sample payment.</p>}
          </div>

          {stage === 'start' && <>
            <div className="sq-merchant"><div className="sq-icon"><Utensils size={20} /></div><div><strong>Table checkout</strong><small>Check the restaurant on your bill</small></div><ShieldCheck size={19} /></div>
            <button className="sq-primary" disabled={!ready} onClick={() => go('capture')}>Start with your bill <ArrowRight size={19} /></button>
            <a className="sq-secondary" href="/register">Sign up for XTRA-CASH <ChevronRight size={17} /></a>
            <p className="sq-footnote"><LockKeyhole size={14} /> Use sample details in this preview.</p>
          </>}

          {stage === 'capture' && <>
            <div className="sq-capture"><div className="sq-receipt-icon"><ReceiptText size={41} strokeWidth={1.5} /></div><strong>Fit the whole bill in the photo</strong><small>Keep it flat and avoid glare.</small></div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={loadImage} hidden />
            <input ref={fileInput} type="file" accept="image/*" onChange={loadImage} hidden />
            {captureAvailable && <button className="sq-primary" onClick={() => cameraInput.current?.click()}>Take a photo <Camera size={19} /></button>}
            <button className={captureAvailable ? 'sq-secondary' : 'sq-primary'} onClick={() => fileInput.current?.click()}>Upload a bill photo <ImagePlus size={18} /></button>
            <div className="sq-text-row"><button className="sq-text-button" onClick={loadSample}>Use sample bill</button><button className="sq-text-button" onClick={manualBill}>Enter manually</button></div>
            {error && <p className="sq-error" role="alert">{error}</p>}
          </>}

          {stage === 'bill' && <>
            {usingSample && <div className="sq-notice"><ScanLine size={19} /><span><strong>Sample bill read</strong><small>Check the restaurant, reference and total.</small></span></div>}
            {previewUrl && <details className="sq-doc"><summary>View local bill photo</summary><img className="sq-preview" src={previewUrl} alt="Your selected bill" onError={e => { e.currentTarget.hidden = true; setError('Preview unavailable for this photo. You can still enter the bill details.'); }} /></details>}
            <div className="sq-fields">
              <label>Restaurant name<input value={merchant} maxLength={80} onChange={e => setMerchant(e.target.value)} placeholder="Restaurant name" /></label>
              <label>Bill reference<input value={bill} maxLength={40} onChange={e => setBill(e.target.value)} placeholder="Reference on bill" /></label>
              <label>Total including any tip<div className="sq-amount"><span>R</span><input inputMode="decimal" maxLength={9} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div></label>
            </div>
            {!usingSample && <p className="sq-note">Bill details are entered manually in this preview.</p>}
            {error && <p className="sq-error" role="alert">{error}</p>}
            <button className="sq-primary" disabled={!billReady} onClick={() => { clearApplication(); setFinance(true); go('identity'); }}>Check XTRA-CASH offer <ArrowRight size={19} /></button>
            <button className="sq-secondary" disabled={!billReady} onClick={() => { clearApplication(); setFinance(false); go('pay'); }}>Pay in full {billReady ? money(total) : ''}</button>
          </>}

          {stage === 'identity' && <>
            <div className="sq-notice"><Fingerprint size={22} /><span><strong>Eligibility and affordability</strong><small>A sample profile stands in for identity and credit checks.</small></span></div>
            <label className="sq-id-label">South African ID number<input readOnly value={demoIdentity ? '••••••••• 0182' : ''} placeholder="13-digit ID number" /></label>
            <button className="sq-text-button sq-id-sample" onClick={() => setDemoIdentity(true)}>{demoIdentity ? 'Sample identity selected' : 'Use sample identity'}</button>
            <label className="sq-checkbox"><input type="checkbox" checked={identityConsent} onChange={e => setIdentityConsent(e.target.checked)} /><span>I agree to identity, eligibility and affordability checks for this application.</span></label>
            <button className="sq-primary" disabled={!demoIdentity || !identityConsent} onClick={() => go('offer')}>Check my offer <ArrowRight size={19} /></button>
            <button className="sq-secondary" onClick={() => { clearApplication(); setFinance(false); go('pay'); }}>Pay in full instead</button>
          </>}

          {stage === 'offer' && <>
            <div className="sq-offer"><span>AVAILABLE FOR THIS SAMPLE BILL</span><strong>{money(advance)}</strong><small>Paid to the restaurant by XTRA-CASH</small><Wallet size={38} /></div>
            <div className="sq-card sq-split"><div><span>Bill total</span><strong>{money(total)}</strong></div><div><span>You pay today</span><strong>{money(today)}</strong></div></div>
            <div className="sq-card sq-schedule"><div className="sq-row"><strong>3 monthly repayments</strong><small>Sample dates</small></div>{instalments.map((value, i) => <div className="sq-row" key={due[i]}><span>{due[i]}</span><strong>{money(value)}</strong></div>)}<div className="sq-row sq-total"><span>Total repayment</span><strong>{money(advance)}</strong></div></div>
            <p className="sq-note">Illustrative costs: 0% annual interest, R0.00 fees and insurance.</p>
            <button className="sq-primary" onClick={() => go('link')}>Continue with this offer <ArrowRight size={19} /></button>
            <button className="sq-text-button sq-centred" onClick={() => { clearApplication(); setFinance(false); go('pay'); }}>Pay in full instead</button>
          </>}

          {stage === 'link' && <>
            <fieldset className="sq-options"><legend className="sq-sr">Repayment method</legend>
              <label className="sq-option"><CreditCard size={22} /><span><strong>Link a debit card</strong><small>Set up card repayments with the payment provider.</small></span><input type="radio" name="repayment" checked={repayment === 'card'} onChange={() => { setRepayment('card'); setTermsAccepted(false); }} /></label>
              <label className="sq-option"><Landmark size={22} /><span><strong>Link a bank account</strong><small>Set up a repayment mandate with your bank.</small></span><input type="radio" name="repayment" checked={repayment === 'bank'} onChange={() => { setRepayment('bank'); setTermsAccepted(false); }} /></label>
            </fieldset>
            <div className="sq-notice"><ShieldCheck size={21} /><span><strong>Separate from today’s payment</strong><small>Your card or wallet for today’s share is chosen at checkout.</small></span></div>
            <button className="sq-primary" disabled={!repayment} onClick={() => go('terms')}>Confirm sample repayment method <ArrowRight size={18} /></button>
          </>}

          {stage === 'terms' && <>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>Credit advanced</span><strong>{money(advance)}</strong></div><div className="sq-row"><span>Annual interest</span><strong>0%</strong></div><div className="sq-row"><span>Fees and insurance</span><strong>R0.00</strong></div><div className="sq-row"><span>Repayment method</span><strong>{repayment === 'bank' ? 'Sample bank mandate' : 'Sample debit card'}</strong></div><div className="sq-row sq-total"><span>Total repayment</span><strong>{money(advance)}</strong></div></div>
            <details className="sq-doc"><summary><FileText size={18} /> Sample quotation and terms</summary><p>For the sample bill {bill}, you pay {money(today)} today. The sample lender pays {money(advance)} to {merchant}. Repay the advance over three months.</p>{due.map((date, i) => <div className="sq-row" key={date}><span>{date}</span><strong>{money(instalments[i])}</strong></div>)}<p>Sample terms for demonstration only.</p></details>
            <button className="sq-text-button sq-download" onClick={() => download('quote')}><Download size={16} /> Download sample agreement</button>
            <label className="sq-checkbox"><input type="checkbox" checked={termsAccepted} onChange={e => { setTermsAccepted(e.target.checked); setSigned(false); }} /><span>I’ve read the sample quotation and agree to the sample credit terms.</span></label>
            <button className="sq-primary" disabled={!termsAccepted} onClick={() => go('sign')}>Continue to signature <ArrowRight size={19} /></button>
          </>}

          {stage === 'sign' && <>
            <div className="sq-notice"><FileText size={21} /><span><strong>Sample credit agreement</strong><small>{money(advance)} total repayment over 3 months</small></span></div>
            <Signature signed={signed} onChange={setSigned} />
            <button className="sq-primary" disabled={!signed || !termsAccepted} onClick={() => go('pay')}>Sign sample agreement <PenLine size={18} /></button>
          </>}

          {stage === 'pay' && <>
            <div className="sq-card sq-payment-total"><small>YOUR PAYMENT TODAY</small><strong>{money(today)}</strong><span>{merchant} · {bill}</span></div>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>You pay now</span><strong>{money(today)}</strong></div>{finance && <div className="sq-row"><span>XTRA-CASH pays</span><strong>{money(advance)}</strong></div>}<div className="sq-row sq-total"><span>Total to restaurant</span><strong>{money(total)}</strong></div></div>
            <fieldset className="sq-options"><legend className="sq-sr">Payment method</legend>
              {wallet && <label className="sq-option"><Smartphone size={22} /><span><strong>{wallet}</strong><small>Wallet preview for this device</small></span><input type="radio" name="payment" checked={payment === 'wallet'} onChange={() => setPayment('wallet')} /></label>}
              <label className="sq-option"><CreditCard size={22} /><span><strong>Pay by card</strong><small>Sample payment card</small></span><input type="radio" name="payment" checked={payment === 'card'} onChange={() => setPayment('card')} /></label>
            </fieldset>
            <button className="sq-primary" disabled={!billReady || (finance && (!termsAccepted || !signed || !repayment))} onClick={() => go('receipt')}>Simulate payment {money(today)} <ArrowRight size={17} /></button>
            <p className="sq-footnote"><LockKeyhole size={14} /> Demo payment · sample funds only.</p>
          </>}

          {stage === 'receipt' && <>
            <div className="sq-success"><CircleCheck size={32} /><span><strong>{money(total)}</strong><small>{merchant} · {bill}</small></span></div>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>You paid · {paymentLabel}</span><strong>{money(today)}</strong></div>{finance && <><div className="sq-row"><span>XTRA-CASH paid</span><strong>{money(advance)}</strong></div><div className="sq-row"><span>First repayment</span><strong>{money(instalments[0])} · {due[0]}</strong></div></>}<div className="sq-row sq-total"><span>Reference</span><strong>DEMO-1048</strong></div></div>
            <button className="sq-primary" onClick={() => download('receipt')}>Download sample receipt <Download size={19} /></button>
            {finance && <button className="sq-secondary" onClick={() => download('quote')}>Download sample agreement <Download size={17} /></button>}
            <button className="sq-text-button sq-centred" onClick={reset}>Start a new demo</button>
          </>}
        </div>
      </section>
    </div>
  </main>;
}
