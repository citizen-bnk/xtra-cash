'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, FileUp } from 'lucide-react';
import { DOCUMENT_LABELS, DocumentType, formatZAR, REQUIRED_DOCUMENTS, type LenderOrg } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, Loading, PageHeader, StatusBadge, useAction, useApi, useAuth, useToast } from '@xtra/ui';
import { openBlob } from '@/components/PortalShell';

const STEPS = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCREDITED'];

export default function AccreditationPage() {
  const { client } = useAuth();
  const toast = useToast();
  const org = useApi((c) => c.lender.org());
  const info = useApi((c) => c.lender.fundingInstructions());
  const [form, setForm] = useState({ name: '', tradingName: '', registrationNumber: '', ncrNumber: '', contactEmail: '', contactPhone: '' });
  const [assisted, setAssisted] = useState(false);

  useEffect(() => {
    const o = org.data;
    if (o)
      setForm({
        name: o.name,
        tradingName: o.tradingName ?? '',
        registrationNumber: o.registrationNumber ?? '',
        ncrNumber: o.ncrNumber ?? '',
        contactEmail: o.contactEmail,
        contactPhone: o.contactPhone,
      });
    if (o) setAssisted(o.assistedAccreditation);
  }, [org.data]);

  const save = useAction(async () => {
    await client.lender.saveOrg({ ...form, tradingName: form.tradingName || undefined, registrationNumber: form.registrationNumber || undefined, ncrNumber: form.ncrNumber || undefined });
    toast('Business details saved');
    org.reload();
  });
  const submit = useAction(async () => {
    await client.lender.saveOrg({ ...form, tradingName: form.tradingName || undefined, registrationNumber: form.registrationNumber || undefined, ncrNumber: form.ncrNumber || undefined });
    await client.lender.submitAccreditation(assisted);
    toast('Submitted for accreditation');
    org.reload();
  });
  const pay = useAction(async () => {
    await client.lender.payAccreditationFee();
    toast('Payment received — our compliance team will be in touch');
    org.reload();
  });

  if (!org.data) return <Loading />;
  const o = org.data;
  const editable = ['DRAFT', 'REJECTED', 'SUBMITTED'].includes(o.accreditationStatus);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const stepIdx = STEPS.indexOf(o.accreditationStatus);

  return (
    <div className="space-y-6">
      <PageHeader title="Accreditation" subtitle="XTRA-CASH only lists lenders who are NCR-registered and FICA-verified." actions={<StatusBadge status={o.accreditationStatus} />} />

      <Card className="flex flex-wrap items-center gap-4">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 text-sm">
            {i <= stepIdx ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-line" />}
            <span className={i <= stepIdx ? 'font-semibold' : 'text-muted'}>{s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
          </div>
        ))}
      </Card>
      {o.reviewNotes && <Alert tone={o.accreditationStatus === 'ACCREDITED' ? 'green' : 'amber'} title="Notes from compliance">{o.reviewNotes}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">Business details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Registered name"><Input value={form.name} onChange={set('name')} disabled={!editable} /></Field></div>
            <Field label="Trading name"><Input value={form.tradingName} onChange={set('tradingName')} /></Field>
            <Field label="CIPC registration no."><Input value={form.registrationNumber} onChange={set('registrationNumber')} disabled={!editable} placeholder="2020/123456/07" /></Field>
            <Field label="NCR registration no." hint="Leave blank if you need assisted accreditation"><Input value={form.ncrNumber} onChange={set('ncrNumber')} disabled={!editable} placeholder="NCRCP…" /></Field>
            <Field label="Contact phone"><Input value={form.contactPhone} onChange={set('contactPhone')} /></Field>
            <div className="sm:col-span-2"><Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field></div>
          </div>
          {save.error && <div className="mt-3"><Alert tone="red">{save.error}</Alert></div>}
          <Button className="mt-4" variant="secondary" loading={save.loading} onClick={() => save.run()}>Save details</Button>
        </Card>

        <Documents org={o} onChange={() => org.reload()} />
      </div>

      {editable && o.accreditationStatus !== 'SUBMITTED' && (
        <Card>
          <h2 className="font-bold">Submit for accreditation</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { v: false, t: 'Standard review', d: 'I am NCR-registered and have uploaded all required documents. No fee.' },
              { v: true, t: `Assisted accreditation · ${formatZAR(info.data?.assistedAccreditationFeeCents ?? 0)}`, d: 'XTRA-CASH compliance helps you with NCR registration, FICA and documents.' },
            ].map((opt) => (
              <button key={String(opt.v)} onClick={() => setAssisted(opt.v)} className={`rounded-xl border p-4 text-left transition ${assisted === opt.v ? 'border-ink ring-2 ring-lime' : 'border-line hover:border-ink/40'}`}>
                <div className="font-semibold">{opt.t}</div>
                <div className="mt-1 text-sm text-muted">{opt.d}</div>
              </button>
            ))}
          </div>
          {submit.error && <div className="mt-3"><Alert tone="red">{submit.error}</Alert></div>}
          <Button className="mt-4" loading={submit.loading} onClick={() => submit.run()}>Submit application</Button>
        </Card>
      )}

      {o.accreditationStatus === 'SUBMITTED' && o.assistedAccreditation && !o.accreditationFeePaid && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold">Assisted accreditation fee</div>
            <div className="text-sm text-muted">Pay {formatZAR(o.accreditationFeeCents)} to start your assisted accreditation.</div>
          </div>
          <Button variant="accent" loading={pay.loading} onClick={() => pay.run()}>Pay {formatZAR(o.accreditationFeeCents)}</Button>
          {pay.error && <Alert tone="red">{pay.error}</Alert>}
        </Card>
      )}
    </div>
  );
}

function Documents({ org, onChange }: { org: LenderOrg; onChange: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType | null>(null);
  const upload = useAction(async (file: File, t: DocumentType) => {
    await client.lender.uploadDocument(t, file, file.name);
    toast('Document uploaded');
    onChange();
  });
  const docs = org.documents ?? [];
  const all = Object.keys(DOCUMENT_LABELS) as DocumentType[];

  return (
    <Card>
      <h2 className="mb-1 font-bold">Documents</h2>
      <p className="mb-4 text-sm text-muted">PDF, JPG or PNG up to 10 MB.</p>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && type) upload.run(f, type);
          e.target.value = '';
        }}
      />
      <div className="divide-y divide-line">
        {all.map((t) => {
          const d = docs.find((x) => x.type === t);
          return (
            <div key={t} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {DOCUMENT_LABELS[t]} {REQUIRED_DOCUMENTS.includes(t) && <span className="text-red-600">*</span>}
                </div>
                {d && (
                  <button className="truncate text-xs text-muted underline" onClick={() => client.blob(d.url).then(openBlob)}>
                    {d.fileName}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {d && <StatusBadge status={d.status} />}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={upload.loading && type === t}
                  onClick={() => {
                    setType(t);
                    fileRef.current?.click();
                  }}
                >
                  <FileUp className="h-3.5 w-3.5" /> {d ? 'Replace' : 'Upload'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {upload.error && <div className="mt-3"><Alert tone="red">{upload.error}</Alert></div>}
    </Card>
  );
}
