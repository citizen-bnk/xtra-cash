'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Button, Loading, PageHeader, StatusBadge, Table, Tabs, useApi } from '@xtra/ui';

export default function TransactionsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const tx = useApi((c) => c.admin.transactions({ status, page }), [status, page]);
  return (
    <div>
      <PageHeader title="Card transactions" subtitle="Point-of-payment authorisations: in-store, online and marketplace." />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All' }, { value: 'APPROVED', label: 'Approved' }, { value: 'DECLINED', label: 'Declined' }]} />
      {!tx.data ? <Loading /> : (
        <>
          <Table
            rows={tx.data.items}
            empty="No transactions"
            columns={[
              { header: 'Time', cell: (t) => new Date(t.createdAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) },
              { header: 'Shopper', cell: (t) => t.user && <Link className="underline" href={`/users/${t.user.id}`}>{t.user.firstName} {t.user.lastName}</Link> },
              { header: 'Merchant', cell: (t) => <div><div>{t.merchantName}</div><div className="text-xs text-muted">{t.channel.replace('_', ' ').toLowerCase()}{t.merchantCategory ? ` · ${t.merchantCategory}` : ''}</div></div> },
              { header: 'Amount', align: 'right', cell: (t) => <b>{formatZAR(t.amountCents)}</b> },
              { header: 'Wallet', align: 'right', cell: (t) => formatZAR(t.fromWalletCents) },
              { header: 'Credit', align: 'right', cell: (t) => formatZAR(t.fromCreditCents) },
              { header: 'Result', cell: (t) => <div><StatusBadge status={t.status} />{t.declineReason && <div className="mt-0.5 text-xs text-red-600">{t.declineReason}</div>}</div> },
            ]}
          />
          {tx.data.total > tx.data.pageSize && (
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page * tx.data.pageSize >= tx.data.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
