'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, StatusBadge, Textarea, useAuth } from '@xtra/ui';
import { LoanAmountSlider, LoanTermSlider } from './LoanSliders';

type Pillar = 'ID' | 'RISK' | 'INCOME' | 'FRAUD';
type Step = { pillar: Pillar; status: string; prompt: string; reason: string };
type Response = { pillar: Pillar; disposition: 'CONFIRMED' | 'ANSWERED' | 'SKIPPED'; answer?: string };
type Check = { id: string; steps: Step[]; result?: { steps: Step[] } };

export function SimpleLoanRequest({ onSubmitted }: { onSubmitted: () => void }) {
  const { client } = useAuth();
  const [amount, setAmount] = useState<number | null>(100000), [term, setTerm] = useState(6);
  const [check, setCheck] = useState<Check | null>(null), [step, setStep] = useState(0), [responses, setResponses] = useState<Response[]>([]);
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const steps = check?.result?.steps ?? check?.steps ?? [];
  const current = steps[step];
  async function validate() {
    if (!amount) return;
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
  if (!check) return <div className="space-y-5"><Alert tone="blue" title="Two choices, then a quick check">Choose the amount and period. XTRA-CASH will validate your existing data vault and only ask about gaps or discrepancies.</Alert><LoanAmountSlider amount={amount} onChange={setAmount} /><LoanTermSlider term={term} onChange={setTerm} /><div className="rounded-2xl bg-surface p-4 text-sm"><div className="flex justify-between"><span>Request</span><strong>{formatZAR(amount ?? 0)}</strong></div><div className="mt-2 flex justify-between"><span>Period</span><strong>{term} months</strong></div></div>{error ? <Alert tone="red">{error}</Alert> : null}<Button loading={busy} disabled={!amount} onClick={validate}>Validate my data vault</Button></div>;
  if (step >= steps.length) {
    const pending = responses.filter((r) => r.disposition === 'SKIPPED').length;
    return <div className="space-y-4"><Alert tone={pending ? 'amber' : 'green'} title="Validation complete">{pending ? `${pending} pillar${pending === 1 ? '' : 's'} will be marked pending for lender review. You may still submit.` : 'All four pillars were confirmed or clarified.'}</Alert><Card><div className="flex justify-between"><span className="text-sm text-muted">Amount</span><strong>{formatZAR(amount)}</strong></div><div className="mt-2 flex justify-between"><span className="text-sm text-muted">Period</span><strong>{term} months</strong></div>{responses.map((r) => <div key={r.pillar} className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="font-semibold">{r.pillar}</span><StatusBadge status={r.disposition === 'SKIPPED' ? 'PENDING' : r.disposition} /></div>)}</Card><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" /><span>I confirm this request is accurate and consent to XTRA-CASH sharing its privacy-limited validation snapshot with active accredited lenders so they may prepare offers.</span></label>{error ? <Alert tone="red">{error}</Alert> : null}<Button loading={busy} disabled={!consent} onClick={submit}>Submit loan request</Button><Button variant="secondary" disabled={busy} onClick={() => setStep(steps.length - 1)}>Review last pillar</Button></div>;
  }
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-widest text-brand">Pillar {step + 1} of 4</span><h2 className="mt-1 text-xl font-black">{current.pillar}</h2></div><StatusBadge status={current.status} /></div><div className="flex gap-1" aria-label={`Validation progress ${step + 1} of 4`}>{steps.map((s, i) => <span key={s.pillar} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />)}</div><Card><div className="flex items-start gap-3">{current.status === 'VERIFIED' || current.status === 'CALCULATED' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <CircleDashed className="h-5 w-5 shrink-0 text-brand" />}<div><p className="font-semibold">{current.prompt}</p><p className="mt-2 text-sm text-muted">{current.reason}</p></div></div><Textarea className="mt-4" rows={4} maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Optional clarification" /></Card>{error ? <Alert tone="red">{error}</Alert> : null}<div className="grid gap-2 sm:grid-cols-2"><Button variant="secondary" onClick={() => record('SKIPPED')}>Skip · mark pending</Button><Button onClick={() => record(answer.trim() ? 'ANSWERED' : 'CONFIRMED')}>{answer.trim() ? 'Save clarification' : 'Confirm and continue'} <ChevronRight className="h-4 w-4" /></Button></div>{step > 0 ? <Button variant="ghost" onClick={() => { setStep((n) => n - 1); setAnswer(''); }}><ChevronLeft className="h-4 w-4" /> Back</Button> : null}</div>;
}
