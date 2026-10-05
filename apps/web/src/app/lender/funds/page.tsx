'use client';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Copy } from 'lucide-react';
import { formatZAR, type LenderFunding } from '@xtra/shared';
import { Alert, Button, Card, Field, Loading, Modal, MoneyInput, PageHeader, Stat, StatusBadge, Table, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function FundsPage() {
  const { client } = useAuth();
  const toast = useToast();
  const stats = useApi((c) => c.lender.stats());
  const funding = useApi((c) => c.lender.funding());
  const info = useApi((c) => c.lender.fundingInstructions());
  const [mode, setMode] = useState<'LOAD' | 'WITHDRAWAL' | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [created, setCreated] = useState<LenderFunding | null>(null);

  const request = useAction(async () => {
    const f = await client.lender.requestFunding(mode!, amount!);
    setCreated(f);
    funding.reload();
    stats.reload();
    if (mode === 'WITHDRAWAL') toast('Withdrawal requested');
    return f;
  });
  const close = () => {
    setMode(null);
    setAmount(null);
    setCreated(null);
  };

  if (!stats.data) return <Loading />;
  return (
    <div>
      <PageHeader
        title="Funds"
        subtitle="Money in your stall is lent to matched shoppers. Repayments (less the XTRA-CASH platform share) flow straight back here."
        actions={
          <>
            <Button onClick={() => setMode('LOAD')}><ArrowDownToLine className="h-4 w-4" /> Load funds</Button>
            <Button variant="secondary" onClick={() => setMode('WITHDRAWAL')}><ArrowUpFromLine className="h-4 w-4" /> Withdraw</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat href="#funding-history" label="Available to lend" value={formatZAR(stats.data.availableCents)} />
        <Stat href="/lender/loans" label="Lent out (outstanding)" value={formatZAR(stats.data.outstandingCents)} />
        <Stat href="#funding-history" label="Total loaded" value={formatZAR(stats.data.totalLoadedCents)} />
      </div>
      <h2 id="funding-history" className="mb-3 scroll-mt-6 font-bold">History</h2>
      <Table
        rows={funding.data ?? []}
        empty="No funding activity yet"
        columns={[
          { header: 'Date', cell: (f) => new Date(f.createdAt).toLocaleDateString('en-ZA') },
          { header: 'Type', cell: (f) => (f.type === 'LOAD' ? 'Load' : 'Withdrawal') },
          { header: 'Reference', cell: (f) => <code className="text-xs">{f.reference}</code> },
          { header: 'Amount', align: 'right', cell: (f) => formatZAR(f.amountCents) },
          { header: 'Status', cell: (f) => <StatusBadge status={f.status} /> },
        ]}
      />

      <Modal open={!!mode} onClose={close} title={mode === 'LOAD' ? 'Load funds' : 'Withdraw funds'}>
        {created && mode === 'LOAD' ? (
          <div className="space-y-4 text-sm">
            <Alert tone="green" title="Almost done">Make an EFT for {formatZAR(created.amountCents)} using the reference below. Funds go live once our finance team confirms receipt (usually same business day).</Alert>
            <Card className="space-y-2 bg-surface p-4">
              <div className="text-muted">Pay to</div>
              <div className="font-medium">{info.data?.bankDetails}</div>
              <div className="text-muted">Reference (required)</div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-white px-2 py-1 text-base font-bold">{created.reference}</code>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(created.reference).then(() => toast('Reference copied'))}><Copy className="h-4 w-4" /></Button>
              </div>
            </Card>
            <Button className="w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Amount" hint={mode === 'WITHDRAWAL' ? `Up to ${formatZAR(stats.data.availableCents)} available. Paid to your verified bank account.` : 'Minimum R100'}>
              <MoneyInput cents={amount} onCents={setAmount} />
            </Field>
            {request.error && <Alert tone="red">{request.error}</Alert>}
            <Button className="w-full" loading={request.loading} disabled={!amount || amount < 10_000} onClick={async () => { const f = await request.run(); if (f && mode === 'WITHDRAWAL') close(); }}>
              {mode === 'LOAD' ? 'Get payment reference' : 'Request withdrawal'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
