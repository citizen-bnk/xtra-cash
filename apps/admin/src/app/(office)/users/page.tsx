'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Badge, Button, Input, Loading, PageHeader, Select, StatusBadge, Table, useApi } from '@xtra/ui';

export default function UsersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const users = useApi((c) => c.admin.users({ q: term, role, page }), [term, role, page]);
  return (
    <div>
      <PageHeader title="Users" subtitle="Shoppers, lenders, affiliates and staff." />
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q);
          setPage(1);
        }}
      >
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {['CONSUMER', 'LENDER', 'AFFILIATE', 'ADMIN', 'SUPER_ADMIN'].map((r) => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase()}</option>)}
        </Select>
        <Button variant="secondary">Search</Button>
      </form>
      {!users.data ? (
        <Loading />
      ) : (
        <>
          <Table
            rows={users.data.items}
            onRowClick={(u) => router.push(`/users/${u.id}`)}
            empty="No users match"
            columns={[
              { header: 'Name', cell: (u) => <div><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs text-muted">{u.email}</div></div> },
              { header: 'Phone', cell: (u) => u.phone },
              { header: 'Roles', cell: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r.includes('ADMIN') ? 'blue' : 'gray'}>{r.replace('_', ' ').toLowerCase()}</Badge>)}</div> },
              { header: 'KYC', cell: (u) => <StatusBadge status={u.kycStatus} /> },
              { header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
              { header: 'Joined', cell: (u) => new Date(u.createdAt).toLocaleDateString('en-ZA') },
            ]}
          />
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{users.data.total} users</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page * users.data.pageSize >= users.data.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
