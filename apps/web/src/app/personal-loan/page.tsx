'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import { Alert, Button, Card, Field, Input, MoneyInput, Select, useAuth } from '@xtra/ui';
import { AuthPageShell } from '@/components/AuthPageShell';

function LoanStart() {
  const params = useSearchParams(), { client, me } = useAuth();
  const [mode, setMode] = useState(params.get('start') === 'identity' ? 'identity' : 'amount');
  const [step, setStep] = useState(0), [amount, setAmount] = useState<number | null>(100000), [term, setTerm] = useState(6);
  const [type, setType] = useState<'ID' | 'PASSPORT'>('ID'), [number, setNumber] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<string | null>(null);
  const showIdentity = mode === 'identity' || step === 1;
  async function proceed() {
    setError(null);
    if (!showIdentity) {
      if (!amount || amount < 50000 || amount > 10000000 || !Number.isInteger(term) || term < 1 || term > 24) { setError('Choose R500–R100,000 and a period from 1 to 24 months.'); return; }
      setStep(1); return;
    }
    setBusy(true);
    try {
      const r = await client.request<{ message: string }>('POST', '/personal-loans/precheck', { identityType: type, identityNumber: number, consent, ...(mode === 'amount' ? { amountCents: amount, termMonths: term } : {}) });
      sessionStorage.setItem('xtra-personal-request', JSON.stringify({ amountCents: mode === 'amount' ? amount : 100000, termMonths: mode === 'amount' ? term : 6 }));
      setResult(r.message); setNumber('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check product availability'); }
    finally { setBusy(false); }
  }
  return <Card className="w-full max-w-lg p-6 sm:p-8"><span className="text-xs font-bold uppercase tracking-widest text-brand">Personal loans</span><h1 className="mt-2 text-3xl font-black">Find your next step.</h1><p className="mt-3 text-sm text-muted">Check available loan products, then complete your application. Lender names stay private until KYC and FICA review is complete.</p>
    {result ? <div className="mt-6 space-y-4"><Alert tone="blue">{result}</Alert><p className="text-sm text-muted">This checks product availability only. Identity providers and credit bureaus are not connected yet, so this is not an identity or credit decision.</p><Link href={me ? '/app/personal-loan' : '/register?type=CONSUMER&next=%2Fapp%2Fpersonal-loan'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-semibold text-white">{me ? 'Continue your application' : 'Create an account to apply'}<ArrowRight className="h-4 w-4" /></Link>{!me && <Link href="/login?next=%2Fapp%2Fpersonal-loan" className="block text-center text-sm font-semibold underline">Already registered? Sign in to continue</Link>}</div>
    : <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); proceed(); }}>
      {step === 0 && <div className="grid grid-cols-2 gap-2"><Button type="button" variant={mode === 'identity' ? 'primary' : 'secondary'} onClick={() => setMode('identity')}>Start with my ID</Button><Button type="button" variant={mode === 'amount' ? 'primary' : 'secondary'} onClick={() => setMode('amount')}>Choose amount first</Button></div>}
      <h2 className="text-xl font-bold">{showIdentity ? 'What is your ID or passport number?' : 'How much, and over how long?'}</h2>
      {showIdentity ? <><Field label="Document type"><Select value={type} onChange={e => { setType(e.target.value as 'ID' | 'PASSPORT'); setNumber(''); }}><option value="ID">South African ID</option><option value="PASSPORT">Passport</option></Select></Field><Field label={type === 'ID' ? 'ID number' : 'Passport number'} hint="Used for a format check, never sent to the AI assistant."><Input autoComplete="off" required value={number} maxLength={type === 'ID' ? 13 : 20} onChange={e => setNumber(e.target.value.replace(/\s/g, '').toUpperCase())} /></Field><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I consent to this document format check and product search. Identity verification will follow when I apply.</span></label></>
      : <><Field label="Amount" hint="R500 to R100,000"><MoneyInput cents={amount} onCents={setAmount} /></Field><Field label="Loan period in months"><Input type="number" min={1} max={24} value={term} onChange={e => setTerm(Number(e.target.value))} /></Field></>}
      {error && <Alert tone="red">{error}</Alert>}<div className="flex items-center justify-between gap-2">{step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Back</Button> : <span />}<Button loading={busy} disabled={showIdentity && !consent}>{showIdentity ? 'Check availability' : 'Continue'}<ArrowRight className="h-4 w-4" /></Button></div>
    </form>}
    <p className="mt-5 flex items-center gap-1.5 text-xs text-muted"><LockKeyhole className="h-3.5 w-3.5" /> No lender names or approval promises before verification.</p>
  </Card>;
}
export default function PersonalLoanStartPage() { return <AuthPageShell currentPath="/personal-loan"><Suspense><LoanStart /></Suspense></AuthPageShell>; }
