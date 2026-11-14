'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronRight, CircleCheck, CreditCard,
  Download, FileText, Fingerprint, ImagePlus, Landmark, LockKeyhole, PenLine,
  ReceiptText, ScanLine, ShieldCheck, Utensils, Wallet, Share2, Plus, Trash2,
} from 'lucide-react';
import { ApiError } from '@xtra/shared';
import BillScanner from './BillScanner';
import RestaurantQrScanner from './RestaurantQrScanner';
import type { BillItem, ParsedBill } from './billScan';
import LiveBill from './LiveBill';
import { useAuth } from '@xtra/ui';

type Stage = 'start' | 'capture' | 'adjust' | 'bill' | 'split' | 'identity' | 'offer' | 'link' | 'terms' | 'sign' | 'pay' | 'receipt';
type Repayment = 'card' | 'bank';
const DRAFT_KEY = 'xc.restaurant.draft';
type BillDraft = { merchant: string; bill: string; amount: string; items: BillItem[]; merchantCode?: string; employeeCode?: string; photo?: string };

const stages: Stage[] = ['start', 'capture', 'adjust', 'bill', 'split', 'identity', 'offer', 'link', 'terms', 'sign', 'pay', 'receipt'];
const sample = { merchant: 'The Ember Table', bill: 'ET-1048', amount: '680.00' };
const sampleItems: BillItem[] = [{ id: 'sample-1', label: 'Burger and chips', cents: 22000 }, { id: 'sample-2', label: 'Pasta', cents: 19500 }, { id: 'sample-3', label: 'Salad', cents: 17500 }, { id: 'sample-4', label: 'Shared starter', cents: 9000 }];
const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const phase: Record<Stage, number> = { start: 1, capture: 1, adjust: 1, bill: 1, split: 1, identity: 2, offer: 2, link: 3, terms: 3, sign: 3, pay: 4, receipt: 4 };
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
  const { client, me, refreshMe, loading: authLoading } = useAuth();
  const [needsCode, setNeedsCode] = useState(false);
  const [qrRejection, setQrRejection] = useState('');
  const merchantCheck = useRef(0);
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);
  const [draftPhoto, setDraftPhoto] = useState('');
  const [stage, setStage] = useState<Stage>('start');
  const [liveToken, setLiveToken] = useState('');
  const [creatingLive, setCreatingLive] = useState(false);
  const [originalBill, setOriginalBill] = useState<File | null>(null);
  const [merchantCode, setMerchantCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [waiterName, setWaiterName] = useState('');
  const [merchantVerified, setMerchantVerified] = useState(false);
  const [verifiedMerchantName, setVerifiedMerchantName] = useState('');
  const [checkingMerchant, setCheckingMerchant] = useState(false);
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [usingSample, setUsingSample] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [bill, setBill] = useState('');
  const [amount, setAmount] = useState('');
  const [items, setItems] = useState<BillItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [sharedSnapshot, setSharedSnapshot] = useState(false);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [shareReturnPath, setShareReturnPath] = useState('/scanqr/');
  const [finance, setFinance] = useState(true);
  const [identityConsent, setIdentityConsent] = useState(false);
  const [demoIdentity, setDemoIdentity] = useState(false);
  const [repayment, setRepayment] = useState<Repayment | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    setCaptureAvailable(ios || android || /Mobi/i.test(ua));
    setReady(true);
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    const reconnect = () => { update(); void refreshMe(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', update);

    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    const incomingCode = params.get('merchant') ?? params.get('restaurant') ?? params.get('code') ?? '';
    const incomingEmployee = (params.get('employee') ?? '').trim().toUpperCase();
    let draft: BillDraft | undefined;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as BillDraft;
    } catch { /* Storage is optional. */ }
    const sameRestaurant = !incomingCode || (draft?.merchantCode?.toUpperCase() === incomingCode.toUpperCase() && (draft?.employeeCode ?? '') === incomingEmployee);
    if (!table && !params.has('bill') && draft && sameRestaurant && Array.isArray(draft.items)) {
      setMerchant(draft.merchant); setBill(draft.bill); setAmount(draft.amount); setItems(draft.items);
      if (draft.photo?.startsWith('data:image/jpeg;base64,')) {
        try {
          const bytes = Uint8Array.from(atob(draft.photo.split(',')[1]), char => char.charCodeAt(0));
          const file = new File([bytes], 'scanned-bill.jpg', { type: 'image/jpeg' });
          setOriginalBill(file); setPreview(file); setDraftPhoto(draft.photo);
        } catch { /* The draft details remain usable without its photo. */ }
      }
      setStage('bill');
    }
    setMerchantCode(incomingCode || (sameRestaurant ? draft?.merchantCode ?? '' : ''));
    setEmployeeCode(incomingCode ? incomingEmployee : draft?.employeeCode ?? '');
    if (table && /^[a-f0-9]{64}$/.test(table)) setLiveToken(table);
    setRestored(true);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', update);
    };
  }, [refreshMe]);

  async function verifyMerchant(input = merchantCode, employee = employeeCode) {
    if (!navigator.onLine) return;
    const check = ++merchantCheck.current;
    const code = input.trim().toUpperCase();
    setMerchantVerified(false);
    if (!(/^[A-Z]{3}[0-9]{3}$/.test(code) || /^[A-F0-9]{36}$/.test(code))) { setError('Enter the six character code printed below the restaurant QR, for example ABC123.'); return; }
    setCheckingMerchant(true); setError('');
    try {
      const found = await client.request<{ tradingName: string; displayCode: string; waiterName: string | null }>('GET', `/restaurant-bills/merchant/${encodeURIComponent(code)}${employee ? `?employee=${encodeURIComponent(employee)}` : ''}`);
      if (check !== merchantCheck.current) return;
      setMerchantCode(code); setMerchant(found.tradingName); setVerifiedMerchantName(found.tradingName); setWaiterName(found.waiterName ?? ''); setMerchantVerified(true);
    } catch (cause) {
      if (check !== merchantCheck.current) return;
      if (!needsCode && cause instanceof ApiError && [400, 404].includes(cause.status)) {
        setQrRejection(cause.message);
        setMerchantCode('');
        setEmployeeCode('');
        return;
      }
      if (navigator.onLine && !(cause instanceof TypeError)) {
        setError(cause instanceof Error ? cause.message : 'Restaurant code could not be verified.');
      }
    } finally {
      if (check === merchantCheck.current) setCheckingMerchant(false);
    }
  }

  useEffect(() => {
    if (restored && online && !liveToken && merchantCode) void verifyMerchant(merchantCode, employeeCode);
    // The start screen verifies new manual entries through its Find restaurant button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, online]);

  useEffect(() => {
    if (restored && stage === 'bill' && !usingSample && !liveToken) saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, stage, usingSample, liveToken, merchant, bill, amount, items, merchantCode, employeeCode, draftPhoto]);

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('bill');
    if (!encoded || encoded.length > 5000) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(encoded)))) as { v: number; merchant: string; bill: string; amount: number; items: BillItem[] };
      if (parsed.v !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 35 || !Number.isSafeInteger(parsed.amount)) return;
      const safeItems = parsed.items.filter(item => typeof item.id === 'string' && typeof item.label === 'string' && Number.isSafeInteger(item.cents) && item.cents > 0).map(item => ({ id: item.id.slice(0, 50), label: item.label.slice(0, 70), cents: item.cents }));
      setMerchant(String(parsed.merchant).slice(0, 80)); setBill(String(parsed.bill).slice(0, 40)); setAmount((parsed.amount / 100).toFixed(2));
      setItems(safeItems); setSelectedIds([]); setSplitEnabled(true); setSharedSnapshot(true); setStage('split');
      setShareReturnPath(`/scanqr/?bill=${encodeURIComponent(encoded)}`);
    } catch { /* Invalid shared preview links open the normal scan flow. */ }
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
  const selectedTotal = items.filter(item => selectedIds.includes(item.id)).reduce((sum, item) => sum + item.cents, 0);
  const checkoutTotal = splitEnabled ? selectedTotal : total;
  const unclaimedTotal = Math.max(0, total - selectedTotal);
  const advance = finance ? Math.floor(checkoutTotal * .75) : 0;
  const today = checkoutTotal - advance;
  const instalments = [Math.floor(advance / 3), Math.floor(advance / 3), advance - 2 * Math.floor(advance / 3)];
  const due = ['13 Dec 2026', '13 Jan 2027', '13 Feb 2027'];
  const paymentLabel = 'XTRA-CASH wallet';
  const billReady = !!(merchant.trim() && bill.trim() && checkoutTotal >= 100);
  const title = {
    start: 'Scan the restaurant QR', capture: 'Capture your bill', adjust: 'Adjust your scan', bill: 'Check your bill', split: 'Choose your items', identity: 'Verify your identity',
    offer: 'Review your offer', link: 'Set up repayments', terms: 'Read your agreement',
    sign: 'Sign your agreement', pay: 'Confirm your payment', receipt: 'Bill paid in demo',
  }[stage];

  function scanRestaurant(raw: string) {
    let code = raw.trim().toUpperCase();
    let employee = '';
    if (!/^[A-Z]{3}[0-9]{3}$/.test(code)) {
      try {
        const url = new URL(raw.trim(), window.location.origin);
        const allowedOrigin = url.origin === window.location.origin
          || ['https://xtra-cash.vercel.app', 'https://xtra-cash.co.za', 'https://www.xtra-cash.co.za'].includes(url.origin);
        if (!allowedOrigin || url.pathname.replace(/\/$/, '') !== '/scanqr' || url.searchParams.has('table') || url.searchParams.has('bill')) throw new Error();
        const codes = ['merchant', 'restaurant', 'code'].flatMap(key => url.searchParams.getAll(key));
        const employees = url.searchParams.getAll('employee');
        if (url.username || url.password || codes.length > 1 || employees.length > 1) throw new Error();
        code = (codes[0] ?? '').trim().toUpperCase();
        if (codes.length && !code) throw new Error();
        employee = (url.searchParams.get('employee') ?? '').trim().toUpperCase();
        if (code && !/^(?:[A-Z]{3}[0-9]{3}|[A-F0-9]{36})$/.test(code)) throw new Error();
        if (employee && !/^[A-Z]{3}[0-9]{3}$/.test(employee)) throw new Error();
      } catch {
        setQrRejection('This QR is not a valid XTRA-CASH restaurant checkout code.');
        return;
      }
    }
    setError('');
    setEmployeeCode(employee);
    setMerchantCode(code);
    setNeedsCode(!code);
    if (code && navigator.onLine) void verifyMerchant(code, employee);
  }

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
  }

  function reset() {
    clearDraft();
    setNeedsCode(false);
    setQrRejection('');
    merchantCheck.current++;
    setCheckingMerchant(false);
    setDraftPhoto('');
    setEmployeeCode('');
    clearApplication();
    setPreview(null);
    setOriginalBill(null);
    setUsingSample(false);
    setMerchant('');
    setMerchantCode(''); setMerchantVerified(false); setVerifiedMerchantName('');
    setBill('');
    setAmount('');
    setItems([]); setSelectedIds([]); setSplitEnabled(false); setSharedSnapshot(false); setScanWarnings([]); setShareNotice(''); setShareReturnPath('/scanqr/');
    setFinance(true);
    go('start');
    window.history.replaceState(null, '', '/scanqr/');
    window.scrollTo(0, 0);
  }

  function back() {
    if (stage === 'pay') { go(finance ? 'sign' : splitEnabled ? 'split' : 'bill'); return; }
    if (stage === 'bill' && !preview) { go('capture'); return; }
    if (stage === 'split' && sharedSnapshot) { go('start'); return; }
    go(stages[stages.indexOf(stage) - 1]);
  }

  function loadSample() {
    setPreview(null);
    setOriginalBill(null);
    setUsingSample(true);
    setMerchant(sample.merchant);
    setBill(sample.bill);
    setAmount(sample.amount);
    setItems(sampleItems); setSelectedIds([]); setSplitEnabled(false); setSharedSnapshot(false); setScanWarnings([]);
    go('bill');
  }

  function loadImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError('Choose a JPG, PNG or WebP photo.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose a photo under 12 MB.');
      return;
    }
    setPreview(file);
    setOriginalBill(file);
    setUsingSample(false);
    setMerchant(verifiedMerchantName);
    setBill('');
    setAmount('');
    setItems([]); setSelectedIds([]); setSplitEnabled(false); setSharedSnapshot(false); setScanWarnings([]);
    go('adjust');
  }

  function manualBill() {
    setDraftPhoto('');
    setPreview(null);
    setOriginalBill(null);
    setUsingSample(false);
    setMerchant(verifiedMerchantName);
    setBill('');
    setAmount('');
    setItems([]); setSelectedIds([]); setSplitEnabled(false); setSharedSnapshot(false); setScanWarnings([]);
    go('bill');
  }

  function acceptScan(scan: File, parsed: ParsedBill) {
    setPreview(scan);
    setOriginalBill(scan);
    setDraftPhoto('');
    if (scan.size <= 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === 'string') setDraftPhoto(reader.result); };
      reader.readAsDataURL(scan);
    }
    setMerchant(verifiedMerchantName || parsed.merchant);
    setBill(parsed.reference);
    setAmount(parsed.totalCents ? (parsed.totalCents / 100).toFixed(2) : '');
    setItems(parsed.items);
    setScanWarnings(parsed.warnings);
    go('bill');
  }

  function addItem() {
    const cents = Math.round(Number(newItemAmount.replace(',', '.')) * 100);
    if (!newItem.trim() || !Number.isSafeInteger(cents) || cents < 1 || cents > 10000000) return;
    setItems(current => [...current, { id: crypto.randomUUID(), label: newItem.trim().slice(0, 70), cents }]);
    setNewItem(''); setNewItemAmount('');
  }

  async function shareBill() {
    const remaining = items.filter(item => !selectedIds.includes(item.id));
    if (!remaining.length) { setShareNotice('All items are selected. Leave at least one item for your friends.'); return; }
    const payload = { v: 1, merchant: merchant.trim(), bill: bill.trim(), amount: unclaimedTotal, items: remaining };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${window.location.origin}/scanqr/?bill=${encodeURIComponent(encoded)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${merchant} bill`, text: 'Choose your items on this XTRA-CASH bill preview.', url });
      else { await navigator.clipboard.writeText(url); setShareNotice('Preview link copied. Send it to your friends.'); }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setShareNotice('Could not share. Try copying the link from your browser.');
    }
  }

  function saveDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ merchant, bill, amount, items, merchantCode, employeeCode, photo: draftPhoto })); }
    catch { /* The current draft remains in memory if storage is full. */ }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage is optional. */ }
  }

  async function startLiveBill() {
    if (!navigator.onLine || !me?.roles.includes('CONSUMER') || creatingLive || !merchantVerified || !merchant.trim() || !bill.trim() || total < 100 || items.length < 1 || items.reduce((sum, item) => sum + item.cents, 0) !== total) return;
    setCreatingLive(true); setError('');
    try {
      const created = await client.request<{ shareToken: string }>('POST', '/restaurant-bills', { merchant, merchantCode: merchantCode || undefined, employeeCode: employeeCode || undefined, reference: bill, totalCents: total, items: items.map(item => ({ label: item.label, cents: item.cents })) });
      if (originalBill) {
        const form = new FormData(); form.append('file', originalBill);
        try { await client.request('POST', `/restaurant-bills/${created.shareToken}/original`, form); }
        catch { setError('The shared bill was created, but its original photo was not saved.'); }
      }
      clearDraft();
      window.history.pushState(null, '', `/scanqr/?table=${created.shareToken}`);
      setLiveToken(created.shareToken);
    } catch (cause) { if (navigator.onLine && !(cause instanceof TypeError)) setError(cause instanceof Error ? cause.message : 'Could not create the shared bill.'); }
    finally { setCreatingLive(false); }
  }

  function download(kind: 'quote' | 'receipt') {
    const lines = kind === 'quote'
      ? ['XTRA-CASH | SAMPLE CREDIT QUOTATION AND AGREEMENT', 'Illustrative only. No credit agreement is created.',
        `Merchant: ${merchant.trim()}`, `Bill: ${bill.trim()}`, `Your selected items: ${money(checkoutTotal)}`,
        `Wallet top-up needed: ${money(today)}`, `Illustrative loan into wallet: ${money(advance)}`,
        'Annual interest: 0% (illustrative)', 'Fees and insurance: R0.00 (illustrative)',
        ...instalments.map((value, index) => `${due[index]}: ${money(value)}`), `Total repayment: ${money(advance)}`]
      : ['XTRA-CASH | SAMPLE PAYMENT RECEIPT', 'Simulated payment. No money moved.',
        `Merchant: ${merchant.trim()}`, `Bill: ${bill.trim()}`, `Your selected items: ${money(checkoutTotal)}`,
        `Wallet payment: ${money(checkoutTotal)}`, `Payment method: ${paymentLabel}`,
        `Illustrative loan into wallet: ${money(advance)}`, 'Reference: DEMO-1048'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `XTRA-CASH-sample-${kind}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (liveToken) return <LiveBill token={liveToken} onBack={() => { setLiveToken(''); window.history.pushState(null, '', '/scanqr/'); reset(); }} />;

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

      </aside>

      <section className="sq-phone" aria-label="Restaurant checkout">
        <header className="sq-header">
          {stage !== 'start' && stage !== 'receipt' && <button type="button" className="sq-back" aria-label="Go back" onClick={back}><ArrowLeft size={19} /></button>}
          <img src="/brand/ui/wordmark.png" alt="XTRA-CASH" />
          {(usingSample || sharedSnapshot) && <span className="sq-demo">PREVIEW</span>}
        </header>
        <div className="sq-body">
          {stage !== 'start' && stage !== 'receipt' && <nav className="sq-progress" aria-label="Checkout progress">
            {labels.map((label, i) => <span key={label} data-state={i + 1 === phase[stage] ? 'active' : i + 1 < phase[stage] ? 'done' : 'next'} aria-current={i + 1 === phase[stage] ? 'step' : undefined}>{label}</span>)}
          </nav>}
          <div className="sq-intro">
            <div className="sq-kicker">{stage === 'start' ? 'RESTAURANT CHECKOUT' : stage === 'receipt' ? 'PAYMENT COMPLETE' : `STEP ${phase[stage]} OF 4 · ${labels[phase[stage] - 1].toUpperCase()}`}</div>
            <h1 ref={heading} tabIndex={-1}>{title}</h1>
            {stage === 'start' && <p>Point your camera at the XTRA-CASH QR on the table.</p>}
            {stage === 'capture' && <p>Include the restaurant name, bill number and full total in your photo.</p>}
            {stage === 'adjust' && <p>Move the corners over the bill. We’ll straighten it and read the text.</p>}
            {stage === 'bill' && <p>Confirm the restaurant, bill total and items before continuing.</p>}
            {stage === 'split' && <p>Tick what you ordered. Share the remaining items with your friends.</p>}
            {stage === 'identity' && <p>We use your SA ID to verify you before checking eligibility and affordability.</p>}
            {stage === 'offer' && <p>See what you pay today and what you repay over time.</p>}
            {stage === 'link' && <p>Choose how you’ll repay the amount advanced by XTRA-CASH.</p>}
            {stage === 'terms' && <p>Review the sample credit quotation and agreement before you sign.</p>}
            {stage === 'sign' && <p>Draw a sample signature in the box below.</p>}
            {stage === 'pay' && <p>{finance ? 'In a live checkout, an approved loan would fund your wallet before you pay.' : 'Review the wallet amount for your items.'}</p>}
            {stage === 'receipt' && <p>This receipt shows both parts of the sample payment.</p>}
          </div>

          {stage === 'start' && <>
            {restored && !needsCode && !merchantCode && !qrRejection && <RestaurantQrScanner onScan={scanRestaurant} />}
            {qrRejection && <div className="sq-error" role="alert"><strong>QR code rejected</strong><p>{qrRejection}</p></div>}
            {needsCode && !merchantVerified && <div className="sq-fields">
              <label>Restaurant code<input aria-label="Restaurant code below the QR" autoCapitalize="characters" value={merchantCode} maxLength={6} onChange={event => setMerchantCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>
              <button className="sq-primary" disabled={!online || checkingMerchant || !/^[A-Z]{3}[0-9]{3}$/.test(merchantCode)} onClick={() => void verifyMerchant()}>{checkingMerchant ? 'Checking…' : 'Find restaurant'}</button>
            </div>}
            {merchantVerified && <div className="sq-notice"><CircleCheck size={19} /><span><strong>{merchant}</strong><small>{waiterName ? `Your waiter: ${waiterName} · ` : ''}Restaurant code verified</small></span></div>}
            {checkingMerchant && <p role="status" className="sq-note">Checking restaurant…</p>}
            {error && <p className="sq-error" role="alert">{error}</p>}
            {(needsCode || merchantCode || qrRejection) && <button className={qrRejection ? 'sq-primary' : 'sq-text-button'} type="button" onClick={() => {
              setMerchantCode(''); setEmployeeCode(''); setMerchantVerified(false); setNeedsCode(false); setError('');
              setQrRejection(''); merchantCheck.current++; setCheckingMerchant(false);
            }}>Scan another QR</button>}
            {!qrRejection && (merchantVerified || (!online && (needsCode || !!merchantCode))) && <button className="sq-primary" disabled={!ready} onClick={() => go('capture')}>{merchantVerified ? 'Capture bill' : 'Prepare bill draft'} <ArrowRight size={19} /></button>}
            {online && <a className="sq-secondary" href="/register">Sign up for XTRA-CASH <ChevronRight size={17} /></a>}
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

          {stage === 'adjust' && preview && <><BillScanner file={preview} onDone={acceptScan} /><button className="sq-text-button sq-centred" onClick={manualBill}>Enter details manually</button></>}

          {stage === 'bill' && <>
            {usingSample && <div className="sq-notice"><ScanLine size={19} /><span><strong>Sample bill read</strong><small>Check the restaurant, reference and total.</small></span></div>}
            {previewUrl && <details className="sq-doc"><summary>View local bill photo</summary><img className="sq-preview" src={previewUrl} alt="Your selected bill" onError={e => { e.currentTarget.hidden = true; setError('Preview unavailable for this photo. You can still enter the bill details.'); }} /></details>}
            <div className="sq-fields">
              <label>Restaurant name<input value={merchant} maxLength={80} readOnly={merchantVerified} onChange={e => setMerchant(e.target.value)} placeholder="Restaurant name" /></label>
              <label>Bill reference<input value={bill} maxLength={40} onChange={e => setBill(e.target.value)} placeholder="Reference on bill" /></label>
              <label>Total including any tip<div className="sq-amount"><span>R</span><input inputMode="decimal" maxLength={9} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div></label>
            </div>
            {scanWarnings.length > 0 && <div className="sq-note" role="status">{scanWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
            <div className="sq-card sq-items"><div className="sq-row"><strong>Items on bill</strong><span>{items.length} found</span></div>{items.map(item => <div className="sq-row" key={item.id}><span>{item.label}</span><strong>{money(item.cents)}</strong><button type="button" className="sq-icon-button" aria-label={`Remove ${item.label}`} onClick={() => setItems(current => current.filter(row => row.id !== item.id))}><Trash2 size={14} /></button></div>)}</div>
            <div className="sq-add-item"><input aria-label="Item name" placeholder="Add missing item" value={newItem} onChange={e => setNewItem(e.target.value)} /><input aria-label="Item amount in rand" inputMode="decimal" placeholder="R amount" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)} /><button type="button" aria-label="Add item" onClick={addItem}><Plus size={18} /></button></div>
            {items.length > 0 && total > 0 && items.reduce((sum, item) => sum + item.cents, 0) !== total && <p className="sq-note">Items add to {money(items.reduce((sum, item) => sum + item.cents, 0))}; bill total is {money(total)}. Correct missing items, tax or tip before splitting.</p>}
            {!usingSample && <p className="sq-note">OCR may misread photos. Check every amount against the original bill.</p>}
            {error && <p className="sq-error" role="alert">{error}</p>}
            {usingSample && <button className="sq-primary" disabled={!merchant.trim() || !bill.trim() || total < 100 || !items.length || items.reduce((sum, item) => sum + item.cents, 0) !== total} onClick={() => { clearApplication(); setSplitEnabled(true); go('split'); }}>Try choosing items <ArrowRight size={19} /></button>}
            {!usingSample && online && !merchantVerified && <div className="sq-fields">
              <label>Restaurant code<input autoCapitalize="characters" value={merchantCode} maxLength={36} onChange={event => setMerchantCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>
              <button className="sq-secondary" disabled={checkingMerchant || merchantCode.trim().length < 6} onClick={() => void verifyMerchant()}>{checkingMerchant ? 'Checking…' : 'Find restaurant'}</button>
            </div>}
            {!usingSample && online && me?.roles.includes('CONSUMER') && <button className="sq-primary" disabled={creatingLive || !merchantVerified || !bill.trim() || total < 100 || !items.length || items.reduce((sum, item) => sum + item.cents, 0) !== total} onClick={() => void startLiveBill()}><Share2 size={17} /> {creatingLive ? 'Creating shared bill…' : 'Start live shared bill'}</button>}
            {!usingSample && online && !authLoading && !me && <a className="sq-primary" href="/login?next=%2Fscanqr%2F%3Frestore%3D1" onClick={saveDraft}>Log in to start a live shared bill</a>}
          </>}

          {stage === 'split' && <>
            {sharedSnapshot && <div className="sq-notice"><Share2 size={19} /><span><strong>Shared bill preview</strong><small>This link shows a snapshot of remaining items. Payments and selections do not sync between devices yet.</small></span></div>}
            <div className="sq-card sq-schedule"><div className="sq-row"><span>{sharedSnapshot ? 'Remaining bill' : 'Bill total'}</span><strong>{money(total)}</strong></div><div className="sq-row"><span>Your selected items</span><strong>{money(selectedTotal)}</strong></div><div className="sq-row sq-total"><span>Still unclaimed</span><strong>{money(unclaimedTotal)}</strong></div></div>
            <div className="sq-item-list">{items.map(item => <label key={item.id} className="sq-item-choice"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={e => setSelectedIds(current => e.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span>{item.label}</span><strong>{money(item.cents)}</strong></label>)}</div>
            {!usingSample && unclaimedTotal > 0 && <button className="sq-secondary" type="button" onClick={() => void shareBill()} disabled={!merchant.trim() || !bill.trim()}><Share2 size={17} /> Share preview snapshot</button>}
            {shareNotice && <p className="sq-note" role="status">{shareNotice}</p>}
            <p className="sq-note">{usingSample ? 'This sample lets you try item selection. Use a real scanned bill to start a synchronized table.' : 'This older preview does not reserve items or collect payment. Scan a new bill for a synchronized table.'}</p>
            <button className="sq-primary" disabled={!billReady} onClick={() => { clearApplication(); setFinance(true); go('identity'); }}>Check a loan for my {money(selectedTotal)} share <ArrowRight size={18} /></button>
            <button className="sq-secondary" disabled={!billReady} onClick={() => { clearApplication(); setFinance(false); go('pay'); }}>Pay my {money(selectedTotal)} share in full</button>
            <div className="sq-text-row"><a className="sq-text-button" href={`/register?next=${encodeURIComponent(shareReturnPath)}`}>Create an account</a><a className="sq-text-button" href={`/login?next=${encodeURIComponent(shareReturnPath)}`}>Log in</a></div>
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
            <div className="sq-offer"><span>ILLUSTRATIVE LOAN FOR THIS SAMPLE BILL</span><strong>{money(advance)}</strong><small>Would be added to your wallet after real lender approval</small><Wallet size={38} /></div>
            <div className="sq-card sq-split"><div><span>{splitEnabled ? 'Your items' : 'Bill total'}</span><strong>{money(checkoutTotal)}</strong></div><div><span>Wallet top-up</span><strong>{money(today)}</strong></div></div>
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
            <div className="sq-notice"><ShieldCheck size={21} /><span><strong>Separate from bill payment</strong><small>This sample repayment method is separate from the XTRA-CASH wallet used to pay the restaurant.</small></span></div>
            <button className="sq-primary" disabled={!repayment} onClick={() => go('terms')}>Confirm sample repayment method <ArrowRight size={18} /></button>
          </>}

          {stage === 'terms' && <>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>Credit advanced</span><strong>{money(advance)}</strong></div><div className="sq-row"><span>Annual interest</span><strong>0%</strong></div><div className="sq-row"><span>Fees and insurance</span><strong>R0.00</strong></div><div className="sq-row"><span>Repayment method</span><strong>{repayment === 'bank' ? 'Sample bank mandate' : 'Sample debit card'}</strong></div><div className="sq-row sq-total"><span>Total repayment</span><strong>{money(advance)}</strong></div></div>
            <details className="sq-doc"><summary><FileText size={18} /> Sample quotation and terms</summary><p>For the sample bill {bill}, you would top up {money(today)}. The sample loan of {money(advance)} would be added to your wallet; your wallet would pay {money(checkoutTotal)} for your items at {merchant}. Repay the advance over three months.</p>{due.map((date, i) => <div className="sq-row" key={date}><span>{date}</span><strong>{money(instalments[i])}</strong></div>)}<p>Sample terms for demonstration only.</p></details>
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
            <div className="sq-card sq-payment-total"><small>WALLET PAYMENT FOR YOUR ITEMS</small><strong>{money(checkoutTotal)}</strong><span>{merchant} · {bill}</span></div>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>Wallet top-up needed</span><strong>{money(today)}</strong></div>{finance && <div className="sq-row"><span>Illustrative loan into wallet</span><strong>{money(advance)}</strong></div>}<div className="sq-row sq-total"><span>{splitEnabled ? 'Your share' : 'Total to restaurant'}</span><strong>{money(checkoutTotal)}</strong></div></div>
            <div className="sq-notice"><Wallet size={21} /><span><strong>Pay from XTRA-CASH wallet</strong><small>Top up your wallet before paying. Live shared bills check the balance and debit the wallet securely.</small></span></div>
            <button className="sq-primary" disabled={!billReady || (finance && (!termsAccepted || !signed || !repayment))} onClick={() => go('receipt')}>Simulate wallet payment {money(checkoutTotal)} <ArrowRight size={17} /></button>
            <p className="sq-footnote"><LockKeyhole size={14} /> Demo payment · sample funds only.</p>
          </>}

          {stage === 'receipt' && <>
            <div className="sq-success"><CircleCheck size={32} /><span><strong>{money(checkoutTotal)}</strong><small>{merchant} · {bill} · simulated share</small></span></div>
            <div className="sq-card sq-schedule"><div className="sq-row"><span>You paid · {paymentLabel}</span><strong>{money(checkoutTotal)}</strong></div>{finance && <><div className="sq-row"><span>Illustrative loan into wallet</span><strong>{money(advance)}</strong></div><div className="sq-row"><span>First repayment</span><strong>{money(instalments[0])} · {due[0]}</strong></div></>}<div className="sq-row sq-total"><span>Reference</span><strong>DEMO-1048</strong></div></div>
            <button className="sq-primary" onClick={() => download('receipt')}>Download sample receipt <Download size={19} /></button>
            {finance && <button className="sq-secondary" onClick={() => download('quote')}>Download sample agreement <Download size={17} /></button>}
            <button className="sq-text-button sq-centred" onClick={reset}>Start a new demo</button>
          </>}
        </div>
      </section>
    </div>
  </main>;
}
