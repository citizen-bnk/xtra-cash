'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { bpsToPercent, formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Field, Loading, Modal, MoneyInput, PageHeader, StatusBadge, Table, useAction, useApi, useAuth, useToast } from '@xtra/ui';

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
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ['Borrowed', formatZAR(l.principalCents)],
          ['Total repayable', formatZAR(l.totalRepayableCents)],
          ['Paid so far', formatZAR(l.totalRepayableCents - l.outstandingCents)],
          ['Outstanding', formatZAR(l.outstandingCents)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
          </Card>
        ))}
      </div>
      <p className="mb-3 text-xs text-muted">
        {bpsToPercent(l.monthlyInterestRateBps)} interest per month · initiation fee {formatZAR(l.initiationFeeCents)} · service fee {formatZAR(l.monthlyServiceFeeCents)}/month · {l.termMonths} months. Settle early at any time with no penalty.
      </p>
      <Table
        rows={l.installments ?? []}
        columns={[
          { header: '#', cell: (i) => i.seq },
          { header: 'Due date', cell: (i) => new Date(i.dueDate).toLocaleDateString('en-ZA') },
          { header: 'Amount', align: 'right', cell: (i) => formatZAR(i.amountCents) },
          { header: 'Paid', align: 'right', cell: (i) => formatZAR(i.paidCents) },
          { header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
        ]}
      />
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
