'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { EMPLOYMENT_LABELS, formatZAR, Role } from '@xtra/shared';
import { Alert, Badge, Button, Card, cx, Loading, Modal, PageHeader, StatusBadge, Table, useAction, useApi, useAuth, useToast } from '@xtra/ui';

const ALL_ROLES = Object.values(Role);

export default function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, client } = useAuth();
  const toast = useToast();
  const user = useApi((c) => c.admin.user(id), [id]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const status = useAction(async (s: 'ACTIVE' | 'SUSPENDED') => {
    await client.admin.setUserStatus(id, s);
    toast(s === 'SUSPENDED' ? 'User suspended, sessions revoked and cards frozen' : 'User reactivated');
    user.reload();
  });
  const saveRoles = useAction(async () => {
    await client.admin.setUserRoles(id, roles);
    toast('Roles updated');
    setRolesOpen(false);
    user.reload();
  });

  if (!user.data) return user.error ? <Alert tone="red">{user.error}</Alert> : <Loading />;
  const u = user.data;
  const isSuper = me?.roles.includes('SUPER_ADMIN');
  return (
    <div className="space-y-6">
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Users</Link>
      <PageHeader
        title={`${u.firstName} ${u.lastName}`}
        subtitle={`${u.email} · ${u.phone} · joined ${new Date(u.createdAt).toLocaleDateString('en-ZA')}`}
        actions={
          <>
            <StatusBadge status={u.status} />
            {isSuper && <Button variant="secondary" onClick={() => { setRoles(u.roles); setRolesOpen(true); }}>Edit roles</Button>}
            {u.id !== me?.id &&
              (u.status === 'ACTIVE' ? (
                <Button variant="danger" loading={status.loading} onClick={() => confirm('Suspend this user? Their sessions end and cards freeze.') && status.run('SUSPENDED')}>Suspend</Button>
              ) : (
                <Button loading={status.loading} onClick={() => status.run('ACTIVE')}>Reactivate</Button>
              ))}
          </>
        }
      />
      {status.error && <Alert tone="red">{status.error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 text-sm">
          <h2 className="font-bold">Account</h2>
          <Kv k="Roles" v={<div className="flex flex-wrap justify-end gap-1">{u.roles.map((r) => <Badge key={r}>{r}</Badge>)}</div>} />
          <Kv k="Wallet" v={formatZAR(u.walletBalanceCents)} />
          <Kv k="Referral code" v={u.referralCode} />
          {u.affiliate && <Kv k="Commission balance" v={formatZAR(u.affiliate.commissionBalanceCents)} />}
          {u.lender && <Kv k="Lender stall" v={<Link className="underline" href={`/lenders/${u.lender.id}`}>{u.lender.name}</Link>} />}
        </Card>
        <Card className="space-y-2 text-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">KYC & affordability</h2>
            <StatusBadge status={u.kyc?.status ?? 'NOT_STARTED'} />
          </div>
          {u.kyc ? (
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Kv k="ID number" v={u.kyc.idNumber} />
              <Kv k="Date of birth" v={new Date(u.kyc.dateOfBirth).toLocaleDateString('en-ZA')} />
              <Kv k="Province" v={u.kyc.province} />
              <Kv k="Employment" v={EMPLOYMENT_LABELS[u.kyc.employmentStatus]} />
              <Kv k="Employer" v={u.kyc.employerName ?? '—'} />
              <Kv k="Credit score" v={u.kyc.creditScore ?? '—'} />
              <Kv k="Income / month" v={formatZAR(u.kyc.monthlyIncomeCents)} />
              <Kv k="Expenses / month" v={formatZAR(u.kyc.monthlyExpensesCents)} />
              {u.kyc.rejectionReason && <div className="sm:col-span-2"><Alert tone="red">{u.kyc.rejectionReason}</Alert></div>}
            </div>
          ) : (
            <p className="text-muted">Not submitted.</p>
          )}
        </Card>
      </div>
      <div>
        <h2 className="mb-3 font-bold">Loans</h2>
        <Table
          rows={u.loans}
          empty="No loans"
          columns={[
            { header: 'Date', cell: (l) => new Date(l.createdAt).toLocaleDateString('en-ZA') },
            { header: 'Lender', cell: (l) => l.lenderName },
            { header: 'Principal', align: 'right', cell: (l) => formatZAR(l.principalCents) },
            { header: 'Outstanding', align: 'right', cell: (l) => formatZAR(l.outstandingCents) },
            { header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
          ]}
        />
      </div>
      <div>
        <h2 className="mb-3 font-bold">Recent card transactions</h2>
        <Table
          rows={u.transactions}
          empty="No transactions"
          columns={[
            { header: 'Date', cell: (t) => new Date(t.createdAt).toLocaleString('en-ZA') },
            { header: 'Merchant', cell: (t) => t.merchantName },
            { header: 'Amount', align: 'right', cell: (t) => formatZAR(t.amountCents) },
            { header: 'Credit', align: 'right', cell: (t) => formatZAR(t.fromCreditCents) },
            { header: 'Status', cell: (t) => <div><StatusBadge status={t.status} />{t.declineReason && <div className="text-xs text-red-600">{t.declineReason}</div>}</div> },
          ]}
        />
      </div>
      <Modal open={rolesOpen} onClose={() => setRolesOpen(false)} title="Edit roles">
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((r) => (
            <button key={r} onClick={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])} className={cx('rounded-full border px-3 py-1 text-sm', roles.includes(r) ? 'border-ink bg-ink text-white' : 'border-line')}>
              {r}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Changing roles signs the user out of all sessions.</p>
        {saveRoles.error && <div className="mt-3"><Alert tone="red">{saveRoles.error}</Alert></div>}
        <Button className="mt-4 w-full" loading={saveRoles.loading} disabled={!roles.length} onClick={() => saveRoles.run()}>Save roles</Button>
      </Modal>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>;
}
