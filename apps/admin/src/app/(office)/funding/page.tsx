'use client';
import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, Modal, PageHeader, RecordActions, StatusBadge, Table, Tabs, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function FundingPage() {
  const { client } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const [decision, setDecision] = useState<{ id: string; type: string; amountCents: number; reference: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const funding = useApi((c) => c.admin.funding(status || undefined), [status]);
  const decide = useAction(async (id: string, approve: boolean, reason: string) => {
    await client.admin.fundingDecision(id, approve, reason);
    toast(approve ? 'Funding confirmed' : 'Funding rejected');
    setDecision(null);
    setNote('');
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
            { header: '', cell: (f) => f.status === 'PENDING' ? <RecordActions label={`Actions for ${f.reference}`} actions={[
              { label: f.type === 'LOAD' ? 'Confirm funds received' : 'Confirm withdrawal paid', onSelect: () => { setDecision({ id: f.id, type: f.type, amountCents: f.amountCents, reference: f.reference, approve: true }); setNote(''); } },
              { label: 'Reject request', onSelect: () => { setDecision({ id: f.id, type: f.type, amountCents: f.amountCents, reference: f.reference, approve: false }); setNote(''); } },
            ]} /> : null },
          ]}
        />
      )}
      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.approve ? (decision?.type === 'LOAD' ? 'Confirm funds received' : 'Confirm withdrawal paid') : 'Reject funding request'} footer={<><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.approve ? 'primary' : 'danger'} loading={decide.loading} disabled={note.trim().length < 3} onClick={() => decision && decide.run(decision.id, decision.approve, note.trim())}>{decision?.approve ? 'Confirm and record' : 'Reject and record'}</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-muted">Reference <code>{decision?.reference}</code> · {decision && formatZAR(decision.amountCents)}. Add a note explaining the verification or rejection.</p>
          <label className="block text-sm font-medium">Admin note<Textarea aria-label="Admin note" className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={500} required placeholder="For example: matched the incoming bank statement entry." /></label>
          {decide.error && <Alert tone="red">{decide.error}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
