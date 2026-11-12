'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Field, Loading, Modal, MoneyInput, PageHeader, StatusBadge, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function LoanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, client, refreshMe } = useAuth();
  const toast = useToast();
  const loan = useApi((c) => c.consumer.loan(id), [id]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);

  const repay = useAction(async () => {
    await client.consumer.repay(id, amount!);
    toast('Payment received — thank you!');
    setOpen(false);
    loan.reload();
    refreshMe();
  });

  if (loan.loading && !loan.data) return <Loading />;
  const l = loan.data;
  if (!l) return <Alert tone="red">{loan.error}</Alert>;
  const next = l.nextDue ? l.nextDue.amountCents - l.nextDue.paidCents : 0;
  const installments = l.installments ?? [];
  const paid = Math.max(0, l.totalRepayableCents - l.outstandingCents);
  const progress = l.totalRepayableCents ? Math.min(100, Math.round((paid / l.totalRepayableCents) * 100)) : 0;

  return (
    <div>
      <Link href="/app/loans" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Repayments
      </Link>
      <PageHeader
        title="My loan"
        subtitle={`${l.offerName} · taken ${new Date(l.createdAt).toLocaleDateString('en-ZA')}`}
        actions={<StatusBadge status={l.status} />}
      />
      {l.status === 'IN_ARREARS' && <div className="mb-4"><Alert tone="red" title="Payment overdue">Please pay your overdue installment to avoid fees and to unlock new XTRA-CASH credit.</Alert></div>}
      <section className="relative mb-5 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#1b1030] via-[#5c2394] to-[#a617d3] p-5 text-white shadow-[0_14px_34px_rgba(51,17,78,.22)]">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#d91f63]/45 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3"><div><span className="inline-flex rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold">{l.status.replaceAll('_',' ')}</span><p className="mt-4 text-xs text-white/70">Loan amount</p><p className="mt-0.5 text-3xl font-black tabular-nums">{formatZAR(l.principalCents)}</p></div><div className="rounded-2xl border border-white/20 bg-white/10 p-3 text-right"><p className="text-[10px] text-white/70">Outstanding</p><p className="mt-1 text-lg font-bold tabular-nums">{formatZAR(l.outstandingCents)}</p></div></div>
        <div className="relative mt-5"><div className="h-1.5 overflow-hidden rounded-full bg-white/20" aria-label={`${progress}% repaid`}><div className="h-full rounded-full bg-[#fb9320]" style={{ width: `${progress}%` }} /></div><div className="mt-1.5 flex justify-between text-[11px] text-white/75"><span>{formatZAR(paid)} paid · {progress}%</span><span>{l.termMonths} month term</span></div></div>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/10 p-3"><div><p className="text-[10px] text-white/70">Next payment</p><p className="font-bold">{next ? formatZAR(next) : 'No payment due'}</p>{l.nextDue && <p className="text-[10px] text-white/70">Due {new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}</p>}</div>{l.status !== 'SETTLED' && <Button className="rounded-full bg-gradient-to-r from-[#fb9320] to-[#f56a28] text-[#1b1030] hover:brightness-105" onClick={() => { setAmount(next || l.outstandingCents); setOpen(true); }}>Pay now</Button>}</div>
      </section>
      <details className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">Interest, fees and terms</summary><p className="mt-3 text-muted">{bpsToPercent(l.monthlyInterestRateBps)} interest per month · initiation fee {formatZAR(l.initiationFeeCents)} · service fee {formatZAR(l.monthlyServiceFeeCents)}/month. Settle early at any time with no penalty.</p></details>
      <section className="space-y-2" aria-label="Repayment schedule"><div className="flex items-center justify-between"><h2 className="font-bold">Repayment schedule</h2><span className="text-xs text-muted">{l.installments?.length ?? 0} instalments</span></div>
        {installments.length ? <Card className="space-y-0 p-0">{installments.map((i) => <div key={i.id ?? i.seq} className="flex min-w-0 items-center gap-2 border-b border-line px-3 py-3 last:border-0 sm:gap-4 sm:px-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Payment {i.seq} <span className="font-normal text-muted">· {new Date(i.dueDate).toLocaleDateString('en-ZA')}</span></p>{i.paidCents > 0 && <p className="text-xs text-muted">{formatZAR(i.paidCents)} paid</p>}</div><p className="shrink-0 text-sm font-bold tabular-nums">{formatZAR(i.amountCents)}</p><StatusBadge status={i.status} /></div>)}</Card> : <Card><p className="text-sm text-muted">Your repayment schedule is not available yet.</p></Card>}
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="Make a payment">
        <div className="space-y-4">
          <div className="rounded-xl bg-surface p-3 text-sm">
            Paid from your wallet · balance <span className="font-semibold">{formatZAR(me?.walletBalanceCents)}</span>
          </div>
          <Field label="Amount">
            <MoneyInput cents={amount} onCents={setAmount} />
          </Field>
          <div className="flex gap-2">
            {next > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setAmount(next)}>
                Next installment
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setAmount(l.outstandingCents)}>
              Settle in full
            </Button>
          </div>
          {repay.error && <Alert tone="red">{repay.error}</Alert>}
          <Button className="w-full" loading={repay.loading} disabled={!amount} onClick={() => repay.run()}>
            Pay {amount ? formatZAR(Math.min(amount, l.outstandingCents)) : ''}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
