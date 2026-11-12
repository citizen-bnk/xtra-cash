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
        title={`${l.lenderName}`}
        subtitle={`${l.offerName} · taken ${new Date(l.createdAt).toLocaleDateString('en-ZA')}`}
        actions={
          <>
            <StatusBadge status={l.status} />
            {l.status !== 'SETTLED' && (
              <Button
                onClick={() => {
                  setAmount(next || l.outstandingCents);
                  setOpen(true);
                }}
              >
                Make a payment
              </Button>
            )}
          </>
        }
      />
      {l.status === 'IN_ARREARS' && <div className="mb-4"><Alert tone="red" title="Payment overdue">Please pay your overdue installment to avoid fees and to unlock new XTRA-CASH credit.</Alert></div>}
      <Card className="mb-5 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted">Outstanding balance</p><p className="mt-1 text-3xl font-black tabular-nums">{formatZAR(l.outstandingCents)}</p></div><div className="text-right"><p className="text-xs text-muted">Total repayable</p><p className="font-bold tabular-nums">{formatZAR(l.totalRepayableCents)}</p></div></div>
        <div><div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-label={`${progress}% repaid`}><div className="h-full rounded-full bg-brand-purple" style={{ width: `${progress}%` }} /></div><div className="mt-1 flex justify-between text-xs text-muted"><span>{formatZAR(paid)} paid · {progress}%</span><span>{l.termMonths} month term</span></div></div>
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm"><div><p className="text-xs text-muted">Original amount</p><p className="font-semibold">{formatZAR(l.principalCents)}</p></div><div><p className="text-xs text-muted">Next payment</p><p className="font-semibold">{next ? formatZAR(next) : 'No payment due'}</p>{l.nextDue && <p className="text-xs text-muted">{new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}</p>}</div></div>
      </Card>
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
