'use client';
import Link from 'next/link';
import { useState } from 'react';
import { EMPLOYMENT_LABELS, formatZAR } from '@xtra/shared';
import { Alert, Button, Field, Loading, Modal, PageHeader, RecordActions, Table, Tabs, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function KycPage() {
  const { client } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');
  const queue = useApi((c) => c.admin.kycQueue(status), [status]);
  const [decision, setDecision] = useState<{ userId: string; approve: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const decide = useAction(async (userId: string, approve: boolean, why?: string) => {
    await client.admin.kycDecision(userId, approve, why);
    toast(approve ? 'Approved — virtual card issued' : 'Rejected');
    setDecision(null);
    setReason('');
    queue.reload();
  });
  return (
    <div>
      <PageHeader title="KYC review" subtitle="Submissions that failed automated checks or need a human decision." />
      <Tabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'VERIFIED', label: 'Verified' }, { value: 'REJECTED', label: 'Rejected' }]} />
      {decide.error && <div className="mb-3"><Alert tone="red">{decide.error}</Alert></div>}
      {!queue.data ? (
        <Loading />
      ) : (
        <Table
          rows={queue.data}
          empty={status === 'PENDING' ? 'Queue is clear 🎉' : 'None'}
          columns={[
            { header: 'Person', cell: (k) => <Link className="font-medium underline" href={`/users/${k.userId}`}>{k.user.firstName} {k.user.lastName}</Link> },
            { header: 'ID number', cell: (k) => <code className="text-xs">{k.idNumber}</code> },
            { header: 'Province', cell: (k) => k.province },
            { header: 'Employment', cell: (k) => EMPLOYMENT_LABELS[k.employmentStatus] },
            { header: 'Income', align: 'right', cell: (k) => formatZAR(k.monthlyIncomeCents) },
            { header: 'Expenses', align: 'right', cell: (k) => formatZAR(k.monthlyExpensesCents) },
            { header: 'Score', align: 'right', cell: (k) => k.creditScore ?? '—' },
            { header: '', cell: (k) => <RecordActions label={`Actions for ${k.user.firstName} ${k.user.lastName}`} actions={[
              { label: 'View applicant', href: `/users/${k.userId}` },
              ...(status === 'PENDING' ? [
                { label: 'Approve verification', onSelect: () => setDecision({ userId: k.userId, approve: true }) },
                { label: 'Reject with reason', onSelect: () => { setReason(''); setDecision({ userId: k.userId, approve: false }); } },
              ] : []),
            ]} /> },
          ]}
        />
      )}
      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.approve ? 'Approve verification?' : 'Reject KYC'}>
        {decision?.approve ? <Alert tone="blue">Confirm the identity review is complete. Approval may issue the user’s virtual card.</Alert> : <Field label="Reason (shown to the user)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the discrepancy and what the applicant should do." /></Field>}
        {decide.error && <Alert tone="red">{decide.error}</Alert>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.approve ? 'primary' : 'danger'} disabled={!decision?.approve && reason.trim().length < 3} loading={decide.loading} onClick={() => decision && decide.run(decision.userId, decision.approve, decision.approve ? undefined : reason.trim())}>{decision?.approve ? 'Approve verification' : 'Reject with reason'}</Button></div>
      </Modal>
    </div>
  );
}
