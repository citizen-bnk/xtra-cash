'use client';
import { useState } from 'react';
import { BadgeCheck, FileUp, Landmark } from 'lucide-react';
import { Alert, Button, Card, Loading, StatusBadge, useApi, useAuth } from '@xtra/ui';

type DocumentType = 'BANK_STATEMENT' | 'ID_DOCUMENT' | 'PROOF_OF_INCOME' | 'PROOF_OF_ADDRESS';
const documents: { type: DocumentType; key: string; label: string }[] = [
  { type: 'BANK_STATEMENT', key: 'bank', label: 'Bank statements' },
  { type: 'ID_DOCUMENT', key: 'identity', label: 'ID copy' },
  { type: 'PROOF_OF_INCOME', key: 'income', label: 'Payslip or proof of income' },
  { type: 'PROOF_OF_ADDRESS', key: 'address', label: 'Proof of address' },
];
export function ApplicantDataVault({ onReady }: { onReady?: () => void }) {
  const { client } = useAuth();
  const vault = useApi(c => c.consumer.applicantVault());
  const [uploading, setUploading] = useState<DocumentType | null>(null), [error, setError] = useState('');
  if (vault.loading && !vault.data) return <Loading />;
  if (!vault.data) return <Alert tone="red">{vault.error || 'Your documents are unavailable.'}<Button variant="secondary" onClick={vault.reload}>Try again</Button></Alert>;
  const data = vault.data;
  async function upload(type: DocumentType, file?: File) {
    if (!file) return;
    setUploading(type); setError('');
    try { const next = await client.consumer.uploadVaultDocument(type, file); vault.setData(next); if (next.eligible) onReady?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not upload your document'); }
    finally { setUploading(null); }
  }
  return <div className="space-y-4">
    <div className="rounded-[26px] bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] p-5 text-white"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Landmark className="h-6 w-6" /></span><h2 className="mt-3 text-xl font-bold text-white">Your documents</h2><p className="mt-1 text-sm text-white/85">Add your bank statements now. We use your details to check whether you may qualify for a loan.</p></div>
    {!data.eligible && <Alert tone="amber">You can submit a request after completing the loan steps. A lender may ask for more documents before approval.</Alert>}
    {error && <Alert tone="red">{error}</Alert>}
    <Card className="space-y-2 border-[#e8d9f3] p-4"><h3 className="font-bold">Bank statements</h3><p className="text-xs text-muted">Upload recent PDF or images covering about three months. We will review the dates in the files.</p>{documents.slice(0, 1).map(item => <DocumentRow key={item.type} item={item} supplied={!!data.fastTrack.required.find(r => r.key === item.key)?.supplied} busy={uploading === item.type} onUpload={upload} />)}</Card>
    <Card className="space-y-2 border-[#e8d9f3] p-4"><h3 className="font-bold">Other documents</h3><p className="text-xs text-muted">You can add these now or when a lender asks for them.</p>{documents.slice(1).map(item => <DocumentRow key={item.type} item={item} supplied={!!data.fastTrack.required.find(r => r.key === item.key)?.supplied} busy={uploading === item.type} onUpload={upload} />)}</Card>
    {!!data.documents.length && <Card className="border-[#e8d9f3] p-4"><h3 className="font-bold">Files on your profile</h3><div className="mt-2 divide-y divide-line">{data.documents.map(doc => <div key={doc.id} className="flex items-center gap-2 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{doc.originalName}</span><StatusBadge status={doc.status} /></div>)}</div></Card>}
  </div>;
}
function DocumentRow({ item, supplied, busy, onUpload }: { item: (typeof documents)[number]; supplied: boolean; busy: boolean; onUpload: (type: DocumentType, file?: File) => Promise<void> }) {
  return <div className="flex items-center gap-3 rounded-xl border border-[#eadcf1] bg-white p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f3e7f8] text-brand-purple">{supplied ? <BadgeCheck className="h-5 w-5 text-green-600" /> : <FileUp className="h-5 w-5" />}</span><span className="min-w-0 flex-1 text-sm font-semibold">{item.label}</span><label className="cursor-pointer rounded-full border border-[#d9c6e8] px-3 py-2 text-xs font-semibold text-brand-purple">{busy ? 'Uploading…' : supplied ? 'Add more' : 'Upload'}<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => { void onUpload(item.type, e.target.files?.[0]); e.currentTarget.value = ''; }} /></label></div>;
}
