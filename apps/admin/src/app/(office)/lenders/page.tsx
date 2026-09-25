'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatZAR } from '@xtra/shared';
import { Badge, Loading, PageHeader, StatusBadge, Table, Tabs, useApi } from '@xtra/ui';

export default function LendersPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const lenders = useApi((c) => c.admin.lenders(status || undefined), [status]);
  return (
    <div>
      <PageHeader title="Credit Mall lenders" subtitle="Accreditation, liquidity and compliance for every lending stall." />
      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: '', label: 'All' },
          { value: 'SUBMITTED', label: 'Submitted' },
          { value: 'UNDER_REVIEW', label: 'Under review' },
          { value: 'ACCREDITED', label: 'Accredited' },
          { value: 'DRAFT', label: 'Draft' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'SUSPENDED', label: 'Suspended' },
        ]}
      />
      {!lenders.data ? (
        <Loading />
      ) : (
        <Table
          rows={lenders.data}
          onRowClick={(l) => router.push(`/lenders/${l.id}`)}
          empty="No lenders"
          columns={[
            { header: 'Lender', cell: (l) => <div><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.owner.firstName} {l.owner.lastName} · {l.contactEmail}</div></div> },
            { header: 'NCR no.', cell: (l) => l.ncrNumber ?? <span className="text-muted">—</span> },
            { header: 'Route', cell: (l) => (l.assistedAccreditation ? <Badge tone={l.accreditationFeePaid ? 'green' : 'amber'}>Assisted · {l.accreditationFeePaid ? 'fee paid' : 'fee due'}</Badge> : <Badge>Standard</Badge>) },
            { header: 'Available', align: 'right', cell: (l) => formatZAR(l.availableCents) },
            { header: 'Status', cell: (l) => <StatusBadge status={l.accreditationStatus} /> },
          ]}
        />
      )}
    </div>
  );
}
