'use client';

import { useState } from 'react';
import { formatZAR } from '@xtra/shared';
import { useAction, useApi, useAuth } from './api';
import { Alert, Button, Card, Field, Input, Loading, Modal, PageHeader, RecordLine, Select, Textarea } from './components';

type Guarantee = {
  id: string;
  application_id: string;
  kind: 'FAMILY' | 'EMPLOYER';
  status: 'REVIEW' | 'READY' | 'SIGNED' | 'DECLINED' | 'CANCELLED';
  principal_cents: number;
  term_months: number;
  expires_at: string | null;
  applicant: boolean;
  signer: boolean;
  lender_name?: string;
  employer_name?: string;
  applicant_name?: string;
  signer_name?: string;
  digest?: string;
  terms?: string;
};

const labels: Record<Guarantee['status'], string> = {
  REVIEW: 'Under review', READY: 'Awaiting signature', SIGNED: 'Signed', DECLINED: 'Declined', CANCELLED: 'Cancelled',
};
const kindLabel = (kind: Guarantee['kind']) => kind === 'FAMILY' ? 'Family guarantee' : 'Employer guarantee';

export function RequestGuarantee({ applicationId }: { applicationId: string }) {
  const { client } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<Guarantee['kind']>('FAMILY');
  const [email, setEmail] = useState('');
  const send = useAction(async () => {
    await client.request('POST', '/personal-guarantees', { applicationId, kind, email: email.trim() });
    setSent(true);
    setOpen(false);
  });
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>Request a guarantee</Button>
    {sent && <Alert tone="blue">Request sent for review. <a className="font-semibold underline" href="/app/guarantees">View guarantees</a></Alert>}
    {open && <Modal open title="Request a guarantee" onClose={() => setOpen(false)}>
      <div className="space-y-3">
        <Field label="Who can support this application?">
          <Select value={kind} onChange={event => setKind(event.target.value as Guarantee['kind'])}>
            <option value="FAMILY">Family member</option><option value="EMPLOYER">Employer representative</option>
          </Select>
        </Field>
        <Field label="Their XTRA-CASH email"><Input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} /></Field>
        {send.error && <Alert tone="red">{send.error}</Alert>}
        <Button className="w-full" disabled={!email.trim()} loading={send.loading} onClick={() => send.run()}>Send request</Button>
      </div>
    </Modal>}
  </>;
}

