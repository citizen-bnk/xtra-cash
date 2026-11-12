'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Field, Input, Loading, Modal, PageHeader, RecordActions, StatusBadge, Table, Tabs, useAction, useApi, useAuth, useToast } from '@xtra/ui';

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
  const [commissionAction, setCommissionAction] = useState<{ id: string; approve: boolean; amountCents: number; name: string } | null>(null);
  const [rejectingPayout, setRejectingPayout] = useState<{ id: string; amountCents: number; name: string } | null>(null);
  const [ref, setRef] = useState('');

  const decideC = useAction(async (id: string, approve: boolean) => {
    await client.admin.commissionDecision(id, approve);
    setCommissionAction(null);
    toast(approve ? 'Commission approved' : 'Commission rejected');
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
    setRejectingPayout(null);
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
                { header: 'Details', className: 'min-w-56 whitespace-normal', cell: (c) => <span className="text-xs text-muted">{c.description}</span> },
                { header: 'Amount', align: 'right', cell: (c) => <b>{formatZAR(c.amountCents)}</b> },
                { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
                { header: '', cell: (c) => c.status === 'PENDING' && <RecordActions label={`Actions for ${c.affiliate?.firstName ?? 'affiliate'} commission`} actions={[{ label: 'Approve commission', onSelect: () => setCommissionAction({ id: c.id, approve: true, amountCents: c.amountCents, name: `${c.affiliate?.firstName ?? ''} ${c.affiliate?.lastName ?? ''}`.trim() }) }, { label: 'Reject commission', onSelect: () => setCommissionAction({ id: c.id, approve: false, amountCents: c.amountCents, name: `${c.affiliate?.firstName ?? ''} ${c.affiliate?.lastName ?? ''}`.trim() }) }]} /> },
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
                { header: '', cell: (p) => p.status === 'REQUESTED' && <RecordActions label={`Actions for ${p.affiliate?.firstName ?? 'affiliate'} payout`} actions={[{ label: 'Record EFT payment', onSelect: () => { setRef(''); setPaying(p.id); } }, { label: 'Reject and return balance', onSelect: () => setRejectingPayout({ id: p.id, amountCents: p.amountCents, name: `${p.affiliate?.firstName ?? ''} ${p.affiliate?.lastName ?? ''}`.trim() }) }]} /> },
              ]}
            />
          )}
        </>
      )}
      <Modal open={!!commissionAction} onClose={() => setCommissionAction(null)} title={commissionAction?.approve ? 'Approve commission?' : 'Reject commission?'}>
        <p className="text-sm">{commissionAction?.name || 'This affiliate'} · {commissionAction && formatZAR(commissionAction.amountCents)}</p>
        <Alert tone={commissionAction?.approve ? 'blue' : 'amber'}>{commissionAction?.approve ? 'This releases the pending commission into the affiliate balance.' : 'This rejects the recorded commission entry and will appear in the audit history.'}</Alert>
        {decideC.error && <Alert tone="red">{decideC.error}</Alert>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCommissionAction(null)}>Cancel</Button><Button variant={commissionAction?.approve ? 'primary' : 'danger'} loading={decideC.loading} onClick={() => commissionAction && decideC.run(commissionAction.id, commissionAction.approve)}>{commissionAction?.approve ? 'Approve commission' : 'Reject commission'}</Button></div>
      </Modal>
      <Modal open={!!rejectingPayout} onClose={() => setRejectingPayout(null)} title="Reject payout request?">
        <p className="text-sm">{rejectingPayout?.name || 'This affiliate'} · {rejectingPayout && formatZAR(rejectingPayout.amountCents)}</p>
        <Alert tone="amber">The payout request will be rejected and the amount returned to the affiliate’s available balance.</Alert>
        {decideP.error && <Alert tone="red">{decideP.error}</Alert>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRejectingPayout(null)}>Cancel</Button><Button variant="danger" loading={decideP.loading} onClick={() => rejectingPayout && decideP.run(rejectingPayout.id, false)}>Reject request</Button></div>
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Confirm payout">
        <Field label="EFT payment reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FNB-20260925-001" /></Field>
        {decideP.error && <Alert tone="red">{decideP.error}</Alert>}
        <Button className="mt-4 w-full" disabled={!ref} loading={decideP.loading} onClick={() => decideP.run(paying!, true, ref)}>Mark as paid</Button>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <Suspense><Affiliates /></Suspense>;
}
