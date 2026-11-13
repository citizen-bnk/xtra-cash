'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Landmark } from 'lucide-react';
import { Alert, Button, Loading, useApi, useAuth } from '@xtra/ui';

export function LoanDocumentsStep({ onBack, onContinue, busy }: { onBack: () => void; onContinue: () => void; busy: boolean }) {
  const { client } = useAuth();
  const vault = useApi(c => c.consumer.applicantVault());
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const supplied = !!vault.data?.fastTrack.required.find(item => item.key === 'bank')?.supplied;
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true); setError('');
    try { vault.setData(await client.consumer.uploadVaultDocument('BANK_STATEMENT', file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not upload your bank statement'); }
    finally { setUploading(false); }
  }
  return <div className="xc-loan-step space-y-5">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-purple"><ArrowLeft className="h-4 w-4" /> Back</button>
    <div><p className="text-xs font-bold uppercase tracking-[.15em] text-brand-purple">Step 3 of 4</p><h3 className="mt-1 text-xl font-bold">Add your bank statements</h3><p className="mt-1 text-sm text-muted">We use them to check if you may qualify for a loan.</p></div>
    <div className="rounded-2xl border border-[#e7d9f0] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f3e7f8] text-brand-purple"><Landmark className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="font-semibold">Recent bank statements</p><p className="mt-1 text-xs text-muted">Upload PDF or images covering about three months. You can add more than one file.</p></div>{supplied && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="On file" />}</div>{vault.loading && !vault.data ? <Loading /> : <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] px-5 py-2 text-sm font-bold text-white"><FileUp className="h-4 w-4" />{uploading ? 'Uploading…' : supplied ? 'Add another statement' : 'Upload statements'}<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>}</div>
    <p className="text-xs text-muted">Your files are saved to your profile. We may request an ID copy, payslip or proof of address later if your loan is approved.</p>
    {error && <Alert tone="red">{error}</Alert>}
    <Button className="w-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white" disabled={!supplied || uploading || busy} onClick={onContinue}>Continue <ArrowRight className="h-4 w-4" /></Button>
  </div>;
}
