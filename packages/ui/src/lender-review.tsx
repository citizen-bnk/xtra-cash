'use client';
import { useState } from 'react';
import { Alert, Button, Card, Field, Modal, Select, StatusBadge, Textarea } from './components';
import { RecordActions } from './record-actions';
import { useApi, useAuth } from './api';

type ReviewPack = {
  pillars: Record<string, { status: string; confidenceBps?: number; score?: number | null }>;
  documents: { id: string; type: string; name: string; status: string; processingNote: string | null; createdAt: string; reviews: { status: string; comment: string; createdAt: string }[] }[];
};
const pillarNames: Record<string, string> = { id: 'Identity', risk: 'Risk', income: 'Income', fraud: 'Fraud' };
function Progress({ value }: { value: number }) { return <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface" aria-label={`${value}% complete`}><div className="h-full rounded-full bg-brand-purple transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

export function LenderReviewWorkspace({ applicationId }: { applicationId: string }) {
  const { client } = useAuth();
  const pack = useApi(c => c.request<ReviewPack>('GET', `/personal-loans/applications/${applicationId}/lender-review-pack`), [applicationId]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [selectedPillar, setSelectedPillar] = useState<string | null>(null), [selectedDocument, setSelectedDocument] = useState<ReviewPack['documents'][number] | null>(null), [message, setMessage] = useState(''), [docStatus, setDocStatus] = useState('ACCEPTED');
  const reload = () => pack.reload();
  async function runEvaluation() {
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/lender-evaluation`, {}); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Evaluation failed. Check your access and try again.'); } finally { setBusy(false); }
  }
  async function reviewDocument() {
    if (!selectedDocument) return;
    if (message.trim().length < 3) { setError('Add a short review comment before saving.'); return; }
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/documents/${selectedDocument.id}/review`, { status: docStatus, comment: message.trim() }); setMessage(''); setSelectedDocument(null); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this document review. Check that the document is linked to this application.'); } finally { setBusy(false); }
  }
  async function viewDocument(docId: string) {
    setError('');
    try { const blob = await client.blob(`/personal-loans/applications/${applicationId}/documents/${docId}/file`); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open document. Check your access or ask an administrator to relink it.'); }
  }
  return <section className="space-y-3" aria-label="Lender review">
    {error && <Alert tone="red">{error}</Alert>}{pack.error && <Alert tone="red">Could not load lender review: {pack.error}</Alert>}
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-bold">Four pillars</h2><p className="text-xs text-muted">Evidence status at a glance</p></div><RecordActions actions={[{ label: busy ? 'Evaluation running…' : 'Run / rerun evaluation', disabled: busy, onSelect: () => void runEvaluation() }, { label: 'Evaluation limitations', onSelect: () => setSelectedPillar('limitations') }]} /></div>
      {Object.entries(pillarNames).map(([key, label]) => { const p = pack.data?.pillars[key]; const value = p?.confidenceBps == null ? (['VERIFIED','CALCULATED','MONITORING'].includes(p?.status ?? '') ? 100 : 0) : Math.round(p.confidenceBps / 100); return <div key={key} className="flex min-h-10 items-center gap-2 border-t border-line py-1.5"><strong className="w-16 shrink-0 text-sm">{label}</strong><span className="max-w-28 truncate"><StatusBadge status={p?.status ?? 'LOADING'} /></span><Progress value={value} /><span className="w-9 text-right text-xs text-muted">{value}%</span><RecordActions actions={[{ label: 'View pillar details', onSelect: () => setSelectedPillar(key) }, { label: busy ? 'Evaluation running…' : 'Run / rerun evaluation', disabled: busy, onSelect: () => void runEvaluation() }]} label={`${label} actions`} /></div>; })}
    </Card>
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-bold">Application documents</h2><p className="text-xs text-muted">{pack.data?.documents.length ?? 0} linked files</p></div></div>
      {!pack.data?.documents.length && <p className="py-2 text-sm text-muted">No documents are linked to this application yet.</p>}
      {pack.data?.documents.map(doc => <div key={doc.id} className="flex min-h-11 items-center gap-2 border-t border-line py-1.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{doc.name}</div><div className="truncate text-xs text-muted">{doc.type.replaceAll('_',' ')} · {new Date(doc.createdAt).toLocaleDateString('en-ZA')}</div></div><StatusBadge status={doc.status} /><RecordActions actions={[{ label: 'View document', onSelect: () => void viewDocument(doc.id) }, { label: 'Review document', onSelect: () => { setSelectedDocument(doc); setDocStatus(doc.status === 'ACCEPTED' ? 'REVOKED' : 'ACCEPTED'); setMessage(''); setError(''); } }]} label={`${doc.name} actions`} /></div>)}
    </Card>
    <Modal open={!!selectedPillar} title={selectedPillar === 'limitations' ? 'Evaluation notes' : `${pillarNames[selectedPillar ?? ''] ?? selectedPillar ?? ''} pillar`} onClose={() => setSelectedPillar(null)}>
      {selectedPillar === 'limitations' ? <Alert tone="amber">The evaluation organizes available evidence for lender review. It does not approve a loan or replace a credit bureau, OCR, or transaction-analysis provider.</Alert> : selectedPillar ? <div className="space-y-3"><div className="flex items-center justify-between"><span>Status</span><StatusBadge status={pack.data?.pillars[selectedPillar]?.status ?? 'LOADING'} /></div><p className="text-sm text-muted">{pack.data?.pillars[selectedPillar]?.confidenceBps != null ? `Evidence confidence ${Math.round((pack.data?.pillars[selectedPillar]?.confidenceBps ?? 0) / 100)}%.` : 'No confidence score is available yet.'}</p>{pack.data?.pillars[selectedPillar]?.score != null && <p className="text-sm">Score: {pack.data.pillars[selectedPillar].score}</p>}<Button variant="secondary" loading={busy} onClick={() => void runEvaluation()}>Run / rerun evaluation</Button></div> : null}
    </Modal>
    <Modal open={!!selectedDocument} title="Review document" onClose={() => setSelectedDocument(null)}>
      {selectedDocument && <div className="space-y-4"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{selectedDocument.name}</p><p className="text-xs text-muted">{selectedDocument.type.replaceAll('_',' ')} · {new Date(selectedDocument.createdAt).toLocaleDateString('en-ZA')}</p></div><Button variant="secondary" onClick={() => void viewDocument(selectedDocument.id)}>Open file</Button></div>{selectedDocument.processingNote && <p className="text-sm text-muted">{selectedDocument.processingNote}</p>}<Field label="Review comment"><Textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={1000} placeholder="Explain the decision for the applicant" /></Field><Field label="Decision"><Select value={docStatus} onChange={e=>setDocStatus(e.target.value)}><option value="ACCEPTED">Accept</option><option value="REJECTED">Reject</option><option value="REVOKED">Revoke acceptance</option></Select></Field>{selectedDocument.reviews.slice(0,3).map((r,i)=><p key={i} className="text-xs text-muted">{r.status} · {new Date(r.createdAt).toLocaleString('en-ZA')}: {r.comment}</p>)}<div className="flex justify-end"><Button loading={busy} disabled={message.trim().length<3} onClick={()=>void reviewDocument()}>Save review</Button></div></div>}
    </Modal>
  </section>;
}
