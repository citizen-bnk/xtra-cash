'use client';
import { useState } from 'react';
import { Badge, Button, Loading, PageHeader, Table, useApi } from '@xtra/ui';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const audit = useApi((c) => c.admin.audit(page), [page]);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Immutable record of sensitive actions by staff, lenders and users." />
      {!audit.data ? <Loading /> : (
        <>
          <Table
            rows={audit.data.items}
            columns={[
              { header: 'When', cell: (a) => new Date(a.createdAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'medium' }) },
              { header: 'Who', cell: (a) => a.actorEmail ?? <span className="text-muted">system</span> },
              { header: 'Action', cell: (a) => <Badge>{a.action}</Badge> },
              { header: 'Entity', cell: (a) => <span className="text-xs">{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</span> },
              { header: 'Details', cell: (a) => (a.meta ? <code className="block max-w-sm truncate text-xs text-muted">{JSON.stringify(a.meta)}</code> : null) },
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
