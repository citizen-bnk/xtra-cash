'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Field, Input, Loading, Modal, PageHeader, StatusBadge, Table, Tabs, useAction, useApi, useAuth, useToast } from '@xtra/ui';

const TYPE: Record<string, string> = { CONSUMER_ACTIVATION: 'Shopper activated', LENDER_ACCREDITED: 'Lender accredited', LOAN_ORIGINATION: 'Credit used' };

function Affiliates() {
  const { client } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState<'commissions' | 'payouts'>(params.get('tab') === 'payouts' ? 'payouts' : 'commissions');
  const [status, setStatus] = useState('PENDING');
  const commissions = useApi((c) => c.admin.commissions(status || undefined), [status]);
  const [pStatus, setPStatus] = useState('REQUESTED');
  const payouts = useApi((c) => c.admin.payouts(pStatus || undefined), [pStatus]);
  const [paying, setPaying] = useState<string | null>(null);
  const [ref, setRef] = useState('');

  const decideC = useAction(async (id: string, approve: boolean) => {
    await client.admin.commissionDecision(id, approve);
    commissions.reload();
  });
  const approveAll = useAction(async () => {
    for (const c of commissions.data ?? []) if (c.status === 'PENDING') await client.admin.commissionDecision(c.id, true);
    toast('All pending commissions approved');
    commissions.reload();
  });
  const decideP = useAction(async (id: string, approve: boolean, reference?: string) => {
    await client.admin.payoutDecision(id, approve, reference);
    toast(approve ? 'Payout marked as paid' : 'Payout rejected, balance returned');
    setPaying(null);
    setRef('');
    payouts.reload();
  });

  return (
    <div>
      <PageHeader title="Affiliates" subtitle="Approve commissions earned by affiliates and pay out their balances." />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'commissions', label: 'Commissions' }, { value: 'payouts', label: 'Payouts' }]} />
      {tab === 'commissions' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Tabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
            {status === 'PENDING' && !!commissions.data?.length && <Button size="sm" loading={approveAll.loading} onClick={() => approveAll.run()}>Approve all</Button>}
          </div>
          {decideC.error && <Alert tone="red">{decideC.error}</Alert>}
          {!commissions.data ? <Loading /> : (
            <Table
              rows={commissions.data}
              empty="No commissions"
              columns={[
                { header: 'Date', cell: (c) => new Date(c.createdAt).toLocaleDateString('en-ZA') },
                { header: 'Affiliate', cell: (c) => c.affiliate && `${c.affiliate.firstName} ${c.affiliate.lastName}` },
                { header: 'Type', cell: (c) => TYPE[c.type] },
                { header: 'Details', cell: (c) => <span className="text-xs text-muted">{c.description}</span> },
                { header: 'Amount', align: 'right', cell: (c) => <b>{formatZAR(c.amountCents)}</b> },
                { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
                { header: '', cell: (c) => c.status === 'PENDING' && <div className="flex justify-end gap-2"><Button size="sm" onClick={() => decideC.run(c.id, true)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decideC.run(c.id, false)}>Reject</Button></div> },
              ]}
            />
          )}
        </>
      ) : (
        <>
          <Tabs value={pStatus} onChange={setPStatus} options={[{ value: 'REQUESTED', label: 'Requested' }, { value: 'PAID', label: 'Paid' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
          {decideP.error && <Alert tone="red">{decideP.error}</Alert>}
          {!payouts.data ? <Loading /> : (
            <Table
              rows={payouts.data}
              empty="No payouts"
              columns={[
                { header: 'Requested', cell: (p) => new Date(p.createdAt).toLocaleDateString('en-ZA') },
                { header: 'Affiliate', cell: (p) => p.affiliate && `${p.affiliate.firstName} ${p.affiliate.lastName}` },
                { header: 'Bank', cell: (p) => `${p.bankName} · ${p.bankAccountNumber}` },
                { header: 'Amount', align: 'right', cell: (p) => <b>{formatZAR(p.amountCents)}</b> },
                { header: 'Reference', cell: (p) => p.reference ?? '—' },
                { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
                { header: '', cell: (p) => p.status === 'REQUESTED' && <div className="flex justify-end gap-2"><Button size="sm" onClick={() => setPaying(p.id)}>Mark paid</Button><Button size="sm" variant="ghost" onClick={() => decideP.run(p.id, false)}>Reject</Button></div> },
              ]}
            />
          )}
        </>
      )}
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Confirm payout">
        <Field label="EFT payment reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FNB-20260925-001" /></Field>
        <Button className="mt-4 w-full" disabled={!ref} loading={decideP.loading} onClick={() => decideP.run(paying!, true, ref)}>Mark as paid</Button>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense><Affiliates /></Suspense>;
}
