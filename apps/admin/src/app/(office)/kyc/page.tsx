'use client';
import Link from 'next/link';
import { useState } from 'react';
import { EMPLOYMENT_LABELS, formatZAR } from '@xtra/shared';
import { Alert, Button, Field, Loading, Modal, PageHeader, Table, Tabs, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function KycPage() {
  const { client } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');
  const queue = useApi((c) => c.admin.kycQueue(status), [status]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const decide = useAction(async (userId: string, approve: boolean, why?: string) => {
    await client.admin.kycDecision(userId, approve, why);
    toast(approve ? 'Approved — virtual card issued' : 'Rejected');
    setRejecting(null);
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
            {
              header: '',
              cell: (k) =>
                status === 'PENDING' ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => decide.run(k.userId, true)}>Approve</Button>
                    <Button size="sm" variant="secondary" onClick={() => setRejecting(k.userId)}>Reject</Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted">{k.rejectionReason}</span>
                ),
            },
          ]}
        />
      )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject KYC">
        <Field label="Reason (shown to the user)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ID number does not match Home Affairs records" />
        </Field>
        <Button className="mt-4 w-full" variant="danger" disabled={!reason} loading={decide.loading} onClick={() => decide.run(rejecting!, false, reason)}>Reject</Button>
      </Modal>
    </div>
  );
}
