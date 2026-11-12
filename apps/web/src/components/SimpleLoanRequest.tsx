'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, ChevronRight, Fingerprint, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Loading, StatusBadge, Textarea, useAuth } from '@xtra/ui';
import { LoanAmountSlider, LoanTermSlider } from './LoanSliders';
import { LoanDocumentsStep } from './LoanDocumentsStep';

type Pillar = 'ID' | 'RISK' | 'INCOME' | 'FRAUD';
type Step = { pillar: Pillar; status: string; prompt: string; reason: string };
type Response = { pillar: Pillar; disposition: 'CONFIRMED' | 'ANSWERED' | 'SKIPPED'; answer?: string };
type Check = { id: string; steps: Step[]; result?: { steps: Step[] } };
const pillarMeta: Record<Pillar, { title: string; icon: typeof Fingerprint }> = {
  ID: { title: 'Identity', icon: Fingerprint },
  RISK: { title: 'Credit & risk', icon: ShieldCheck },
  INCOME: { title: 'Income & affordability', icon: WalletCards },
  FRAUD: { title: 'Fraud screening', icon: TrendingUp },
};

export function SimpleLoanRequest({ onSubmitted }: { onSubmitted: () => void }) {
  const { client } = useAuth();
  const [amount, setAmount] = useState<number | null>(500000), [term, setTerm] = useState(3);
  const [check, setCheck] = useState<Check | null>(null), [phase, setPhase] = useState<'REQUEST' | 'SUMMARY' | 'DOCUMENTS'>('REQUEST');
  const [step, setStep] = useState(0), [responses, setResponses] = useState<Response[]>([]);
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const steps = check?.result?.steps ?? check?.steps ?? [];
  const current = steps[step];

  async function validate() {
    if (!amount || !consent) return;
    setBusy(true); setError('');
    try { setCheck(await client.request<Check>('POST', '/personal-loans/vault/application-validations', { amountCents: amount, termMonths: term })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start validation'); }
    finally { setBusy(false); }
  }
  function record(disposition: Response['disposition']) {
    if (!current) return;
    if (disposition === 'ANSWERED' && answer.trim().length < 3) { setError('Add a short clarification or choose Skip for now.'); return; }
    setResponses((all) => [...all.filter((r) => r.pillar !== current.pillar), { pillar: current.pillar, disposition, ...(answer.trim() ? { answer: answer.trim() } : {}) }]);
    setAnswer(''); setError(''); setStep((n) => Math.min(n + 1, steps.length));
  }
  async function submit() {
    if (!check || !amount || !consent || responses.length !== 4) return;
    setBusy(true); setError('');
    try {
      await client.request('PUT', `/personal-loans/vault/application-validations/${check.id}`, { responses });
      await client.request('POST', '/personal-loans/applications', { amountCents: amount, termMonths: term, consent: true, routingConsent: true, idempotencyKey: idempotencyKey.current, vaultValidationId: check.id });
      onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit your loan request'); }
    finally { setBusy(false); }
  }

  if (!check && phase === 'REQUEST') return <div className="xc-loan-step space-y-5">
    <div className="xc-loan-hero relative flex min-h-24 items-center overflow-hidden rounded-2xl bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] px-4 py-3 text-white">
      <div className="relative z-10 max-w-[68%]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/75">Personal loan</p><h3 className="mt-1 text-lg font-bold leading-tight text-white">A clear path to your next step.</h3><p className="mt-1 text-xs text-white/85">Choose an amount and repayment period.</p></div>
      <Image src="/brand/ui/illustration_p_lender.png" alt="" aria-hidden width={240} height={160} className="absolute -right-2 bottom-0 h-28 w-36 object-contain object-bottom" />
    </div>
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Step 1 of 5</p><h3 className="mt-1 text-lg font-bold">How much do you need?</h3></div><span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-purple">Choose amount</span></div>
    <Card className="space-y-5 border-[#e8d9f3] bg-gradient-to-br from-white via-[#fffaff] to-[#f2e8fb] p-4 sm:p-5">
      <LoanAmountSlider amount={amount} onChange={setAmount} />
      <div className="h-px bg-[#e8deef]" />
      <LoanTermSlider term={term} onChange={setTerm} />
    </Card>
    {error ? <Alert tone="red">{error}</Alert> : null}
    <Button className="w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" disabled={!amount} onClick={() => setPhase('SUMMARY')}>Review request <ArrowRight className="h-4 w-4" /></Button>
  </div>;

  if (!check && phase === 'SUMMARY') return <div className="xc-loan-step space-y-4">
    <button type="button" onClick={() => setPhase('REQUEST')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-purple"><ArrowLeft className="h-4 w-4" /> Change request</button>
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Step 2 of 5</p><h3 className="mt-1 text-lg font-bold">Review your request</h3></div><Image src="/brand/ui/illustration_scorecard.png" alt="" aria-hidden width={96} height={72} className="h-16 w-24 object-contain" /></div>
    <Card className="overflow-hidden border-[#e8d9f3] p-0">
      <div className="bg-gradient-to-r from-[#5c2394] via-[#a617d3] to-[#d91f63] px-4 py-3 text-white"><p className="text-xs text-white/75">Your request</p><p className="text-2xl font-black">{formatZAR(amount ?? 0)}</p></div>
      <dl className="divide-y divide-line px-4 text-sm"><div className="flex justify-between py-3"><dt className="text-muted">Repayment period</dt><dd className="font-bold">{term} {term === 1 ? 'month' : 'months'}</dd></div><div className="py-3"><dt className="font-semibold">Fees and repayment</dt><dd className="mt-1 text-xs leading-relaxed text-muted">Lenders will send offers with the full interest, fees and repayment amount. You can review and compare the terms before accepting.</dd></div></dl>
    </Card>
    <div className="rounded-2xl border border-[#d8c7e7] bg-[#f8f1fc] p-3.5">
      <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-purple" /><label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-ink"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#7b16b5]" /><span>I confirm my request is accurate and consent to XTRA-CASH sharing its privacy-limited validation snapshot with active accredited lenders so they may prepare offers.</span></label></div>
    </div>
    {error ? <Alert tone="red">{error}</Alert> : null}
    <Button className="w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" disabled={!amount || !consent} onClick={() => setPhase('DOCUMENTS')}>Continue to documents <ArrowRight className="h-4 w-4" /></Button>
  </div>;

  if (!check && phase === 'DOCUMENTS') return <LoanDocumentsStep onBack={() => setPhase('SUMMARY')} onContinue={() => void validate()} busy={busy} />;

  if (check && steps.length === 0) return <div className="space-y-3 rounded-2xl bg-[#f8f1fc] p-5 text-center"><Loading /><p className="text-sm font-semibold text-brand-purple">Preparing your secure checks…</p><p className="text-xs text-muted">This usually takes a few seconds.</p></div>;

  if (step >= steps.length) {
    const pending = responses.filter((r) => r.disposition === 'SKIPPED').length;
    return <div className="xc-loan-step space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#32144e] to-[#9d11bd] p-4 text-white"><span className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><CheckCircle2 className="h-7 w-7" /></span><div><p className="text-xs font-semibold text-white/75">Step 3 of 3</p><h3 className="font-bold text-white">Your application is ready</h3></div></div>
      <Alert tone={pending ? 'amber' : 'green'} title={pending ? 'Some details are pending' : 'Your information is confirmed'}>{pending ? `${pending} pillar${pending === 1 ? '' : 's'} will be marked pending for lender review. You may still submit.` : 'Your four data pillars are confirmed or clarified.'}</Alert>
      <Card className="space-y-0 p-0">{responses.map((r, i) => { const meta = pillarMeta[r.pillar], Icon = meta.icon; return <div key={r.pillar} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f3e7f8] text-brand-purple"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{i + 1}. {meta.title}</span>{r.answer && <span className="block truncate text-xs text-muted">{r.answer}</span>}</span><StatusBadge status={r.disposition === 'SKIPPED' ? 'PENDING' : r.disposition} /></div>; })}</Card>
      {error ? <Alert tone="red">{error}</Alert> : null}
      <Button className="w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" loading={busy} disabled={!consent} onClick={() => void submit()}>Submit loan request <ArrowRight className="h-4 w-4" /></Button>
      <Button className="w-full" variant="secondary" disabled={busy} onClick={() => setStep(steps.length - 1)}>Review last check</Button>
    </div>;
  }
  if (!current) return null;
  const meta = pillarMeta[current.pillar], Icon = meta.icon;
  return <div className="xc-loan-step space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Secure checks · {step + 1} of {steps.length}</p><h3 className="mt-1 text-lg font-bold">{meta.title}</h3></div><span className="text-sm font-semibold text-brand-purple">{Math.round(((step + 1) / steps.length) * 100)}%</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#e9dff0]"><div className="h-full rounded-full bg-gradient-to-r from-[#a617d3] to-[#d91f63] transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
    <Card className="border-[#e8d9f3] bg-gradient-to-br from-white to-[#f8f1fc] p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f2e3fa] text-brand-purple">{current.status === 'VERIFIED' || current.status === 'CALCULATED' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Icon className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{current.prompt}</p><StatusBadge status={current.status} /></div><p className="mt-2 text-sm text-muted">{current.reason}</p></div></div><Textarea className="mt-4 bg-white" rows={3} maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Optional clarification" /></Card>
    {error ? <Alert tone="red">{error}</Alert> : null}
    <div className="grid gap-2 sm:grid-cols-2"><Button variant="secondary" onClick={() => record('SKIPPED')}>Skip for now</Button><Button className="bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" onClick={() => record(answer.trim() ? 'ANSWERED' : 'CONFIRMED')}>{answer.trim() ? 'Save and continue' : 'Confirm and continue'} <ChevronRight className="h-4 w-4" /></Button></div>
    {step > 0 ? <Button variant="ghost" onClick={() => { setStep((n) => n - 1); setAnswer(''); }}><ArrowLeft className="h-4 w-4" /> Back</Button> : null}
  </div>;
}
