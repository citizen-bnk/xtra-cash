'use client';
import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { Button, Loading, PageHeader, StatusBadge, Table, useApi } from '@xtra/ui';

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const tx = useApi((c) => c.consumer.transactions(page), [page]);
  if (tx.loading && !tx.data) return <Loading />;
  const d = tx.data!;
  return (
    <div>
      <PageHeader title="Activity" subtitle="Every card payment and how it was funded." />
      <Table
        rows={d.items}
        empty="No payments yet"
        columns={[
          { header: 'Date', cell: (t) => new Date(t.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) },
          { header: 'Merchant', cell: (t) => <div><div className="font-medium">{t.merchantName}</div><div className="text-xs text-muted">{t.channel.replace('_', ' ').toLowerCase()}</div></div> },
          { header: 'Amount', align: 'right', cell: (t) => <span className="font-semibold">{formatZAR(t.amountCents)}</span> },
          { header: 'Wallet', align: 'right', cell: (t) => formatZAR(t.fromWalletCents) },
          { header: 'XTRA-CASH', align: 'right', cell: (t) => formatZAR(t.fromCreditCents) },
          { header: 'Status', cell: (t) => <div><StatusBadge status={t.status} />{t.declineReason && <div className="mt-0.5 text-xs text-red-600">{t.declineReason}</div>}</div> },
        ]}
      />
      {d.total > d.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>Page {d.page} of {Math.ceil(d.total / d.pageSize)}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page * d.pageSize >= d.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
