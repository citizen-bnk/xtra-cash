'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileCheck, LockKeyhole } from 'lucide-react';
import { EMPLOYMENT_LABELS, EmploymentStatus, PROVINCES, formatZAR, parseSaId, type PersonalLoanApplication, type PersonalLoanInput, type PersonalLoanMatch } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, Loading, MoneyInput, Select, StatusBadge, useApi, useAuth } from '@xtra/ui';

const PURPOSES = ['Home & repairs', 'Education', 'Medical', 'Transport', 'Debt consolidation', 'Other'];
type Step = 'amount' | 'term' | 'purpose' | 'income' | 'expenses' | 'identity' | 'dob' | 'province' | 'employment' | 'mobile' | 'address' | 'identityDoc' | 'addressDoc' | 'review';
const QUESTIONS: Record<Step, string> = {
  amount: 'How much do you need?', term: 'Over how many months?', purpose: 'What is the loan for?', income: 'What is your monthly take-home income?', expenses: 'How much do you spend each month?', identity: 'What is your ID or passport number?', dob: 'What is your date of birth?', province: 'Which province do you live in?', employment: 'How do you earn your income?', mobile: 'What is your mobile number?', address: 'What is your residential address?', identityDoc: 'Upload your identity document', addressDoc: 'Upload your proof of address', review: 'Ready to send your application?',
};

