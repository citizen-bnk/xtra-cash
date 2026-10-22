'use client';
import { useEffect, useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, PageHeader, Select, StatusBadge, Table, Tabs, useApi } from '@xtra/ui';

export default function LenderLoans() {
  const [status, setStatus] = useState<string>('');
  const [product, setProduct] = useState('');
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('status'); if (v && ['ACTIVE', 'IN_ARREARS', 'SETTLED', 'DEFAULTED'].includes(v)) setStatus(v); }, []);
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('product'); if (v && ['BNPL', 'PERSONAL', 'BUSINESS'].includes(v)) setProduct(v); }, []);
  const [page, setPage] = useState(1);
  const loans = useApi((c) => c.lender.loans(page, status || undefined, product || undefined), [page, status, product]);
  return (
    <div>
      <PageHeader title="Loan book" subtitle="Every advance funded from your stall." />
      <label className="mb-4 flex w-fit items-center gap-3 text-sm font-semibold">Lending stream<Select aria-label="Lending stream" value={product} onChange={e => { setProduct(e.target.value); setPage(1); }}><option value="">All lending</option><option value="BNPL">BNPL</option><option value="PERSONAL">Personal loans</option><option value="BUSINESS">Business loans</option></Select></label>
      {loans.error && <Alert tone="amber">{loans.error}</Alert>}
      <Tabs
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
        options={[
          { value: '', label: 'All' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'IN_ARREARS', label: 'In arrears' },
          { value: 'SETTLED', label: 'Settled' },
          { value: 'DEFAULTED', label: 'Defaulted' },
        ]}
      />
      {!loans.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={loans.data.items}
            empty="No loans yet"
            columns={[
              { header: 'Date', cell: (l) => new Date(l.createdAt).toLocaleDateString('en-ZA') },
              { header: 'Borrower', cell: (l) => (l.user ? `${l.user.firstName} ${l.user.lastName}` : '—') },
              { header: 'Offer', cell: (l) => l.offerName },
              { header: 'Principal', align: 'right', cell: (l) => formatZAR(l.principalCents) },
              { header: 'Repayable', align: 'right', cell: (l) => formatZAR(l.totalRepayableCents) },
              { header: 'Outstanding', align: 'right', cell: (l) => <b>{formatZAR(l.outstandingCents)}</b> },
              { header: 'Repaid to lender', align: 'right', cell: (l) => formatZAR(l.lenderRepaidCents ?? 0) },
              { header: 'Next due', cell: (l) => (l.nextDue ? new Date(l.nextDue.dueDate).toLocaleDateString('en-ZA') : '—') },
              { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
            ]}
          />
          {loans.data.total > loans.data.pageSize && (
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page * loans.data.pageSize >= loans.data.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
