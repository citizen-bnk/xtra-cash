'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Bot, FilePenLine, LockKeyhole, Sparkles } from 'lucide-react';
import { bpsToPercent, formatZAR, type OfferAssistantResponse, type OfferInput } from '@xtra/shared';
import { Alert, Badge, Button, cx, useApi, useAuth } from '@xtra/ui';
import { Message, MessageContent, MessageResponse } from './ai-elements/message';

const goals = ['Improve my loan book', 'Grow sustainable returns', 'Create a personal loan offer'];
type ChatMessage = { role: 'user' | 'assistant'; content: string };
export function OfferAssistant({ onReview, onManual }: { onReview: (draft: OfferInput) => void; onManual: () => void }) {
  const { client } = useAuth();
  const book = useApi(c => c.lender.stats());
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Let’s build an offer that works for your business and your borrowers. What would you like to improve: returns, the quality of your loan book, or your reach? Tell me whether it’s for BNPL or personal loans.' }]);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfferAssistantResponse | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);
  async function send(value = text) {
    if (!value.trim() || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: value.trim() }];
    setMessages(next); setText(''); setBusy(true); setError(null);
    try {
      const r = await client.lender.assistOffer(next.slice(-12).map(m => ({ ...m, content: m.content.slice(0, 2000) })));
      setMessages([...next, { role: 'assistant', content: r.message }]);
      setDraft(r.draft ? r : null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the assistant'); }
    finally { setBusy(false); }
  }
  return <section className="mb-8 overflow-hidden rounded-3xl border border-line bg-white shadow-sm" aria-label="AI offer assistant">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-6 py-5 text-white">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10"><Sparkles className="h-5 w-5 text-brand-orange" /></span><div><h2 className="font-bold">Your lending co-pilot</h2><p className="text-xs text-white/65">Start with a conversation. Finish with an offer you control.</p></div></div>
      <Button variant="secondary" size="sm" onClick={onManual}><FilePenLine className="h-4 w-4" /> Use the form instead</Button>
    </div>
    <div className="grid lg:grid-cols-5">
      <div className="border-b border-line p-5 lg:col-span-3 lg:border-b-0 lg:border-r">
        <div className="max-h-[330px] min-h-[160px] space-y-5 overflow-y-auto pr-2" role="log" aria-live="polite" aria-label="Offer planning conversation">
          {messages.map((m, i) => <Message from={m.role} key={i} className={cx(m.role === 'user' && 'rounded-2xl bg-brand-soft p-3')}><MessageContent className="text-ink">{m.role === 'assistant' && <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-brand-violet"><Bot className="h-3.5 w-3.5" /> XTRA-CASH assistant</span>}<MessageResponse components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>{m.content}</MessageResponse></MessageContent></Message>)}
          {busy && <div className="flex items-center gap-2 text-sm text-muted" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> Considering your goals and loan book…</div>}
          <div ref={end} />
        </div>
        {messages.length === 1 && <div className="my-4 flex flex-wrap gap-2">{goals.map(g => <button key={g} disabled={busy} onClick={() => send(g)} className="rounded-full border border-line px-3 py-2 text-xs font-medium hover:border-brand hover:bg-brand-soft">{g}<ArrowUpRight className="ml-1 inline h-3 w-3" /></button>)}</div>}
        {error && <div className="my-3"><Alert tone="amber">{error}</Alert></div>}
        <form onSubmit={e => { e.preventDefault(); send(); }} className="mt-4 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:ring-2 focus-within:ring-brand/20">
          <textarea aria-label="Message to lending assistant" placeholder="e.g. A 6-month personal loan with lower arrears risk…" value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={2} className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button aria-label="Send message" type="submit" loading={busy} disabled={!text.trim()} className="h-10 w-10 px-0"><ArrowUp className="h-4 w-4" /></Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><LockKeyhole className="h-3 w-3" /> Uses your aggregate book. Keep customer names, IDs and documents out of the chat.</p>
      </div>
      <aside className="bg-surface/70 p-5 lg:col-span-2">
        {draft?.draft ? <>
          <Badge tone="brand">Draft · not published</Badge><h3 className="mt-3 text-xl font-bold">{draft.draft.name}</h3><p className="mt-1 text-sm text-muted">{draft.draft.description}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Product" value={draft.draft.productType === 'PERSONAL' ? 'Personal loan' : 'BNPL'} />
            <Metric label="Period" value={`${draft.draft.termMonths} months`} /><Metric label="Monthly interest" value={bpsToPercent(draft.draft.monthlyInterestRateBps)} />
            <Metric label="Maximum" value={formatZAR(draft.draft.maxAmountPerUserCents)} />
          </div>
          {draft.example && <div className="mt-5 rounded-2xl border border-line bg-white p-4 text-sm"><p className="font-semibold">Example on {formatZAR(draft.example.principalCents)}</p><p className="mt-2">{draft.draft.termMonths} × {formatZAR(draft.example.monthlyInstallmentCents)}</p><p className="text-muted">Total repayment {formatZAR(draft.example.totalRepayableCents)}</p><div className="mt-3 border-t border-line pt-3"><p className="text-xs text-muted">Lender surplus after platform share</p><b>{formatZAR(draft.example.lenderRevenueCents)}</b><p className="mt-1 text-xs text-muted">Before funding, operating costs and credit losses. At a hypothetical 5% loss of principal: {formatZAR(draft.example.lenderRevenueCents - Math.round(draft.example.principalCents * .05))}.</p></div></div>}
          <p className="my-4 text-xs text-muted">{draft.eligibleConsumers} of {draft.totalConsumers} verified shoppers meet the criteria, before affordability. This is a scenario, not a profit forecast.</p>
          <Button onClick={() => onReview(draft.draft!)} className="w-full">Review & save draft <ArrowUpRight className="h-4 w-4" /></Button>
        </> : <><Badge tone="brand">Built around your book</Badge><h3 className="mt-3 text-lg font-bold">Better lending starts with a better plan.</h3><p className="mt-2 text-sm leading-relaxed text-muted">Explore pricing, loan periods and lending limits together. Your assistant explains the trade-offs, then prepares a draft for your review.</p><div className="mt-6 space-y-4"><Metric label="Available to lend" value={book.data ? formatZAR(book.data.availableCents) : '—'} /><Metric label="Active loans" value={book.data?.activeLoans ?? '—'} /><Metric label="Loans in arrears" value={book.data ? `${book.data.loansInArrears} of ${book.data.activeLoans}` : '—'} /></div><p className="mt-6 text-xs text-muted">Nothing is changed or published without you saving it.</p></>}
      </aside>
    </div>
  </section>;
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="text-xs text-muted">{label}</div><div className="mt-1 font-semibold">{value}</div></div>; }
