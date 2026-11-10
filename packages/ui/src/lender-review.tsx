'use client';
import { useState } from 'react';
import { Alert, Button, Card, Field, Select, Textarea } from './components';
import { useApi, useAuth } from './api';

type ReviewPack = {
  pillars: Record<string, { status: string; confidenceBps?: number; score?: number | null }>;
  documents: { id: string; type: string; name: string; status: string; processingNote: string | null; createdAt: string; reviews: { status: string; comment: string; createdAt: string }[] }[];
};
const pillarNames: Record<string, string> = { id: 'ID · Identity', risk: 'RISK · Creditworthiness', income: 'INCOME · Affordability', fraud: 'FRAUD · Compliance screening' };

export function LenderReviewWorkspace({ applicationId }: { applicationId: string }) {
  const { client } = useAuth();
  const pack = useApi(c => c.request<ReviewPack>('GET', `/personal-loans/applications/${applicationId}/lender-review-pack`), [applicationId]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [docStatus, setDocStatus] = useState<Record<string, string>>({});
  const reload = () => pack.reload();
  async function runEvaluation() {
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/lender-evaluation`, {}); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not evaluate this request.'); } finally { setBusy(false); }
  }
  async function review(docId: string, status: 'ACCEPTED'|'REJECTED'|'REVOKED') {
    if (message.trim().length < 3) { setError('Add a short review comment before saving.'); return; }
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/documents/${docId}/review`, { status, comment: message }); setMessage(''); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save document review.'); } finally { setBusy(false); }
  }
  async function viewDocument(docId: string) {
    try { const blob = await client.blob(`/personal-loans/applications/${applicationId}/documents/${docId}/file`); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open document.'); }
  }
  return <section className="space-y-4" aria-label="Lender four-pillar review">
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Four-pillar review</h2><p className="text-sm text-muted">Review the current evidence before making your lending decision.</p></div><Button variant="secondary" loading={busy} onClick={runEvaluation}>Run evaluation</Button></div>
      {pack.error && <Alert tone="red">{pack.error}</Alert>}
      {error && <Alert tone="red">{error}</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">{Object.entries(pillarNames).map(([key, label]) => { const p = pack.data?.pillars[key]; const good = ['VERIFIED','CALCULATED','MONITORING'].includes(p?.status ?? ''); return <div key={key} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-2"><strong>{label}</strong><span className={good ? 'text-sm font-semibold text-green-700' : 'text-sm font-semibold text-amber-700'}>{p?.status ?? 'Loading'}</span></div>{p?.confidenceBps != null && <p className="mt-1 text-xs text-muted">Evidence confidence {Math.round(p.confidenceBps / 100)}%</p>}</div>; })}</div>
      <p className="text-xs text-muted">Evaluation organizes available evidence for lender review. It does not approve a loan or replace a credit bureau, OCR, or transaction-analysis provider.</p>
    </Card>
    <Card className="space-y-3"><div><h2 className="font-bold">Applicant documents</h2><p className="text-sm text-muted">Open each file, add a comment, then accept, reject, or revoke it.</p></div>
      {!pack.data?.documents.length && <p className="text-sm text-muted">No documents have been added to the applicant data vault.</p>}
      {pack.data?.documents.map(doc => <div key={doc.id} className="space-y-3 rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{doc.name}</strong><div className="text-xs text-muted">{doc.type.replaceAll('_',' ')} · {new Date(doc.createdAt).toLocaleDateString('en-ZA')} · {doc.status}</div></div><Button variant="secondary" onClick={() => void viewDocument(doc.id)}>View document</Button></div>{doc.processingNote && <p className="text-sm text-muted">Latest note: {doc.processingNote}</p>}<div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Field label="Review comment"><Textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} placeholder="Explain your document decision" /></Field><Field label="Action"><Select value={docStatus[doc.id] ?? 'ACCEPTED'} onChange={e => setDocStatus({ ...docStatus, [doc.id]: e.target.value })}><option value="ACCEPTED">Accept</option><option value="REJECTED">Reject</option><option value="REVOKED">Revoke acceptance</option></Select><Button className="mt-2 w-full" loading={busy} onClick={() => void review(doc.id, (docStatus[doc.id] ?? 'ACCEPTED') as 'ACCEPTED'|'REJECTED'|'REVOKED')}>Save review</Button></Field></div>{doc.reviews.slice(0,3).map((r,i)=><p key={i} className="text-xs text-muted">{r.status} · {new Date(r.createdAt).toLocaleString('en-ZA')}: {r.comment}</p>)}</div>)}
    </Card>
  </section>;
}
