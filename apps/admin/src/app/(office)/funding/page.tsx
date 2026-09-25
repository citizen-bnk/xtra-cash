'use client';
import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, PageHeader, StatusBadge, Table, Tabs, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function FundingPage() {
  const { client } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const funding = useApi((c) => c.admin.funding(status || undefined), [status]);
  const decide = useAction(async (id: string, approve: boolean) => {
    await client.admin.fundingDecision(id, approve);
    toast(approve ? 'Confirmed' : 'Rejected');
    funding.reload();
  });
  return (
    <div>
      <PageHeader title="Lender funding" subtitle="Confirm lender EFT loads once received in the platform account, and mark withdrawals as paid." />
      <Tabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
      {decide.error && <div className="mb-3"><Alert tone="red">{decide.error}</Alert></div>}
      {!funding.data ? (
        <Loading />
      ) : (
        <Table
          rows={funding.data}
          empty="Nothing to confirm"
          columns={[
            { header: 'Requested', cell: (f) => new Date(f.createdAt).toLocaleString('en-ZA') },
            { header: 'Lender', cell: (f) => f.lender?.name },
            { header: 'Type', cell: (f) => (f.type === 'LOAD' ? 'EFT load' : 'Withdrawal') },
            { header: 'Reference', cell: (f) => <code className="text-xs">{f.reference}</code> },
            { header: 'Amount', align: 'right', cell: (f) => <b>{formatZAR(f.amountCents)}</b> },
            { header: 'Status', cell: (f) => <StatusBadge status={f.status} /> },
            {
              header: '',
              cell: (f) =>
                f.status === 'PENDING' && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => decide.run(f.id, true)}>{f.type === 'LOAD' ? 'Funds received' : 'Mark paid'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => decide.run(f.id, false)}>Reject</Button>
                  </div>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
