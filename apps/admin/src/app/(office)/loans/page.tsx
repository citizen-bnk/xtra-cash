'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Button, Loading, PageHeader, StatusBadge, Table, Tabs, useApi } from '@xtra/ui';

export default function LoansPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const loans = useApi((c) => c.admin.loans({ status, page }), [status, page]);
  return (
    <div>
      <PageHeader title="Loan book" subtitle="All XTRA-CASH advances across lenders." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'IN_ARREARS', label: 'In arrears' }, { value: 'DEFAULTED', label: 'Defaulted' }, { value: 'SETTLED', label: 'Settled' }]} />
      {!loans.data ? <Loading /> : (
        <>
          <Table
            rows={loans.data.items}
            empty="No loans"
            columns={[
              { header: 'Date', cell: (l) => new Date(l.createdAt).toLocaleDateString('en-ZA') },
              { header: 'Borrower', cell: (l) => l.user && <Link className="underline" href={`/users/${l.user.id}`}>{l.user.firstName} {l.user.lastName}</Link> },
              { header: 'Lender', cell: (l) => <Link className="underline" href={`/lenders/${l.lenderId}`}>{l.lenderName}</Link> },
              { header: 'Principal', align: 'right', cell: (l) => formatZAR(l.principalCents) },
              { header: 'Repayable', align: 'right', cell: (l) => formatZAR(l.totalRepayableCents) },
              { header: 'Outstanding', align: 'right', cell: (l) => <b>{formatZAR(l.outstandingCents)}</b> },
              { header: 'Next due', cell: (l) => (l.nextDue ? new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA') : '—') },
              { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
            ]}
          />
          <Pager page={page} setPage={setPage} total={loans.data.total} size={loans.data.pageSize} />
        </>
      )}
    </div>
  );
}

function Pager({ page, setPage, total, size }: { page: number; setPage: (n: number) => void; total: number; size: number }) {
  if (total <= size) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>{total} total · page {page} of {Math.ceil(total / size)}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={page * size >= total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
