'use client';
import { formatZAR } from '@xtra/shared';
import { Alert, Loading, PageHeader, Stat, Table, useApi } from '@xtra/ui';
type Report = { revenueCents: number; trialBalanceCents: number; balanced: boolean; entries: { id: string; amountCents: number; type: string; reference: string; memo: string | null; createdAt: string }[] };
export default function RevenueReport() {
  const report = useApi(c => c.request<Report>('GET', '/admin/reports/revenue'));
  if (report.error) return <Alert tone="red">{report.error}</Alert>;
  if (!report.data) return <Loading />;
  const r = report.data;
  return <div className="space-y-6"><PageHeader title="Platform revenue & ledger" subtitle="All-time revenue balance and the latest 100 revenue ledger entries." /><div className="grid gap-3 sm:grid-cols-2"><Stat href="#revenue-entries" label="Platform revenue" value={formatZAR(r.revenueCents)} sub="Repayment share + accreditation fees" /><Stat href="#revenue-entries" label="Ledger trial balance" value={formatZAR(r.trialBalanceCents)} sub={r.balanced ? 'Balanced' : 'Requires reconciliation'} /></div>{!r.balanced && <Alert tone="red">The trial balance is not zero. Reconcile the ledger before processing financial activity.</Alert>}<h2 id="revenue-entries" className="scroll-mt-6 font-bold">Revenue entries</h2><Table rows={r.entries} empty="No platform revenue recorded yet" columns={[{ header: 'Date', cell: e => new Date(e.createdAt).toLocaleString('en-ZA') }, { header: 'Type', cell: e => e.type.replace(/_/g, ' ') }, { header: 'Reference', cell: e => <code className="text-xs">{e.reference}</code> }, { header: 'Memo', cell: e => e.memo ?? '—' }, { header: 'Revenue', align: 'right', cell: e => formatZAR(e.amountCents) }]} /></div>;
}
