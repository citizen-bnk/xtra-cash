'use client';
import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Loading, Modal, PageHeader, RecordActions, StatusBadge, Tabs, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

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
      ) : funding.data.length ? <Card className="space-y-0 p-0">
        {funding.data.map((f) => <div key={f.id} className="flex min-w-0 items-center gap-2 border-b border-line px-3 py-3 last:border-0 sm:gap-4 sm:px-4">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{f.lender?.name ?? 'Lender'}</p><p className="truncate text-xs text-muted">{f.type === 'LOAD' ? 'EFT load' : 'Withdrawal'} · {new Date(f.createdAt).toLocaleDateString('en-ZA')} · {f.reference}</p></div>
          <div className="shrink-0 text-right"><p className="text-sm font-bold tabular-nums">{formatZAR(f.amountCents)}</p><span className="sm:hidden"><StatusBadge status={f.status} /></span></div>
          <span className="hidden sm:inline-flex"><StatusBadge status={f.status} /></span>
          {f.status === 'PENDING' ? <RecordActions label={`Actions for ${f.reference}`} actions={[
            { label: f.type === 'LOAD' ? 'Confirm funds received' : 'Confirm withdrawal paid', onSelect: () => { setDecision({ id: f.id, type: f.type, amountCents: f.amountCents, reference: f.reference, approve: true }); setNote(''); } },
            { label: 'Reject request', onSelect: () => { setDecision({ id: f.id, type: f.type, amountCents: f.amountCents, reference: f.reference, approve: false }); setNote(''); } },
          ]} /> : <span className="h-9 w-9" />}
        </div>)}
      </Card> : <Card className="py-10 text-center text-sm text-muted">Nothing to confirm</Card>}
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
