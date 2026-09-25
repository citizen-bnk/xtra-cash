'use client';
import { useRouter } from 'next/navigation';
import { formatZAR } from '@xtra/shared';
import { Loading, PageHeader, StatusBadge, Table, useApi } from '@xtra/ui';

export default function LoansPage() {
  const router = useRouter();
  const loans = useApi((c) => c.consumer.loans());
  if (loans.loading && !loans.data) return <Loading />;
  const open = (loans.data ?? []).filter((l) => l.status !== 'SETTLED');
  const owed = open.reduce((s, l) => s + l.outstandingCents, 0);
  return (
    <div>
      <PageHeader title="Repayments" subtitle={`You owe ${formatZAR(owed)} across ${open.length} active XTRA-CASH advance${open.length === 1 ? '' : 's'}.`} />
      <Table
        rows={loans.data ?? []}
        onRowClick={(l) => router.push(`/app/loans/${l.id}`)}
        empty="You haven't used XTRA-CASH credit yet"
        columns={[
          { header: 'Lender', cell: (l) => <div><div className="font-medium">{l.lenderName}</div><div className="text-xs text-muted">{l.offerName}</div></div> },
          { header: 'Taken', cell: (l) => new Date(l.createdAt).toLocaleDateString('en-ZA') },
          { header: 'Borrowed', align: 'right', cell: (l) => formatZAR(l.principalCents) },
          { header: 'Next due', cell: (l) => (l.nextDue ? `${formatZAR(l.nextDue.amountCents - l.nextDue.paidCents)} · ${new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA')}` : '—') },
          { header: 'Outstanding', align: 'right', cell: (l) => <span className="font-semibold">{formatZAR(l.outstandingCents)}</span> },
          { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
        ]}
      />
    </div>
  );
}