export function PersonalLoanFlow() {
  const { me, client } = useAuth();
  const verification = useApi(c => c.consumer.personalVerification());
  const applications = useApi(c => c.consumer.personalApplications());
  const [amount, setAmount] = useState<number | null>(100000), [term, setTerm] = useState(6), [purpose, setPurpose] = useState('');
  const [income, setIncome] = useState<number | null>(null), [expenses, setExpenses] = useState<number | null>(null);
  const [identityType, setIdentityType] = useState<'ID' | 'PASSPORT'>('ID'), [identityNumber, setIdentityNumber] = useState(''), [dob, setDob] = useState('');
  const [province, setProvince] = useState(''), [employment, setEmployment] = useState<EmploymentStatus | ''>('');
  const [mobile, setMobile] = useState(''), [address, setAddress] = useState('');
  const [identityDoc, setIdentityDoc] = useState<File | null>(null), [addressDoc, setAddressDoc] = useState<File | null>(null);
  const [step, setStep] = useState(0), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PersonalLoanApplication | null>(null), [matches, setMatches] = useState<PersonalLoanMatch[] | null>(null), [matchReason, setMatchReason] = useState<string | null>(null);
  const key = useRef(''), question = useRef<HTMLHeadingElement>(null), initialized = useRef(false);
  const needsDocuments = verification.data?.status === 'NOT_STARTED' || verification.data?.status === 'REJECTED';
  const steps: Step[] = ['amount', 'term', 'purpose', 'income', 'expenses', ...(needsDocuments ? ['identity', ...(identityType === 'PASSPORT' ? ['dob'] : []), 'province', 'employment', 'mobile', 'address', 'identityDoc', 'addressDoc'] as Step[] : []), 'review'];
  const current = steps[Math.min(step, steps.length - 1)];
  useEffect(() => { question.current?.focus(); }, [step]);
  useEffect(() => {
    if (!me || initialized.current) return;
    initialized.current = true; key.current = crypto.randomUUID();
    setIncome(me.kyc?.monthlyIncomeCents || null); setExpenses(me.kyc?.monthlyExpensesCents ?? null);
    setProvince(me.kyc?.province ?? ''); setEmployment(me.kyc?.employmentStatus ?? ''); setMobile(me.phone ?? '');
    if (me.kyc?.idNumber) { setIdentityType(me.kyc.idNumber.startsWith('PASSPORT:') ? 'PASSPORT' : 'ID'); setIdentityNumber(me.kyc.idNumber.replace(/^PASSPORT:/, '')); }
    else client.request<{ identityType: 'ID' | 'PASSPORT' | null; identityNumber: string | null }>('GET', '/auth/passwordless/identity').then(r => { if (r.identityNumber) { setIdentityType(r.identityType!); setIdentityNumber(r.identityNumber); } }).catch(() => undefined);
    try { const stored = JSON.parse(sessionStorage.getItem('xtra-personal-request') ?? 'null'); if (stored?.amountCents >= 50000 && stored.amountCents <= 10000000) setAmount(stored.amountCents); if (stored?.termMonths >= 1 && stored.termMonths <= 24) setTerm(stored.termMonths); sessionStorage.removeItem('xtra-personal-request'); } catch { /* Start with defaults. */ }
  }, [me, client]);
  function validateStep() {
    if (current === 'amount' && (!amount || amount < 50000 || amount > 10000000)) return 'Enter an amount between R500 and R100,000.';
    if (current === 'term' && (!Number.isInteger(term) || term < 1 || term > 24)) return 'Choose a period from 1 to 24 months.';
    if (current === 'purpose' && !purpose) return 'Choose what the loan will be used for.';
    if (current === 'income' && (!income || income > 100000000)) return 'Enter your monthly income.';
    if (current === 'expenses' && (expenses === null || expenses > 100000000)) return 'Enter your monthly expenses, including other debt repayments.';
    if (current === 'identity' && (identityType === 'ID' ? !parseSaId(identityNumber).valid : !/^[A-Z0-9]{6,20}$/.test(identityNumber))) return 'Check your ID or passport number.';
    if (current === 'dob' && !dob) return 'Enter your date of birth.';
    if (current === 'province' && !province) return 'Choose your province.';
    if (current === 'employment' && !employment) return 'Choose your employment status.';
    if (current === 'mobile' && !/^(\+27|0)[6-8]\d{8}$/.test(mobile.replace(/\s/g, ''))) return 'Enter a South African mobile number, e.g. 0821234567.';
    if (current === 'address' && address.trim().length < 10) return 'Enter your full residential address.';
    if (current === 'identityDoc' && !identityDoc) return 'Choose your identity document.';
    if (current === 'addressDoc' && !addressDoc) return 'Choose your proof of address.';
    return null;
  }
  function next() { const message = validateStep(); setError(message); if (!message) setStep(s => Math.min(s + 1, steps.length - 1)); }
  function choosePurpose(value: string) { setPurpose(value); setError(null); setStep(s => s + 1); }
  function upload(file: File | undefined, setter: (f: File | null) => void) {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 1900000) { setError('Choose a PDF, JPG or PNG under 1.9 MB.'); return; }
    setter(file); setError(null); setStep(s => s + 1);
  }
  const input = (): PersonalLoanInput => ({ amountCents: amount!, termMonths: term, purpose, monthlyIncomeCents: income!, monthlyExpensesCents: expenses!, consent: true, idempotencyKey: key.current });
  async function submit(offerId?: string) {
    if (!consent && !saved) return;
    setBusy(true); setError(null);
    try {
      if (needsDocuments && !saved) {
        const body = new FormData();
        Object.entries({ identityType, identityNumber, dateOfBirth: dob, province, employmentStatus: employment, mobile: mobile.replace(/\s/g, ''), address, consent: 'true' }).forEach(([k, v]) => { if (v) body.append(k, v); });
        body.append('identity', identityDoc!); body.append('address', addressDoc!);
        await client.consumer.submitPersonalVerification(body);
      }
      const r = await client.consumer.applyPersonalLoan({ ...input(), ...(offerId ? { offerId } : {}) });
      setSaved(r); applications.reload(); verification.reload();
      if (verification.data?.status === 'VERIFIED' && !offerId) {
        const result = await client.consumer.personalMatches(input()); setMatches(result.matches); setMatchReason(result.reason);
      } else if (!offerId) { setMatchReason('Your application is saved. Matched lenders remain private until KYC and FICA document review is complete.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit your application. Your answers are still here.'); }
    finally { setBusy(false); }
  }
  async function resume(app: PersonalLoanApplication) {
    setAmount(app.amountCents); setTerm(app.termMonths); setPurpose(app.purpose); setIncome(app.monthlyIncomeCents); setExpenses(app.monthlyExpensesCents); key.current = app.idempotencyKey; setSaved(app); setConsent(true); setBusy(true); setError(null);
    try { const r = await client.consumer.personalMatches({ amountCents: app.amountCents, termMonths: app.termMonths, purpose: app.purpose, monthlyIncomeCents: app.monthlyIncomeCents, monthlyExpensesCents: app.monthlyExpensesCents, idempotencyKey: app.idempotencyKey, consent: true }); setMatches(r.matches); setMatchReason(r.reason); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not refresh matches'); }
    finally { setBusy(false); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (verification.loading || !me) return <Loading />;
  if (verification.error) return <Alert tone="red">{verification.error}<Button variant="secondary" onClick={verification.reload}>Try again</Button></Alert>;
  return <div className="space-y-8">
    <div className="flex items-center justify-between gap-3"><Link href="/app" className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Your dashboard</Link><StatusBadge status={verification.data?.status ?? 'NOT_STARTED'} /></div>
    <section className="grid overflow-hidden rounded-3xl border border-line bg-white lg:grid-cols-3">
      <aside className="relative overflow-hidden bg-ink p-6 text-white lg:p-8"><div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand/35 blur-3xl" /><div className="relative"><span className="text-xs font-bold uppercase tracking-widest text-brand-orange">Beyond the till</span><h1 className="mt-3 text-3xl font-black tracking-tight">A personal loan.<br />At your pace.</h1><p className="mt-4 text-sm text-white/70">One question at a time. Your answers stay here while you complete this application.</p><div className="mt-6 flex items-start gap-2 text-xs text-white/70"><LockKeyhole className="h-4 w-4 shrink-0" /><span>Lender names unlock after KYC and FICA review. This is an application, with no guarantee of credit.</span></div></div></aside>
      <div className="p-5 sm:p-8 lg:col-span-2">
        {saved ? <div className="space-y-5"><div className="flex items-center gap-2 font-bold text-emerald-700"><Check className="h-5 w-5" /> Application saved</div><h2 className="text-2xl font-bold">{formatZAR(saved.amountCents)} over {saved.termMonths} months</h2><StatusBadge status={saved.status} /><p className="text-sm text-muted">Reference {saved.id.slice(0, 8).toUpperCase()}. Your request is awaiting human review. No funds have been paid out.</p>{matchReason && <Alert tone="blue">{matchReason}</Alert>}{saved.lenderId && <Alert tone="green">Your selected lender has received the application for review.</Alert>}
          {!saved.lenderId && matches?.map(m => <Card key={m.offerId}><div className="font-bold">{m.lenderName}</div><div className="text-sm text-muted">{m.offerName}</div><div className="my-3 flex flex-wrap gap-5 text-sm"><span>Monthly <b>{formatZAR(m.monthlyInstallmentCents)}</b></span><span>Total <b>{formatZAR(m.totalRepayableCents)}</b></span><span>Cost of credit <b>{formatZAR(m.costOfCreditCents)}</b></span></div><p className="mb-3 text-xs text-muted">Indicative terms from your declared finances. The lender must verify affordability and provide final terms.</p><Button loading={busy} onClick={() => submit(m.offerId)}>Send to this lender <ArrowRight className="h-4 w-4" /></Button></Card>)}
          {error && <Alert tone="red">{error}</Alert>}<Button variant="secondary" disabled={busy} onClick={() => { setSaved(null); setMatches(null); setMatchReason(null); key.current = crypto.randomUUID(); setStep(0); setConsent(false); }}>Start another application</Button></div>
        : <form onSubmit={e => { e.preventDefault(); current === 'review' ? submit() : next(); }}>
          <div className="mb-6"><p className="mb-2 text-xs font-semibold text-muted">Question {Math.min(step + 1, steps.length)} of {steps.length}</p><div role="progressbar" aria-label="Application progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1} className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(step + 1) / steps.length * 100}%` }} /></div></div>
          <h2 ref={question} tabIndex={-1} className="mb-6 text-2xl font-bold tracking-tight outline-none" aria-live="polite">{QUESTIONS[current]}</h2>
          <div className="min-h-32">
            {current === 'amount' && <><Field label="Loan amount" hint="R500 to R100,000"><MoneyInput cents={amount} onCents={setAmount} autoFocus /></Field><div className="mt-3 flex flex-wrap gap-2">{[100000, 300000, 500000, 1000000].map(v => <Button key={v} type="button" variant="secondary" size="sm" onClick={() => { setAmount(v); setStep(s => s + 1); }}>{formatZAR(v, { decimals: false })}</Button>)}</div></>}
            {current === 'term' && <><div className="flex flex-wrap gap-2">{[1, 3, 6, 12, 24].map(v => <Button key={v} type="button" variant={term === v ? 'primary' : 'secondary'} onClick={() => { setTerm(v); setStep(s => s + 1); }}>{v} months</Button>)}</div><Field label="Or choose another period"><Input type="number" min={1} max={24} value={term} onChange={e => setTerm(Number(e.target.value))} /></Field></>}
            {current === 'purpose' && <div className="grid gap-2 sm:grid-cols-2">{PURPOSES.map(p => <Button key={p} type="button" variant="secondary" onClick={() => choosePurpose(p)}>{p}</Button>)}</div>}
            {current === 'income' && <Field label="Take-home income per month" hint="Use a reliable monthly average if your earnings vary."><MoneyInput cents={income} onCents={setIncome} autoFocus /></Field>}
            {current === 'expenses' && <Field label="Expenses and other debt repayments per month" hint="Include rent, food, transport, dependants and debt outside XTRA-CASH. We add your existing XTRA-CASH repayments separately."><MoneyInput cents={expenses} onCents={setExpenses} autoFocus /></Field>}
            {current === 'identity' && <div className="space-y-3"><Field label="Document type"><Select value={identityType} onChange={e => { setIdentityType(e.target.value as 'ID' | 'PASSPORT'); setIdentityNumber(''); }}><option value="ID">South African ID</option><option value="PASSPORT">Passport</option></Select></Field><Field label={identityType === 'ID' ? 'ID number' : 'Passport number'} hint="Format checks do not verify your identity. This number is never sent to the AI assistant."><Input value={identityNumber} autoComplete="off" maxLength={identityType === 'ID' ? 13 : 20} onChange={e => setIdentityNumber(e.target.value.replace(/\s/g, '').toUpperCase())} /></Field></div>}
            {current === 'dob' && <Field label="Date of birth"><Input type="date" value={dob} onChange={e => setDob(e.target.value)} /></Field>}
            {current === 'province' && <Field label="Province"><Select value={province} onChange={e => setProvince(e.target.value)}><option value="">Choose a province</option>{PROVINCES.map(p => <option key={p}>{p}</option>)}</Select></Field>}
            {current === 'employment' && <Field label="Employment status"><Select value={employment} onChange={e => setEmployment(e.target.value as EmploymentStatus)}><option value="">Choose an option</option>{Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>}
            {current === 'mobile' && <Field label="Mobile number" hint="Used to contact you. WhatsApp OTP will be enabled once its provider is connected; this step does not verify ownership."><Input type="tel" autoComplete="tel" value={mobile} onChange={e => setMobile(e.target.value)} /></Field>}
            {current === 'address' && <Field label="Full residential address"><Input autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} /></Field>}
            {(current === 'identityDoc' || current === 'addressDoc') && <Field label={current === 'identityDoc' ? 'ID or passport document' : 'Proof of residential address'} hint="A readable PDF, JPG or PNG under 1.9 MB. Documents are available only to you and authorised review staff."><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => upload(e.target.files?.[0], current === 'identityDoc' ? setIdentityDoc : setAddressDoc)} className="h-auto py-3" />{(current === 'identityDoc' ? identityDoc : addressDoc) && <p className="mt-2 flex items-center gap-1 text-sm"><FileCheck className="h-4 w-4" /> Document selected</p>}</Field>}
            {current === 'review' && <div className="space-y-4"><dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4 text-sm"><div><dt className="text-muted">Amount</dt><dd className="font-bold">{formatZAR(amount ?? 0)}</dd></div><div><dt className="text-muted">Period</dt><dd className="font-bold">{term} months</dd></div><div><dt className="text-muted">Purpose</dt><dd>{purpose}</dd></div><div><dt className="text-muted">Monthly income / expenses</dt><dd>{formatZAR(income ?? 0)} / {formatZAR(expenses ?? 0)}</dd></div></dl><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" /><span>I confirm these details are accurate and consent to XTRA-CASH processing my application and documents, and sharing my application with a lender I select. This is a request for review, not a loan agreement.</span></label><p className="text-xs text-muted">Identity and bureau providers are not connected yet. Uploaded documents will be reviewed by staff. Credit checks, verified affordability and final lender terms are still required.</p></div>}
          </div>
          {error && <div className="mt-4" role="alert"><Alert tone="red">{error}</Alert></div>}
          <div className="mt-6 flex items-center justify-between gap-3"><Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => { setStep(s => s - 1); setError(null); }}><ArrowLeft className="h-4 w-4" /> Back</Button><Button loading={busy} disabled={current === 'review' && !consent} type="submit">{current === 'review' ? 'Submit application' : 'Continue'}<ArrowRight className="h-4 w-4" /></Button></div>
        </form>}
      </div>
    </section>
    <section><h2 className="mb-3 text-lg font-bold">Your personal-loan applications</h2>{applications.error && <Alert tone="red">{applications.error}</Alert>}{applications.loading ? <Loading /> : !applications.data?.length ? <p className="text-sm text-muted">Your submitted applications and updates will appear here.</p> : <div className="space-y-3">{applications.data.map(app => <Card key={app.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold">{formatZAR(app.amountCents)} · {app.termMonths} months</div><p className="text-sm text-muted">{app.purpose} · {new Date(app.createdAt).toLocaleDateString('en-ZA')}</p></div><StatusBadge status={app.status} /></div>{app.reviewNotes && <p className="mt-3 text-sm">Reviewer update: {app.reviewNotes}</p>}{!app.lenderId && app.status !== 'DECLINED' && <Button className="mt-3" size="sm" variant="secondary" disabled={busy || verification.data?.status !== 'VERIFIED'} onClick={() => resume(app)}>View matches after verification</Button>}</Card>)}</div>}</section>
  </div>;
}