export function MyGuarantees() {
  const { client } = useAuth();
  const data = useApi(c => c.request<Guarantee[]>('GET', '/personal-guarantees'));
  const [selected, select] = useState<Guarantee | null>(null);
  const [password, setPassword] = useState('');
  const cancel = useAction(async (id: string) => {
    await client.request('POST', `/personal-guarantees/${id}/cancel`, {});
    await data.reload();
  });
  const decision = useAction(async (choice: 'sign' | 'decline') => {
    if (!selected) return;
    await client.request('POST', `/personal-guarantees/${selected.id}/${choice}`,
      choice === 'sign' ? { digest: selected.digest, password } : {});
    setPassword('');
    select(null);
    await data.reload();
  });
  return <div className="mx-auto max-w-3xl space-y-3">
    <a href="/app/loans" className="text-sm font-semibold text-purple-800">Back to loans</a>
    <PageHeader title="My guarantees" />
    {data.error && <Alert tone="red">{data.error}</Alert>}
    {cancel.error && <Alert tone="red">{cancel.error}</Alert>}
    {data.loading && !data.data && <Loading />}
    {data.data?.length === 0 && <Card>No guarantee requests yet.</Card>}
    {data.data?.map(guarantee => <Card key={guarantee.id} className="space-y-2">
      <RecordLine title={kindLabel(guarantee.kind)} description={labels[guarantee.status]}
        value={`${formatZAR(guarantee.principal_cents)} · ${guarantee.term_months} months`} />
      {guarantee.signer && ['REVIEW', 'READY'].includes(guarantee.status) && <Button variant="secondary" onClick={() => { setPassword(''); select(guarantee); }}>Open request</Button>}
      {guarantee.applicant && ['REVIEW', 'READY'].includes(guarantee.status) && <Button variant="secondary" disabled={cancel.loading} onClick={() => cancel.run(guarantee.id)}>Cancel request</Button>}
      {guarantee.status === 'SIGNED' && guarantee.terms && <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Signed terms</summary>
        <p className="mt-2 whitespace-pre-wrap">{guarantee.terms}</p>
      </details>}
    </Card>)}
    {selected && <Modal open title={kindLabel(selected.kind)} onClose={() => { select(null); setPassword(''); }}>
      <div className="space-y-3">
        <p className="font-semibold">{formatZAR(selected.principal_cents)} · {selected.term_months} months</p>
        {selected.terms ? <>
          <p className="text-sm">{[selected.lender_name, selected.employer_name].filter(Boolean).join(' · ')}</p>
          <div className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm">{selected.terms}</div>
          <Field label="Confirm with your account password"><Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
        </> : <p className="text-sm">This request is being reviewed.</p>}
        {decision.error && <Alert tone="red">{decision.error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={decision.loading} onClick={() => decision.run('decline')}>Decline</Button>
          {selected.terms && <Button disabled={!password || !selected.digest} loading={decision.loading} onClick={() => decision.run('sign')}>Agree and sign</Button>}
        </div>
      </div>
    </Modal>}
  </div>;
}

export function GuaranteeReview() {
  const { client } = useAuth();
  const data = useApi(c => c.request<Guarantee[]>('GET', '/personal-guarantees/review'));
  const lenders = useApi(c => c.request<{ id: string; name: string; accreditationStatus: string }[]>('GET', '/admin/lenders'));
  const [id, setId] = useState('');
  const [lenderId, setLender] = useState('');
  const [employerId, setEmployer] = useState('');
  const [authorityReference, setAuthority] = useState('');
  const [terms, setTerms] = useState('');
  const selected = data.data?.find(item => item.id === id);
  const save = useAction(async () => {
    await client.request('POST', `/personal-guarantees/${id}/prepare`, {
      lenderId, authorityReference, terms, ...(employerId.trim() ? { employerId: employerId.trim() } : {}),
    });
    setId('');
    await data.reload();
  });
  return <div className="space-y-3">
    <PageHeader title="Guarantee requests" />
    {data.error && <Alert tone="red">{data.error}</Alert>}
    {data.loading && !data.data && <Loading />}
    {data.data?.length === 0 && <Card>No guarantee requests yet.</Card>}
    {data.data?.map(guarantee => <Card key={guarantee.id}>
      <RecordLine title={guarantee.applicant_name ?? kindLabel(guarantee.kind)}
        description={`${kindLabel(guarantee.kind)} · ${guarantee.signer_name} · ${labels[guarantee.status]}`}
        value={formatZAR(guarantee.principal_cents)}
        actions={guarantee.status === 'REVIEW' && <Button size="sm" onClick={() => {
          setLender(''); setEmployer(''); setAuthority(''); setTerms(''); setId(guarantee.id);
        }}>Review</Button>} />
    </Card>)}
    {selected && <Modal open title="Prepare guarantee" onClose={() => setId('')}>
      <div className="space-y-3">
        <p className="text-sm">{selected.signer_name} · {formatZAR(selected.principal_cents)} · {selected.term_months} months</p>
        {lenders.error && <Alert tone="red">{lenders.error}</Alert>}
        <Field label="Accredited lender"><Select value={lenderId} onChange={event => setLender(event.target.value)}>
          <option value="">Choose lender</option>
          {lenders.data?.filter(lender => lender.accreditationStatus === 'ACCREDITED').map(lender => <option value={lender.id} key={lender.id}>{lender.name}</option>)}
        </Select></Field>
        {selected.kind === 'EMPLOYER' && <Field label="Active XTRA Payday employer ID"><Input value={employerId} onChange={event => setEmployer(event.target.value)} /></Field>}
        <Field label={selected.kind === 'EMPLOYER' ? 'Verified signing authority and payroll evidence reference' : 'Verified identity and affordability evidence reference'}>
          <Input value={authorityReference} onChange={event => setAuthority(event.target.value)} />
        </Field>
        <Field label="Approved guarantee terms"><Textarea rows={5} value={terms} onChange={event => setTerms(event.target.value)} /></Field>
        {save.error && <Alert tone="red">{save.error}</Alert>}
        <Button disabled={!lenderId || authorityReference.trim().length < 3 || terms.trim().length < 80 || (selected.kind === 'EMPLOYER' && !employerId.trim())}
          loading={save.loading} onClick={() => save.run()}>Send terms to guarantor</Button>
      </div>
    </Modal>}
  </div>;
}
