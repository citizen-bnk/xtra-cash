'use client';
import { useState } from 'react';
import { BadgeCheck, CircleEllipsis, FileUp, Fingerprint, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import type { ApplicantVaultStatus } from '@xtra/shared';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, Loading, StatusBadge, useApi, useAuth } from '@xtra/ui';

type EvidenceType = 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'BANK_STATEMENT' | 'PROOF_OF_INCOME';
const evidence: { type: EvidenceType; label: string; detail: string; period: boolean }[] = [
  { type: 'ID_DOCUMENT', label: 'Identity document', detail: 'ID card, green book or passport', period: false },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of address', detail: 'Recent utility, municipal or official account', period: false },
  { type: 'BANK_STATEMENT', label: '3 months of bank statements', detail: 'One PDF or clear images covering at least 80 days', period: true },
  { type: 'PROOF_OF_INCOME', label: 'Proof of income', detail: 'Payslip, financials or accountant letter', period: false },
];

export function ApplicantDataVault({ onReady }: { onReady?: () => void }) {
  const { client } = useAuth();
  const vault = useApi((c) => c.consumer.applicantVault());
  const [uploading, setUploading] = useState<EvidenceType | null>(null);
  const [error, setError] = useState('');
  if (vault.loading && !vault.data) return <Loading />;
  if (!vault.data) return <Alert tone="red">{vault.error || 'Your data vault is unavailable.'}<Button variant="secondary" onClick={vault.reload}>Try again</Button></Alert>;
  const data = vault.data;
  const upload = async (type: EvidenceType, file: File | undefined, from?: string, to?: string) => {
    if (!file) return;
    setUploading(type); setError('');
    try {
      const next = await client.consumer.uploadVaultDocument(type, file, from, to);
      vault.setData(next);
      if (next.eligible) onReady?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload this evidence'); }
    finally { setUploading(null); }
  };
  return <div className="space-y-4">
    <EligibilityBanner data={data} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Pillar icon={Fingerprint} name="1. Identity" status={data.pillars.id.status} confidence={data.pillars.id.confidenceBps} />
      <Pillar icon={TrendingUp} name="2. Risk" status={data.pillars.risk.status} confidence={data.pillars.risk.confidenceBps} value={data.pillars.risk.score == null ? undefined : `${data.pillars.risk.score}`} />
      <Pillar icon={WalletCards} name="3. Income" status={data.pillars.income.status} confidence={data.pillars.income.confidenceBps} value={data.pillars.income.trueDisposableIncomeCents == null ? undefined : formatZAR(data.pillars.income.trueDisposableIncomeCents)} />
      <Pillar icon={ShieldCheck} name="4. Fraud" status={data.pillars.fraud.status} confidence={data.pillars.fraud.homeBase.confidenceBps} />
    </div>
    {error ? <Alert tone="red">{error}</Alert> : null}
    <Card>
      <h2 className="font-bold">Fast-track checklist</h2>
      <p className="mt-1 text-sm text-muted">Add evidence now instead of waiting for the probation period to end. Uploading evidence makes you eligible to submit; lender approval still depends on verification and affordability.</p>
      <div className="mt-4 space-y-3">
        {evidence.map((item) => <EvidenceUpload key={item.type} item={item} status={data.fastTrack.required.find((r) => r.key === ({ ID_DOCUMENT: 'identity', PROOF_OF_ADDRESS: 'address', BANK_STATEMENT: 'bank', PROOF_OF_INCOME: 'income' } as const)[item.type])} busy={uploading === item.type} onUpload={upload} />)}
      </div>
    </Card>
    <Card>
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold">Optional location consistency</h2><p className="mt-1 text-sm text-muted">With your permission, the installed app can contribute at most one encrypted location sample per day. Lenders see only the aggregate consistency result, never your coordinates.</p></div><StatusBadge status={data.locationMonitoring.enabled ? 'ENABLED' : 'OFF'} /></div>
      <Button className="mt-4" variant="secondary" onClick={async () => { setError(''); try { vault.setData(await client.consumer.setVaultLocationConsent(!data.locationMonitoring.enabled)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update permission'); } }}>{data.locationMonitoring.enabled ? 'Stop location monitoring' : 'Enable location monitoring'}</Button>
    </Card>
  </div>;
}

function EligibilityBanner({ data }: { data: ApplicantVaultStatus }) {
  if (data.eligible) return <Alert tone="green" title="Eligible to submit a loan request">{data.eligibilityBasis === 'FAST_TRACK_EVIDENCE' ? 'Your evidence checklist is complete. Processing can continue while lenders assess your request.' : 'Your probation period is complete.'}</Alert>;
  return <Alert tone="amber" title={`${data.probation.daysRemaining} day${data.probation.daysRemaining === 1 ? '' : 's'} remaining`}>Complete all four evidence items below to fast-track your eligibility now.</Alert>;
}

function Pillar({ icon: Icon, name, status, confidence, value }: { icon: typeof Fingerprint; name: string; status: string; confidence: number; value?: string }) {
  return <Card className="min-w-0"><div className="flex items-center justify-between gap-2"><Icon className="h-5 w-5 text-brand" /><StatusBadge status={status} /></div><h2 className="mt-3 font-bold">{name}</h2>{value ? <p className="mt-1 text-lg font-black">{value}</p> : null}<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, confidence / 100)}%` }} /></div><p className="mt-1 text-xs text-muted">{Math.round(confidence / 100)}% confidence</p></Card>;
}

function EvidenceUpload({ item, status, busy, onUpload }: { item: (typeof evidence)[number]; status?: ApplicantVaultStatus['fastTrack']['required'][number]; busy: boolean; onUpload: (type: EvidenceType, file: File | undefined, from?: string, to?: string) => Promise<void> }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const supplied = !!status?.supplied;
  return <div className="rounded-2xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{supplied ? <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <CircleEllipsis className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}<div><div className="font-semibold">{item.label}</div><div className="text-xs text-muted">{item.detail}</div></div></div><StatusBadge status={status?.status ?? 'MISSING'} /></div>{item.period ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Statement period starts"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Statement period ends"><Input type="date" value={to} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTo(e.target.value)} /></Field></div> : null}<label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-surface"><FileUp className="h-4 w-4" />{busy ? 'Uploading…' : supplied ? 'Replace evidence' : 'Choose document'}<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || (item.period && (!from || !to))} onChange={(e) => { void onUpload(item.type, e.target.files?.[0], from || undefined, to || undefined); e.currentTarget.value = ''; }} /></label>{item.period && (!from || !to) ? <p className="mt-2 text-xs text-muted">Choose the statement period before selecting the file.</p> : null}</div>;
}
