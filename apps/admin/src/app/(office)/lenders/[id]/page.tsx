'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { bpsToPercent, DOCUMENT_LABELS, formatZAR } from '@xtra/shared';
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Stat, StatusBadge, Table, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function LenderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { client } = useAuth();
  const toast = useToast();
  const lender = useApi((c) => c.admin.lender(id), [id]);
  const [decision, setDecision] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ncr, setNcr] = useState('');

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
  const docReview = useAction(async (docId: string, status: 'ACCEPTED' | 'REJECTED') => {
    await client.admin.reviewDocument(id, docId, status);
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
          <>
            <StatusBadge status={st} />
            {(st === 'SUBMITTED') && <Button variant="secondary" onClick={() => setDecision('UNDER_REVIEW')}>Start review</Button>}
            {['SUBMITTED', 'UNDER_REVIEW', 'SUSPENDED', 'REJECTED'].includes(st) && <Button onClick={() => setDecision('ACCREDITED')}>Accredit</Button>}
            {['SUBMITTED', 'UNDER_REVIEW'].includes(st) && <Button variant="secondary" onClick={() => setDecision('REJECTED')}>Reject</Button>}
            {st === 'ACCREDITED' && <Button variant="danger" onClick={() => setDecision('SUSPENDED')}>Suspend</Button>}
          </>
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
        <Stat label="Available" value={formatZAR(l.stats.availableCents)} sub={`${formatZAR(l.stats.totalLoadedCents)} loaded`} />
        <Stat label="Outstanding" value={formatZAR(l.stats.outstandingCents)} sub={`${l.stats.activeLoans} active loans`} />
        <Stat label="In arrears" value={l.stats.loansInArrears} />
        <Stat label="Repaid to lender" value={formatZAR(l.stats.totalRepaidCents)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Accreditation documents</h2>
          {(l.documents ?? []).length === 0 && <p className="text-sm text-muted">No documents uploaded.</p>}
          <div className="divide-y divide-line">
            {(l.documents ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <button
                  className="flex min-w-0 items-center gap-2 text-left hover:underline"
                  onClick={() => client.blob(d.url).then((b) => { const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); })}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{DOCUMENT_LABELS[d.type]}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={d.status} />
                  {d.status !== 'ACCEPTED' && <Button size="sm" variant="secondary" onClick={() => docReview.run(d.id, 'ACCEPTED')}>Accept</Button>}
                  {d.status !== 'REJECTED' && <Button size="sm" variant="ghost" onClick={() => docReview.run(d.id, 'REJECTED')}>Reject</Button>}
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
    </div>
  );
}
