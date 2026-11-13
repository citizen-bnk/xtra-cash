'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import { Alert, Button, Field, Input, Logo, Select, useAuth } from '@xtra/ui';
import { LoanAmountSlider, LoanTermSlider } from '@/components/LoanSliders';

function LoanStart() {
  const params = useSearchParams(), { client, me } = useAuth();
  const [step, setStep] = useState(params.get('start') === 'identity' ? 1 : 0);
  const [amount, setAmount] = useState<number | null>(() => { const v = Number(params.get('amountCents')); return Number.isInteger(v) && v >= 50000 && v <= 10000000 ? v : 100000; });
  const [term, setTerm] = useState(() => { const v = Number(params.get('termMonths')); return Number.isInteger(v) && v >= 1 && v <= 24 ? v : 6; });
  const [type, setType] = useState<'ID' | 'PASSPORT'>('ID'), [number, setNumber] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [result, setResult] = useState<string | null>(null);
  async function proceed() {
    setError(null);
    if (step === 0) {
      if (!amount || amount < 50000 || amount > 10000000 || !Number.isInteger(term) || term < 1 || term > 24) { setError('Choose an amount and period within the available range.'); return; }
      sessionStorage.setItem('xtra-personal-request', JSON.stringify({ amountCents: amount, termMonths: term, selectedAt: Date.now() }));
      setStep(1); return;
    }
    setBusy(true);
    try {
      const response = await client.request<{ message: string }>('POST', '/personal-loans/precheck', { identityType: type, identityNumber: number, consent, amountCents: amount, termMonths: term });
      setResult(response.message); setNumber('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check available loan products'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col bg-[#f6f2f9] md:min-h-0 md:flex-row md:overflow-hidden md:rounded-[32px] md:shadow-[0_24px_90px_rgba(27,16,48,.22)]">
    <aside className="relative isolate min-h-40 overflow-hidden bg-gradient-to-br from-[#1b1030] via-[#5c2394] to-[#d91f63] p-5 text-white md:flex md:min-h-[680px] md:w-[45%] md:flex-col md:justify-between md:p-8"><div className="absolute -bottom-16 -right-8 h-48 w-48 rounded-full bg-[#fb9320]/70 blur-3xl"/><Link href="/" className="relative inline-block"><Logo light size={31} /></Link><div className="relative mt-5 max-w-[60%] md:mt-auto md:max-w-[90%]"><h1 className="text-2xl font-black leading-tight text-white md:text-4xl">A loan when you need it.</h1><p className="mt-2 text-sm text-white/80">Choose an amount. See if a lender may be able to help.</p></div><Image src="/brand/ui/illustration_p_lender.png" alt="" aria-hidden width={320} height={270} className="absolute -bottom-2 -right-2 h-36 w-40 object-contain object-bottom md:h-64 md:w-64" /></aside>
    <main className="flex min-w-0 flex-1 flex-col justify-center p-5 pb-10 sm:p-8 md:p-12"><div className="mx-auto w-full max-w-md"><Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-[#5c2394]"><ArrowLeft className="h-4 w-4" /> Back to home</Link>{result ? <div className="space-y-5"><p className="text-xs font-bold uppercase tracking-widest text-[#8c00cf]">Your next step</p><h2 className="text-2xl font-black">Continue your loan journey</h2><Alert tone="blue">{result}</Alert><p className="text-sm text-muted">This is a product availability check. A lender will assess your full application before making an offer.</p><Link href={me ? '/app/loans' : '/register?type=CONSUMER&next=%2Fapp%2Floans'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8c00cf] to-[#d91f63] px-4 py-3 font-bold text-white">{me ? 'Open my loans' : 'Create an account to apply'}<ArrowRight className="h-4 w-4" /></Link>{!me && <Link href="/login?next=%2Fapp%2Floans" className="block text-center text-sm font-semibold text-[#5c2394] underline">Already registered? Sign in</Link>}</div> : <form className="space-y-5" onSubmit={e => { e.preventDefault(); void proceed(); }}><div><p className="text-xs font-bold uppercase tracking-widest text-[#8c00cf]">Step {step + 1} of 2</p><h2 className="mt-1 text-2xl font-black">{step === 0 ? 'How much do you need?' : 'Confirm your ID'}</h2><p className="mt-1 text-sm text-muted">{step === 0 ? 'Choose an amount and repayment period.' : 'We use your ID to check whether you may qualify.'}</p></div>{step === 0 ? <div className="space-y-4 rounded-[22px] border border-[#e8d9f3] bg-white p-4 shadow-sm"><LoanAmountSlider amount={amount} onChange={setAmount} /><div className="h-px bg-[#e8d9f3]"/><LoanTermSlider term={term} onChange={setTerm} /></div> : <div className="space-y-4 rounded-[22px] border border-[#e8d9f3] bg-white p-4 shadow-sm"><Field label="Document type"><Select value={type} onChange={e => { setType(e.target.value as 'ID' | 'PASSPORT'); setNumber(''); }}><option value="ID">South African ID</option><option value="PASSPORT">Passport</option></Select></Field><Field label={type === 'ID' ? 'ID number' : 'Passport number'}><Input autoComplete="off" inputMode={type === 'ID' ? 'numeric' : 'text'} required value={number} maxLength={type === 'ID' ? 13 : 20} onChange={e => setNumber(e.target.value.replace(/\s/g, '').toUpperCase())} /></Field><label className="flex items-start gap-3 text-xs leading-relaxed"><input className="mt-0.5 h-5 w-5 shrink-0 accent-[#7b16b5]" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to a document format check and loan product search.</label></div>}{error && <Alert tone="red">{error}</Alert>}<div className="flex items-center gap-2">{step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Back</Button>}<Button className="ml-auto bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white" loading={busy} disabled={step === 1 && !consent}>{step === 0 ? 'Continue' : 'Check availability'}<ArrowRight className="h-4 w-4" /></Button></div><p className="flex items-center gap-1.5 text-xs text-muted"><LockKeyhole className="h-3.5 w-3.5" /> No approval is promised before a lender reviews your request.</p></form>}</div></main>
  </div>;
}
export default function PersonalLoanStartPage() { return <div className="bg-[#ede4f3] md:grid md:min-h-[100dvh] md:place-items-center md:p-6"><Suspense><LoanStart /></Suspense></div>; }
