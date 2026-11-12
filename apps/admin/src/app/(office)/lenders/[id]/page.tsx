'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { bpsToPercent, DOCUMENT_LABELS, formatZAR } from '@xtra/shared';
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, RecordActions, Stat, StatusBadge, Table, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function LenderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { client } = useAuth();
  const toast = useToast();
  const lender = useApi((c) => c.admin.lender(id), [id]);
  const [decision, setDecision] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ncr, setNcr] = useState('');
  const [documentDecision, setDocumentDecision] = useState<{ id: string; status: 'ACCEPTED' | 'REJECTED'; name: string } | null>(null);
  const [documentComment, setDocumentComment] = useState('');

  const review = useAction(async () => {
    await client.admin.reviewLender(id, decision!, notes || undefined);
    toast(`Lender ${decision!.toLowerCase().replace('_', ' ')}`);
    setDecision(null);
    setNotes('');
    lender.reload();
  });
  const saveNcr = useAction(async () => {
    await client.request('POST', `/admin/lenders/${id}/ncr`, { ncrNumber: ncr });
    toast('NCR number captured');
    lender.reload();
  });
  const docReview = useAction(async (docId: string, status: 'ACCEPTED' | 'REJECTED', comment?: string) => {
    await client.admin.reviewDocument(id, docId, status, comment);
    toast(status === 'ACCEPTED' ? 'Document accepted' : 'Document rejected');
    setDocumentDecision(null);
    setDocumentComment('');
    lender.reload();
  });

  if (!lender.data) return lender.error ? <Alert tone="red">{lender.error}</Alert> : <Loading />;
  const l = lender.data;
  const st = l.accreditationStatus;
  return (
    <div className="space-y-6">
      <Link href="/lenders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Lenders</Link>
      <PageHeader
        title={l.name}
        subtitle={`${l.registrationNumber ?? 'No CIPC no.'} · ${l.ncrNumber ?? 'No NCR no.'} · ${l.contactEmail} · ${l.contactPhone}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={st} />
            <RecordActions label={`Actions for ${l.name}`} actions={[
              ...(st === 'SUBMITTED' ? [{ label: 'Start accreditation review', onSelect: () => setDecision('UNDER_REVIEW') }] : []),
              ...(['SUBMITTED', 'UNDER_REVIEW', 'SUSPENDED', 'REJECTED'].includes(st) ? [{ label: 'Accredit lender', onSelect: () => setDecision('ACCREDITED') }] : []),
              ...(['SUBMITTED', 'UNDER_REVIEW'].includes(st) ? [{ label: 'Reject lender', onSelect: () => setDecision('REJECTED') }] : []),
              ...(st === 'ACCREDITED' ? [{ label: 'Suspend lender', onSelect: () => setDecision('SUSPENDED') }] : []),
            ]} />
          </div>
        }
      />
      {l.assistedAccreditation && (
        <Alert tone={l.accreditationFeePaid ? 'blue' : 'amber'} title="Assisted accreditation">
          Fee {formatZAR(l.accreditationFeeCents)} — {l.accreditationFeePaid ? 'paid' : 'not yet paid (cannot accredit until paid)'}. Compliance helps this lender obtain NCR registration and documents.
          {!l.ncrNumber && (
            <div className="mt-2 flex gap-2">
              <Input className="max-w-52 bg-white" placeholder="NCRCP…" value={ncr} onChange={(e) => setNcr(e.target.value)} />
              <Button size="sm" loading={saveNcr.loading} disabled={!ncr} onClick={() => saveNcr.run()}>Capture NCR no.</Button>
            </div>
          )}
        </Alert>
      )}
      {l.reviewNotes && <Alert tone="blue" title="Review notes">{l.reviewNotes}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="/funding" label="Available" value={formatZAR(l.stats.availableCents)} sub={`${formatZAR(l.stats.totalLoadedCents)} loaded`} />
        <Stat href="/loans" label="Outstanding" value={formatZAR(l.stats.outstandingCents)} sub={`${l.stats.activeLoans} active loans`} />
        <Stat href="/loans" label="In arrears" value={l.stats.loansInArrears} />
        <Stat href="/loans" label="Repaid to lender" value={formatZAR(l.stats.totalRepaidCents)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Accreditation documents</h2>
          {(l.documents ?? []).length === 0 && <p className="text-sm text-muted">No documents uploaded.</p>}
          <div className="divide-y divide-line">
            {(l.documents ?? []).map((d) => (
              <div key={d.id} className="flex min-w-0 items-center justify-between gap-2 py-2.5 text-sm">
                <button
                  className="flex min-w-0 items-center gap-2 text-left hover:underline"
                  onClick={() => client.blob(d.url).then((b) => { const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); })}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{DOCUMENT_LABELS[d.type]}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={d.status} />
                  <RecordActions label={`Actions for ${DOCUMENT_LABELS[d.type]}`} actions={[
                    ...(d.status !== 'ACCEPTED' ? [{ label: 'Accept document', onSelect: () => { setDocumentComment(''); setDocumentDecision({ id: d.id, status: 'ACCEPTED', name: DOCUMENT_LABELS[d.type] }); } }] : []),
                    ...(d.status !== 'REJECTED' ? [{ label: 'Reject with comment', onSelect: () => { setDocumentComment(''); setDocumentDecision({ id: d.id, status: 'REJECTED', name: DOCUMENT_LABELS[d.type] }); } }] : []),
                  ]} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Offers</h2>
          {l.offers.length === 0 && <p className="text-sm text-muted">No offers.</p>}
          <div className="space-y-2">
            {l.offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-muted">{bpsToPercent(o.monthlyInterestRateBps)} p/m · {o.termMonths}m · up to {formatZAR(o.maxAmountPerUserCents, { decimals: false })}</div>
                </div>
                <Badge tone={o.active ? 'green' : 'gray'}>{o.active ? 'Active' : 'Paused'}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div>
        <h2 className="mb-3 font-bold">Funding history</h2>
        <Table
          rows={l.funding}
          empty="No funding"
          columns={[
            { header: 'Date', cell: (f) => new Date(f.createdAt).toLocaleDateString('en-ZA') },
            { header: 'Type', cell: (f) => f.type },
            { header: 'Reference', cell: (f) => <code className="text-xs">{f.reference}</code> },
            { header: 'Amount', align: 'right', cell: (f) => formatZAR(f.amountCents) },
            { header: 'Status', cell: (f) => <StatusBadge status={f.status} /> },
          ]}
        />
      </div>
      <Modal open={!!decision} onClose={() => setDecision(null)} title={`Mark as ${decision?.replace('_', ' ').toLowerCase()}`}>
        <Field label={decision === 'REJECTED' || decision === 'SUSPENDED' ? 'Notes (required, shown to lender)' : 'Notes (optional, shown to lender)'}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {decision === 'ACCREDITED' && <p className="mt-2 text-xs text-muted">Accrediting makes this lender's active offers visible to matching shoppers immediately.</p>}
        {review.error && <div className="mt-3"><Alert tone="red">{review.error}</Alert></div>}
        <Button className="mt-4 w-full" loading={review.loading} onClick={() => review.run()}>Confirm</Button>
      </Modal>
      <Modal open={!!documentDecision} onClose={() => setDocumentDecision(null)} title={`${documentDecision?.status === 'ACCEPTED' ? 'Accept' : 'Reject'} document`}>
        <p className="mb-3 text-sm text-muted">{documentDecision?.name}</p>
        <Field label={documentDecision?.status === 'REJECTED' ? 'Comment (required, visible to lender)' : 'Comment (optional, recorded in audit log)'}>
          <Textarea value={documentComment} onChange={(e) => setDocumentComment(e.target.value)} placeholder={documentDecision?.status === 'REJECTED' ? 'Explain what needs correction.' : 'Add a review note if useful.'} />
        </Field>
        {docReview.error && <div className="mt-3"><Alert tone="red">{docReview.error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDocumentDecision(null)}>Cancel</Button>
          <Button variant={documentDecision?.status === 'REJECTED' ? 'danger' : 'primary'} loading={docReview.loading} disabled={documentDecision?.status === 'REJECTED' && documentComment.trim().length < 3} onClick={() => documentDecision && docReview.run(documentDecision.id, documentDecision.status, documentComment.trim() || undefined)}>
            {documentDecision?.status === 'ACCEPTED' ? 'Accept document' : 'Reject document'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
