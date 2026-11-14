'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Fingerprint } from 'lucide-react';
import { EMPLOYMENT_LABELS, EmploymentStatus, formatZAR, parseSaId, PROVINCES } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, MoneyInput, Select, useAuth } from '@xtra/ui';
import { LoanAmountSlider, LoanTermSlider } from './LoanSliders';
import { LoanDocumentsStep } from './LoanDocumentsStep';

type Phase = 'REQUEST' | 'IDENTITY' | 'BANK' | 'SUMMARY';
type Check = { id: string; result?: { steps?: { pillar: 'ID' | 'RISK' | 'INCOME' | 'FRAUD'; status: string }[] }; steps?: { pillar: 'ID' | 'RISK' | 'INCOME' | 'FRAUD'; status: string }[] };
const primary = 'w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105';

export function SimpleLoanRequest({ onSubmitted }: { onSubmitted: () => void }) {
  const { client, me, refreshMe } = useAuth();
  const [phase, setPhase] = useState<Phase>('REQUEST');
  const [amount, setAmount] = useState<number | null>(500000), [term, setTerm] = useState(3);
  const [idNumber, setIdNumber] = useState('');
  const [province, setProvince] = useState(''), [employment, setEmployment] = useState<EmploymentStatus | ''>('');
  const [income, setIncome] = useState<number | null>(null), [expenses, setExpenses] = useState<number | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());
  const needsProfile = !me?.kyc;
  const heading = (n: number, title: string, subtitle: string) => <div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Step {n} of 4</p><h3 className="mt-1 text-xl font-bold">{title}</h3><p className="mt-1 text-sm text-muted">{subtitle}</p></div>;
  const back = (to: Phase) => <button type="button" onClick={() => setPhase(to)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-purple"><ArrowLeft className="h-4 w-4" /> Back</button>;

  async function saveIdentity() {
    setError('');
    if (!needsProfile) { setPhase('BANK'); return; }
    const parsed = parseSaId(idNumber);
    if (!parsed.valid) { setError(parsed.reason || 'Enter a valid South African ID number.'); return; }
    if (!province || !employment || !income || expenses === null || !consent) { setError('Complete your details and agree to the credit check.'); return; }
    setBusy(true);
    try {
      await client.consumer.submitKyc({ idNumber, province, employmentStatus: employment, monthlyIncomeCents: income, monthlyExpensesCents: expenses, consentCreditCheck: true });
      await refreshMe(); setPhase('BANK');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your details'); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!amount || !consent) return;
    setBusy(true); setError('');
    try {
      const check = await client.request<Check>('POST', '/personal-loans/vault/application-validations', { amountCents: amount, termMonths: term });
      const steps = check.result?.steps ?? check.steps ?? [];
      const responses = (['ID', 'RISK', 'INCOME', 'FRAUD'] as const).map(pillar => ({ pillar, disposition: steps.find(step => step.pillar === pillar)?.status === 'VERIFIED' || steps.find(step => step.pillar === pillar)?.status === 'CALCULATED' ? 'CONFIRMED' : 'SKIPPED' }));
      await client.request('PUT', `/personal-loans/vault/application-validations/${check.id}`, { responses });
      await client.request('POST', '/personal-loans/applications', { amountCents: amount, termMonths: term, consent: true, routingConsent: true, idempotencyKey: idempotencyKey.current, vaultValidationId: check.id });
      onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit your loan request'); }
    finally { setBusy(false); }
  }
  return <div className="xc-loan-step space-y-5">
    {phase === 'REQUEST' && <><div className="relative flex min-h-28 items-center overflow-hidden rounded-2xl bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] px-4 py-3 text-white"><div className="relative z-10 max-w-[68%]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/75">Personal loan</p><h3 className="mt-1 text-lg font-bold leading-tight text-white">Get the money you need.</h3><p className="mt-1 text-xs text-white/85">Apply in a few simple steps.</p></div><Image src="/brand/photo/customer-loan.png" alt="" aria-hidden width={240} height={160} className="absolute -right-2 bottom-0 h-28 w-36 object-contain object-bottom" /></div>{heading(1, 'How much do you need?', 'Choose an amount and repayment period.')}<Card className="space-y-5 border-[#e8d9f3] bg-gradient-to-br from-white via-[#fffaff] to-[#f2e8fb] p-4 sm:p-5"><LoanAmountSlider amount={amount} onChange={setAmount} /><div className="h-px bg-[#e8deef]" /><LoanTermSlider term={term} onChange={setTerm} /></Card><Button className={primary} disabled={!amount} onClick={() => setPhase('IDENTITY')}>Continue <ArrowRight className="h-4 w-4" /></Button></>}
    {phase === 'IDENTITY' && <>{back('REQUEST')}{heading(2, 'Confirm your details', 'We use these details to check if you may qualify.')}<Card className="space-y-4 border-[#e8d9f3] bg-white p-4">{needsProfile ? <><Field label="South African ID number"><Input inputMode="numeric" autoComplete="off" maxLength={13} value={idNumber} onChange={e => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="13 digit ID number" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Province"><Select value={province} onChange={e => setProvince(e.target.value)}><option value="">Choose province</option>{PROVINCES.map(p => <option key={p}>{p}</option>)}</Select></Field><Field label="Employment"><Select value={employment} onChange={e => setEmployment(e.target.value as EmploymentStatus)}><option value="">Choose employment</option>{Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Monthly income after tax"><MoneyInput cents={income} onCents={setIncome} /></Field><Field label="Monthly expenses"><MoneyInput cents={expenses} onCents={setExpenses} /></Field></div></> : <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3e7f8] text-brand-purple"><Fingerprint className="h-6 w-6" /></span><div><p className="text-sm font-semibold">ID ending {me.kyc!.idNumber.slice(-4)}</p><p className="text-xs text-muted">Saved to your XTRA-CASH profile</p></div><BadgeCheck className="ml-auto h-5 w-5 text-green-600" /></div>}</Card>{needsProfile && <label className="flex items-start gap-3 rounded-xl bg-[#f8f1fc] p-3 text-xs leading-relaxed"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#7b16b5]" />I consent to a credit check to assess my loan request. Saving these details does not mean my identity or loan is approved.</label>}{error && <Alert tone="red">{error}</Alert>}<Button className={primary} loading={busy} onClick={() => void saveIdentity()}>Continue <ArrowRight className="h-4 w-4" /></Button></>}
    {phase === 'BANK' && <LoanDocumentsStep onBack={() => setPhase('IDENTITY')} onContinue={() => setPhase('SUMMARY')} busy={busy} />}
    {phase === 'SUMMARY' && <>{back('BANK')}{heading(4, 'Review your request', 'A lender will assess your request and may send you an offer.')}<Card className="overflow-hidden border-[#e8d9f3] p-0"><div className="bg-gradient-to-r from-[#5c2394] via-[#a617d3] to-[#d91f63] px-4 py-3 text-white"><p className="text-xs text-white/75">Requested amount</p><p className="text-2xl font-black">{formatZAR(amount ?? 0)}</p></div><div className="flex justify-between px-4 py-3 text-sm"><span className="text-muted">Repayment period</span><b>{term} {term === 1 ? 'month' : 'months'}</b></div></Card><p className="text-xs leading-relaxed text-muted">We use your profile and bank statements to evaluate whether you may qualify. Interest, fees and repayments are shown in any lender offer before you decide.</p><label className="flex items-start gap-3 rounded-xl bg-[#f8f1fc] p-3 text-xs leading-relaxed"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#7b16b5]" />I confirm my request is accurate and consent to XTRA-CASH sharing the information needed for assessment with active accredited lenders.</label>{error && <Alert tone="red">{error}</Alert>}<Button className={primary} disabled={!consent} loading={busy} onClick={() => void submit()}>Submit loan request <ArrowRight className="h-4 w-4" /></Button></>}
  </div>;
}
