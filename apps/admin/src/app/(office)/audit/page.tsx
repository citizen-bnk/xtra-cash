'use client';
import { useState } from 'react';
import { Badge, Button, Loading, PageHeader, Table, useApi } from '@xtra/ui';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const audit = useApi((c) => c.admin.audit(page), [page]);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Account activity, assistant tools and confirmed record changes." />
      {!audit.data ? <Loading /> : (
        <>
          <Table
            rows={audit.data.items}
            columns={[
              { header: 'When', cell: (a) => new Date(a.createdAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'medium' }) },
              { header: 'Who', cell: (a) => a.actorEmail ?? <span className="text-muted">{a.actorId ?? 'system'}</span> },
              { header: 'Action', cell: (a) => <Badge>{a.action}</Badge> },
              { header: 'Entity', cell: (a) => <span className="text-xs">{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</span> },
              { header: 'Details', cell: (a) => (a.meta ? <details className="max-w-sm"><summary className="cursor-pointer text-xs text-brand-purple">View activity details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted">{JSON.stringify(a.meta, null, 2)}</pre></details> : null) },
            ]}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
            <Button size="sm" variant="secondary" disabled={page * audit.data.pageSize >= audit.data.total} onClick={() => setPage(page + 1)}>Older</Button>
          </div>
        </>
      )}
    </div>
  );
}
