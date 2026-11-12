'use client';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Fingerprint, MapPin, TrendingUp, WalletCards } from 'lucide-react';
import { Alert, Button, Loading, useApi, useAuth } from '@xtra/ui';

type Kind = 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'BANK_STATEMENT' | 'PROOF_OF_INCOME';
const DOCUMENTS: { type: Kind; title: string; hint: string; key: string; icon: typeof Fingerprint }[] = [
  { type: 'ID_DOCUMENT', title: 'Identity document', hint: 'ID card, green book or passport', key: 'identity', icon: Fingerprint },
  { type: 'PROOF_OF_INCOME', title: 'Proof of income', hint: 'Payslip or income evidence', key: 'income', icon: WalletCards },
  { type: 'BANK_STATEMENT', title: 'Bank statements', hint: 'For income and cash flow checks', key: 'bank', icon: TrendingUp },
  { type: 'PROOF_OF_ADDRESS', title: 'Proof of address', hint: 'Utility or official account', key: 'address', icon: MapPin },
];

export function LoanDocumentsStep({ onBack, onContinue, busy }: { onBack: () => void; onContinue: () => void; busy: boolean }) {
  const { client } = useAuth();
  const vault = useApi((c) => c.consumer.applicantVault());
  const [uploading, setUploading] = useState<Kind | null>(null), [error, setError] = useState('');
  const has = (key: string) => !!vault.data?.fastTrack.required.find((item) => item.key === key)?.supplied;
  async function upload(type: Kind, file?: File) {
    if (!file) return;
    setUploading(type); setError('');
    try { vault.setData(await client.consumer.uploadVaultDocument(type, file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not upload this document'); }
    finally { setUploading(null); }
  }
  return <div className="xc-loan-step space-y-4">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-purple"><ArrowLeft className="h-4 w-4" /> Back</button>
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Step 3 of 5</p><h3 className="mt-1 text-lg font-bold">Your documents</h3></div><Image src="/brand/ui/illustration_scorecard.png" alt="" aria-hidden width={96} height={72} className="h-16 w-24 object-contain" /></div>
    <p className="text-sm text-muted">Add documents to your profile vault for this and future applications. Uploads process in the background. You can skip and continue.</p>
    {vault.loading && !vault.data ? <Loading /> : <div className="space-y-2">{DOCUMENTS.map(({ type, title, hint, key, icon: Icon }) => <div key={type} className="flex items-center gap-3 rounded-2xl border border-[#e7d9f0] bg-white/95 p-3 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3e7f8] text-brand-purple"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-[11px] text-muted">{hint}</p></div>{has(key) ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="On file" /> : <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[#d9c6e8] px-3 text-xs font-semibold text-brand-purple">{uploading === type ? 'Uploading' : <><FileUp className="h-4 w-4" /> Add</>}<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" disabled={!!uploading} onChange={(e) => { void upload(type, e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>}</div>)}</div>}
    {error && <Alert tone="red">{error}</Alert>}
    <div className="rounded-xl bg-[#f8f1fc] px-3 py-2.5 text-xs text-muted">Files are stored in your profile data vault and available for secure assessment.</div>
    <Button className="w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" loading={busy} disabled={!!uploading} onClick={onContinue}>Continue to identity checks <ArrowRight className="h-4 w-4" /></Button>
    <Button variant="ghost" className="w-full" disabled={!!uploading || busy} onClick={onContinue}>Skip documents for now</Button>
  </div>;
}
