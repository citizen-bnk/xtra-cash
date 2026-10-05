'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatZAR, type PersonalLoanApplication, type PersonalVerification } from '@xtra/shared';
import { Alert, Button, Card, Field, Loading, Modal, PageHeader, StatusBadge, Table, Tabs, Textarea, useApi, useAuth } from '@xtra/ui';

export default function ApplicationsReview() {
  const { client } = useAuth();
  const applications = useApi(c => c.admin.personalApplications());
  const verifications = useApi(c => c.admin.personalVerifications());
  const [tab, setTab] = useState<'applications' | 'documents'>('applications');
  const [application, setApplication] = useState<PersonalLoanApplication | null>(null), [verification, setVerification] = useState<PersonalVerification | null>(null);
  const [notes, setNotes] = useState(''), [checked, setChecked] = useState(false), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  async function review(action: 'REVIEW' | 'DECLINE') {
    if (!application) return; setBusy(true); setError(null);
    try { await client.request('POST', `/personal-loans/applications/${application.id}/review`, { action, notes }); applications.reload(); setApplication(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save review'); } finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (!verification?.userId) return; setBusy(true); setError(null);
    try { await client.admin.reviewPersonalVerification(verification.userId, approve, notes || undefined); verifications.reload(); setVerification(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save verification'); } finally { setBusy(false); }
  }
  async function download(userId: string, kind: string) {
    setError(null);
    try { const blob = await client.blob(`/personal-loans/documents/${userId}/${kind}`); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${kind}-document.${blob.type.includes('pdf') ? 'pdf' : blob.type.includes('png') ? 'png' : 'jpg'}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not download document'); }
  }
  const pending = verifications.data?.filter(v => v.status === 'PENDING') ?? [];
  return <div className="space-y-5"><PageHeader title="Personal-loan applications" subtitle="Latest 100 applications and document submissions. Review does not approve a loan or pay out funds." />
    <Alert tone="blue">HANIS, identity-data and credit-bureau providers are not connected. Document approval records a human identity and address review, without generating a credit score. Final affordability checks and lending decisions remain with the lender.</Alert>
    <Tabs value={tab} onChange={setTab} options={[{ value: 'applications', label: 'Applications', count: applications.data?.length }, { value: 'documents', label: 'KYC & FICA documents', count: pending.length }]} />
    {(applications.error || verifications.error) && <Alert tone="red">{applications.error || verifications.error}</Alert>}{error && !application && !verification && <Alert tone="red">{error}</Alert>}
    {tab === 'applications' ? applications.loading ? <Loading /> : <Table rows={applications.data ?? []} empty="No personal-loan applications yet" columns={[
      { header: 'Applicant', cell: a => <Link className="font-semibold underline" href={`/users/${a.userId}`}>{a.firstName} {a.lastName}</Link> },
      { header: 'Request', cell: a => <div>{formatZAR(a.amountCents)} · {a.termMonths} months<div className="text-xs text-muted">{a.purpose}</div></div> },
      { header: 'Declared finances', cell: a => <div>Income {formatZAR(a.monthlyIncomeCents)}<div className="text-xs text-muted">Expenses {formatZAR(a.monthlyExpensesCents)}</div></div> },
      { header: 'Status', cell: a => <StatusBadge status={a.status} /> },
      { header: 'Created', cell: a => new Date(a.createdAt).toLocaleDateString('en-ZA') },
      { header: 'Review', cell: a => <Button size="sm" variant="secondary" disabled={a.status === 'DECLINED'} onClick={() => { setApplication(a); setNotes(a.reviewNotes ?? ''); setError(null); }}>Review request</Button> },
    ]} /> : verifications.loading ? <Loading /> : <div className="space-y-3">{!(verifications.data?.length) && <Card>No identity and address documents submitted yet.</Card>}{verifications.data?.map(v => <Card key={v.userId}><div className="flex flex-wrap justify-between gap-3"><div className="font-bold">{v.firstName} {v.lastName}</div><StatusBadge status={v.status} /></div><div className="mt-2 text-sm text-muted">{v.identityType} {v.maskedIdentity}</div><p className="mt-2 text-sm">{v.address}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => download(v.userId!, 'identity')}>Download identity document</Button><Button size="sm" variant="secondary" onClick={() => download(v.userId!, 'address')}>Download proof of address</Button>{v.status === 'PENDING' && <Button size="sm" onClick={() => { setVerification(v); setNotes(''); setChecked(false); setError(null); }}>Review documents</Button>}</div>{v.reason && <p className="mt-3 text-sm">Reviewer note: {v.reason}</p>}</Card>)}</div>}
    <Modal open={!!application} onClose={() => !busy && setApplication(null)} title="Review application"><p className="mb-4 text-sm text-muted">Record the review status and an update visible to the applicant. This action does not offer a loan or disburse money.</p><Field label="Update for the applicant"><Textarea value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} /></Field>{error && <Alert tone="red">{error}</Alert>}<div className="mt-4 flex justify-end gap-2"><Button variant="danger" disabled={notes.trim().length < 3} loading={busy} onClick={() => review('DECLINE')}>Decline request</Button><Button disabled={notes.trim().length < 3} loading={busy} onClick={() => review('REVIEW')}>Mark under review</Button></div></Modal>
    <Modal open={!!verification} onClose={() => !busy && setVerification(null)} title="Review identity and address"><p className="mb-4 text-sm">Review both documents, confirm they belong to the applicant and check the residential address. This completes the platform document review and allows lender matching; it does not certify a HANIS or bureau check.</p><label className="mb-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>I have reviewed both documents and confirmed the applicant's identity and address.</span></label><Field label="Reviewer note / correction needed"><Textarea value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} /></Field>{error && <Alert tone="red">{error}</Alert>}<div className="mt-4 flex justify-end gap-2"><Button variant="danger" disabled={notes.trim().length < 3} loading={busy} onClick={() => decide(false)}>Request correction</Button><Button disabled={!checked} loading={busy} onClick={() => decide(true)}>Accept documents</Button></div></Modal>
  </div>;
}
