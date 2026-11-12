"use client";
import React, { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { CandidateOffers, LoanJourney } from "./loan-competition";
import {
  formatZAR,
  type LoanOffer,
  type PersonalSettlement,
  type WalletState,
  type MoneyMovement,
  type MoneyConfiguration,
} from "@xtra/shared";
import { useApi, useAuth } from "./api";
import { DecisionAiWorkspace, ManualDecisionForm } from "./lender-ai";
import { LenderReviewWorkspace } from "./lender-review";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Loading,
  Modal,
  MoneyInput,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from "./components";
import { RecordActions } from "./record-actions";
const reviewStates = [
  "SUBMITTED",
  "REFERRED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
];
export function PersonalSettlementView({
  applicationId,
  reviewer = false,
}: {
  applicationId: string;
  reviewer?: boolean;
}) {
  const { client, me } = useAuth();
  const [intervening, setIntervening] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [preparationMode, setPreparationMode] = useState<"AI" | "MANUAL">(
    "AI",
  );
  const [decisionOpen, setDecisionOpen] = useState(false), [quickAction, setQuickAction] = useState<null | 'INFO' | 'HOLD' | 'DECLINE'>(null), [decisionNote, setDecisionNote] = useState('');
  const data = useApi(
    (c) =>
      c.request<PersonalSettlement>(
        "GET",
        `/personal-loans/applications/${applicationId}`,
      ),
    [applicationId],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [ack, setAck] = useState(false),
    [message, setMessage] = useState("");
  const [editOpen, setEditOpen] = useState(false), [editAmount, setEditAmount] = useState(''), [editTerm, setEditTerm] = useState(''), [editPurpose, setEditPurpose] = useState('Other'), [editIncome, setEditIncome] = useState(''), [editExpenses, setEditExpenses] = useState('');
  const [documentType, setDocumentType] = useState('BANK_STATEMENT'), [documentBusy, setDocumentBusy] = useState(false), [documentError, setDocumentError] = useState(''), [documentConsent, setDocumentConsent] = useState(false), [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  async function act(action: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/personal-loans/applications/${applicationId}/${action}`,
        body,
      );
      setPassword("");
      setAck(false);
      data.reload();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveAmendment() {
    setBusy(true); setError('');
    try {
      await client.request('PUT', `/personal-loans/applications/${applicationId}`, { amountCents: Math.round(Number(editAmount) * 100), termMonths: Number(editTerm), purpose: editPurpose, ...(isOffice ? { monthlyIncomeCents: Math.round(Number(editIncome) * 100), monthlyExpensesCents: Math.round(Number(editExpenses) * 100) } : {}) });
      setEditOpen(false); data.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save these changes'); }
    finally { setBusy(false); }
  }
  async function uploadApplicationDocument(file?: File) {
    if (!file) return;
    setDocumentBusy(true); setDocumentError('');
    try { const form = new FormData(); form.set('file', file); form.set('type', documentType); form.set('consent', 'true'); await client.request('POST', `/personal-loans/applications/${applicationId}/documents`, form); data.reload(); }
    catch (e) { setDocumentError(e instanceof Error ? e.message : 'Could not attach this document'); }
    finally { setDocumentBusy(false); }
  }
  async function viewApplicationDocument(documentId: string) {
    try { const blob = await client.blob(`/personal-loans/applications/${applicationId}/documents/${documentId}/file`); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (e) { setDocumentError(e instanceof Error ? e.message : 'Could not open this document'); }
  }
  if (data.loading && !data.data) return <Loading />;
  if (!data.data)
    return <Alert tone="red">{data.error || "Application unavailable"}</Alert>;
  const d = data.data,
    ag = d.agreement,
    isOffice = me?.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
  const canReview = reviewer && (!isOffice || intervening) && (reviewStates.includes(d.application.status) || d.humanReviewPending);
  if (d.sharedReadOnly)
    return (
      <div className="space-y-5">
        <PageHeader
          title="Shared loan application"
          subtitle="Viewing access granted by XTRA-CASH administration"
        />
        <Alert tone="blue">
          You can view this request. The assigned lender retains decision
          authority. This access does not allow offers, changes, documents,
          agreements or funding.
        </Alert>
        <Card>
          <p>
            {formatZAR(d.application.amountCents)} · {d.application.termMonths}{" "}
            months
          </p>
          <p>{d.application.purpose}</p>
          <StatusBadge status={d.application.status} />
          <p className="mt-3">
            Monthly income: {formatZAR(d.application.monthlyIncomeCents)} ·
            Expenses: {formatZAR(d.application.monthlyExpensesCents)}
          </p>
        </Card>
        <Button variant="secondary" onClick={data.reload}>
          Refresh access
        </Button>
      </div>
    );
  function download() {
    if (!ag) return;
    const blob = new Blob(
      [
        ag.content +
          `\n\nDocument fingerprint: ${ag.digest}\nAcceptance: ${ag.acceptedAt ?? "Not accepted"}\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `XTRA-CASH-agreement-${applicationId}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title={isOffice ? "Loan progress and intervention" : reviewer ? "Review request and make an offer" : "Your loan application"}
        subtitle={`${formatZAR(d.application.amountCents)} · ${d.application.termMonths} months · ${d.application.purpose}`}
        actions={reviewer ? <RecordActions actions={[
          { label: 'Refresh application', onSelect: data.reload },
          ...(isOffice ? [{ label: intervening ? 'Exit lender controls' : 'Open lender controls', onSelect: () => setIntervening(!intervening) }] : []),
          ...(isOffice && reviewStates.includes(d.application.status) ? [{ label: 'Amend application', onSelect: () => { setEditAmount((d.application.amountCents / 100).toFixed(2)); setEditTerm(String(d.application.termMonths)); setEditPurpose(d.application.purpose); setEditIncome((d.application.monthlyIncomeCents / 100).toFixed(2)); setEditExpenses((d.application.monthlyExpensesCents / 100).toFixed(2)); setEditOpen(true); } }] : []),
          ...(canReview ? [
            { label: 'Approve & make an offer · AI assist', onSelect: () => { setPreparationMode('AI'); setDecisionOpen(true); } },
            { label: 'Guided decision form', onSelect: () => { setPreparationMode('MANUAL'); setDecisionOpen(true); } },
            { label: 'Request more information', onSelect: () => { setQuickAction('INFO'); setDecisionNote(''); } },
            { label: 'Keep under review', onSelect: () => { setQuickAction('HOLD'); setDecisionNote(''); } },
            { label: 'Decline request', onSelect: () => { setQuickAction('DECLINE'); setDecisionNote(''); } },
          ] : []),
        ]} label="Application actions" /> : <Button variant="secondary" size="sm" onClick={data.reload}>Refresh</Button>}
      />
      <StatusBadge status={d.application.status} />
      <Card className={reviewer ? "space-y-2 p-3" : "space-y-3"}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Application details</h2>{reviewStates.includes(d.application.status) && !reviewer && <Button variant="secondary" onClick={() => { setEditAmount((d.application.amountCents / 100).toFixed(2)); setEditTerm(String(d.application.termMonths)); setEditPurpose(d.application.purpose); setEditIncome((d.application.monthlyIncomeCents / 100).toFixed(2)); setEditExpenses((d.application.monthlyExpensesCents / 100).toFixed(2)); setEditOpen(true); }}>Edit application</Button>}</div>
        {reviewer ? <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"><strong>{formatZAR(d.application.amountCents)}</strong><span>{d.application.termMonths} months</span><span className="min-w-0 truncate text-muted">{d.application.purpose}</span><span className="ml-auto text-xs text-muted">{formatZAR(d.application.monthlyIncomeCents - d.application.monthlyExpensesCents)} disposable / month</span></div> : <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Requested amount</dt><dd className="font-semibold">{formatZAR(d.application.amountCents)}</dd></div><div><dt className="text-muted">Repayment term</dt><dd className="font-semibold">{d.application.termMonths} months</dd></div><div><dt className="text-muted">Purpose</dt><dd className="font-semibold">{d.application.purpose}</dd></div><div><dt className="text-muted">Submitted</dt><dd className="font-semibold">{new Date(d.application.createdAt).toLocaleString('en-ZA')}</dd></div><div><dt className="text-muted">Monthly income used</dt><dd className="font-semibold">{formatZAR(d.application.monthlyIncomeCents)}</dd></div><div><dt className="text-muted">Monthly expenses used</dt><dd className="font-semibold">{formatZAR(d.application.monthlyExpensesCents)}</dd></div><div><dt className="text-muted">Application reference</dt><dd className="break-all font-mono text-xs">{d.application.id}</dd></div></dl>}
      </Card>
      <Card className={reviewer ? 'hidden' : 'space-y-3'}><div><h2 className="text-lg font-bold">Documents submitted for this application</h2><p className="text-sm text-muted">These files are saved in the applicant’s profile data vault and linked to this loan request.</p></div>{d.documents.map(doc => <div key={doc.id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{doc.originalName}</p><p className="text-xs text-muted">{doc.type.replaceAll('_',' ')} · {new Date(doc.createdAt).toLocaleDateString('en-ZA')} · {doc.status}</p></div><Button variant="secondary" onClick={() => void viewApplicationDocument(doc.id)}>View document</Button></div>{doc.processingNote && <p className="mt-2 text-sm text-muted">{doc.processingNote}</p>}{doc.reviews.map((review,i) => <p key={i} className="mt-2 text-xs text-muted">{review.status} · {new Date(review.createdAt).toLocaleString('en-ZA')}: {review.comment}</p>)}</div>)}{!d.documents.length && <Alert tone="blue">No documents have been attached to this application yet.</Alert>}{reviewStates.includes(d.application.status) && <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-[1fr_1fr] sm:items-end"><Field label="Document type"><Select value={documentType} onChange={e=>setDocumentType(e.target.value)}><option value="BANK_STATEMENT">Bank statement</option><option value="PROOF_OF_INCOME">Proof of income</option><option value="ID_DOCUMENT">Identity document</option><option value="PROOF_OF_ADDRESS">Proof of address</option></Select></Field><Field label="Choose PDF, JPG or PNG"><input className="block w-full rounded-xl border border-line p-2 text-sm" type="file" accept="application/pdf,image/jpeg,image/png" disabled={documentBusy} onChange={e=>setSelectedDocument(e.target.files?.[0] ?? null)} /></Field></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={documentConsent} onChange={e=>setDocumentConsent(e.target.checked)} /><span>I confirm this file may be attached to this application and stored in the applicant’s profile data vault.</span></label><Button loading={documentBusy} disabled={!selectedDocument || !documentConsent} onClick={async()=>{await uploadApplicationDocument(selectedDocument ?? undefined);setSelectedDocument(null);setDocumentConsent(false);}}>Attach document</Button><p className="text-xs text-muted">Maximum 10 MB</p></div>}{documentBusy && <p className="text-sm text-muted">Adding file to this application and the profile vault…</p>}{documentError && <Alert tone="red">{documentError}</Alert>}</Card>
      <Card className={reviewer ? 'hidden' : 'space-y-3'}><h2 className="text-lg font-bold">Application activity</h2>{d.timeline.length ? d.timeline.map(event => <div key={event.id} className="border-l-2 border-brand/30 pl-3"><p className="text-xs text-muted">{new Date(event.createdAt).toLocaleString('en-ZA')} · {event.status}</p><p className="text-sm">{event.message}</p></div>) : <p className="text-sm text-muted">No updates yet.</p>}</Card>
      {!reviewer && <LoanJourney status={d.application.status} reviewer={false} externalPayment={!!d.externalPayment} />}
      {reviewer && (!isOffice || intervening) && <LenderReviewWorkspace applicationId={applicationId} />}
      {d.depositReference && !reviewer && <Card><h2 className="font-semibold">Bank deposit reference</h2><p className="my-2 font-mono text-lg font-bold">{d.depositReference}</p><p className="text-sm text-muted">The lender must use this exact reference when paying the XTRA-CASH settlement account so the deposit can be matched to this loan.</p></Card>}
      {d.externalPayment && !reviewer && <Card className="overflow-hidden border-emerald-200 p-0"><div className="bg-gradient-to-r from-[#16794b] to-[#2a9d8f] px-4 py-4 text-white"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><BadgeCheck className="h-6 w-6" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/75">Funds disbursed</p><h2 className="font-bold text-white">Money is in your wallet</h2></div></div><p className="mt-3 text-2xl font-black">{formatZAR(d.externalPayment.amountCents)}</p></div><div className="space-y-3 p-4"><p className="text-sm">Credited {new Date(d.externalPayment.confirmedAt).toLocaleString('en-ZA')}. {d.externalPayment.note}</p><p className="text-xs text-muted">Deposit reference: <span className="font-mono font-semibold">{d.externalPayment.depositReference}</span>. Bank transfers will be available when wallet withdrawals are enabled.</p>{!isOffice && <div className="grid grid-cols-2 gap-2"><a href="/app/card" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-purple/30 px-3 text-center text-xs font-bold text-brand-purple">View my card</a><a href="/app/loans" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-[#8c00cf] to-[#d91f63] px-3 text-center text-xs font-bold text-white">Repayment plan</a></div>}</div></Card>}
      {isOffice && !reviewer && <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><p className="text-sm text-muted">Staff oversight · Customer and lender manage this loan.</p><Button variant="secondary" onClick={() => setIntervening(!intervening)}>{intervening ? 'Close intervention' : 'Intervene'}</Button></div>}
      {isOffice && d.application.status === "ACCEPTED" && (
        <Alert tone="blue">The applicant accepted the agreement. Once the lender has paid the customer, record the external payment confirmation below.</Alert>
      )}
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {!d.configuration.enabled && !d.externalPayment && (
        <Alert tone="amber">
          The lender pays the loan amount into the XTRA-CASH settlement account using the deposit reference. After an administrator confirms receipt, the full loan amount is credited to the applicant’s XTRA-CASH wallet.
        </Alert>
      )}
      {d.application.reviewNotes && !reviewer && (
        <Card>
          <h2 className="font-semibold">Latest update</h2>
          <p className="mt-2">{d.application.reviewNotes}</p>
        </Card>
      )}
      {!reviewer && !ag && reviewStates.includes(d.application.status) && <CandidateOffers applicationId={applicationId} onSelected={data.reload} />}
      {isOffice && intervening && !reviewer && reviewStates.includes(d.application.status) && <Card className="space-y-3"><Field label="Intervention message"><Textarea value={message} maxLength={500} onChange={e => setMessage(e.target.value)}/></Field><Button loading={busy} disabled={message.trim().length < 3} onClick={() => act('information', {message})}>Request clarification</Button></Card>}
      <Modal open={decisionOpen} title={preparationMode === 'AI' ? 'Prepare lender offer' : 'Lender decision'} onClose={() => setDecisionOpen(false)}>
        {preparationMode === 'AI' ? <DecisionAiWorkspace applicationId={applicationId} onAdvanced={() => { setDecisionOpen(false); data.reload(); }} /> : <ManualDecisionForm request={{ amountCents: d.application.amountCents, termMonths: d.application.termMonths, offerId: d.application.offerId }} applicationId={applicationId} onAdvanced={() => { setDecisionOpen(false); data.reload(); }} />}
      </Modal>
      <Modal open={!!quickAction} title={quickAction === 'INFO' ? 'Request more information' : quickAction === 'HOLD' ? 'Keep under review' : 'Decline request'} onClose={() => setQuickAction(null)}>
        <div className="space-y-4"><p className="text-sm text-muted">Add a clear note. The applicant and lender will see the recorded update in the application timeline.</p>{quickAction === 'HOLD' && <Alert tone="blue">This records the application as under review with your note. A separate paused status is not configured.</Alert>}<Field label={quickAction === 'INFO' ? 'What should the applicant provide?' : quickAction === 'HOLD' ? 'Review note' : 'Reason for declining'}><Textarea value={decisionNote} maxLength={500} onChange={e => setDecisionNote(e.target.value)} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setQuickAction(null)}>Cancel</Button><Button disabled={decisionNote.trim().length < 3} loading={busy} onClick={async () => { const action = quickAction; if (!action) return; const ok = action === 'INFO' ? await act('information', { message: decisionNote.trim() }) : await act('review', { action: action === 'DECLINE' ? 'DECLINE' : 'REVIEW', notes: decisionNote.trim() }); if (ok) { setQuickAction(null); setDecisionNote(''); setDecisionOpen(false); } }}>{quickAction === 'INFO' ? 'Send request' : quickAction === 'HOLD' ? 'Keep under review' : 'Confirm decline'}</Button></div></div>
      </Modal>
      <Modal open={editOpen} title={isOffice ? 'Amend loan application' : 'Edit loan application'} onClose={() => setEditOpen(false)}>
        <div className="space-y-4"><Alert tone={isOffice ? 'amber' : 'blue'}>{isOffice ? 'Admin amendments are recorded in the application history. Financial profile edits are saved to the applicant’s profile and used by future applications.' : 'You can update the requested amount, term and purpose while the lender is reviewing your request.'}</Alert><Field label="Requested amount (ZAR)"><Input type="number" min="500" max="100000" step="50" value={editAmount} onChange={e=>setEditAmount(e.target.value)} /></Field><Field label="Repayment term (months)"><Select value={editTerm} onChange={e=>setEditTerm(e.target.value)}>{Array.from({length:24},(_,i)=><option key={i+1} value={i+1}>{i+1} months</option>)}</Select></Field><Field label="Purpose"><Select value={editPurpose} onChange={e=>setEditPurpose(e.target.value)}>{['Home & repairs','Education','Medical','Transport','Debt consolidation','Other'].map(x=><option key={x}>{x}</option>)}</Select></Field>{isOffice && <><Field label="Applicant monthly income (ZAR)"><Input type="number" min="1" step="50" value={editIncome} onChange={e=>setEditIncome(e.target.value)} /></Field><Field label="Applicant monthly expenses (ZAR)"><Input type="number" min="0" step="50" value={editExpenses} onChange={e=>setEditExpenses(e.target.value)} /></Field></>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={()=>setEditOpen(false)}>Cancel</Button><Button loading={busy} disabled={!Number.isFinite(Number(editAmount)) || Number(editAmount)<500 || Number(editAmount)>100000 || (isOffice && (!Number.isFinite(Number(editIncome)) || Number(editIncome)<=0 || !Number.isFinite(Number(editExpenses)) || Number(editExpenses)<0))} onClick={()=>void saveAmendment()}>Save changes</Button></div></div>
      </Modal>
      {d.humanReviewPending && (
        <Alert tone="amber">
          The applicant has requested human review. Automatic offers and
          agreement acceptance are paused until the review is resolved.
        </Alert>
      )}
      {!reviewer &&
        d.application.lenderId &&
        [...reviewStates, "OFFERED"].includes(d.application.status) && (
          <Card className="space-y-3">
            <Field label="Questions for a human reviewer">
              <Textarea
                value={message}
                maxLength={500}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              loading={busy}
              disabled={message.trim().length < 3}
              onClick={() => act("human-review", { message })}
            >
              Request human review
            </Button>
          </Card>
        )}
      {ag && (
        <Card className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="text-xl font-bold">
              Your quotation and credit agreement
            </h2>
            <Button variant="secondary" onClick={download}>
              Save a copy
            </Button>
          </div>
          <p className="text-sm">
            Offer expires {new Date(ag.expiresAt).toLocaleString("en-ZA")}.{" "}
            {ag.acceptedAt
              ? `Accepted ${new Date(ag.acceptedAt).toLocaleString("en-ZA")}.`
              : ""}
          </p>
          <pre className="max-h-[36rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm">
            {ag.content}
          </pre>
          <p className="break-all text-xs text-muted">
            Document fingerprint: {ag.digest}
          </p>
          {!reviewer && d.application.status === "OFFERED" && (
            <div className="space-y-3">
              {!d.configuration.agreementsEnabled && (
                <Alert tone="amber">
                  Agreement acceptance will become available after lender and
                  legal activation.
                </Alert>
              )}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I have read this quotation and agreement and accept these
                specific terms.
              </label>
              <Field label="Confirm your account password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button
                loading={busy}
                disabled={
                  !ack ||
                  !password ||
                  !d.configuration.agreementsEnabled ||
                  new Date(ag.expiresAt).getTime() <= Date.now()
                }
                onClick={() =>
                  act("accept", {
                    digest: ag.digest,
                    acknowledged: true,
                    password,
                  })
                }
              >
                Accept agreement
              </Button>
            </div>
          )}
          {reviewer && isOffice && d.application.status === 'ACCEPTED' && <div className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Confirm deposit and credit wallet</h3><p className="text-sm">Amount to credit: {formatZAR(ag.terms.principalCents)}. Deposit reference: <strong>{d.depositReference}</strong></p><Field label="Receipt note" hint="Record the settlement account receipt details for reconciliation. Do not include full bank account numbers."><Textarea maxLength={1000} value={paymentNote} onChange={e=>setPaymentNote(e.target.value)}/></Field><label className="flex gap-2 text-sm"><input type="checkbox" checked={paymentConfirmed} onChange={e=>setPaymentConfirmed(e.target.checked)}/>I confirm this lender deposit has been received in the XTRA-CASH settlement account and authorise crediting the applicant’s wallet.</label><Button loading={busy} disabled={!paymentConfirmed || paymentNote.trim().length < 3} onClick={()=>act('external-payment',{confirmed:true,note:paymentNote})}>Confirm receipt and credit wallet</Button>{d.configuration.enabled && intervening && <Button variant="secondary" loading={busy} disabled={ag.approvedBy === me?.id} onClick={()=>act('fund')}>Use integrated wallet funding</Button>}</div>}
          {ag.loanId && (
            <a
              className="block font-semibold underline"
              href={reviewer ? isOffice ? "/loans" : "/lender/loans" : `/app/loans/${ag.loanId}`}
            >
              View loan and repayment schedule
            </a>
          )}
        </Card>
      )}
      {!reviewer && d.application.status === "ACTION_REQUIRED" && (
        <Card className="space-y-3">
          <Field
            label={
              reviewer
                ? "Update or information request for the applicant"
                : "Reply to the information request"
            }
            hint="Do not enter bank account numbers, identity numbers or passwords here. Use the approved secure document process for supporting evidence."
          >
            <Textarea
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy}
              disabled={message.trim().length < 3}
              onClick={() =>
                act(reviewer ? "information" : "respond", { message })
              }
            >
              {reviewer ? "Request information" : "Send reply for review"}
            </Button>
            {reviewer && (
              <Button
                variant="danger"
                loading={busy}
                disabled={message.trim().length < 3}
                onClick={() =>
                  act("review", { action: "DECLINE", notes: message })
                }
              >
                Decline application
              </Button>
            )}
          </div>
        </Card>
      )}
      {!reviewer &&
        [
          "SUBMITTED",
          "REFERRED",
          "UNDER_REVIEW",
          "ACTION_REQUIRED",
          "OFFERED",
          "ACCEPTED",
        ].includes(d.application.status) && (
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => act("cancel")}
          >
            Cancel application before funding
          </Button>
        )}
      <Card>
        <h2 className="mb-3 text-lg font-bold">Application timeline</h2>
        <ol className="space-y-3">
          {d.timeline.length ? (
            d.timeline.map((e) => (
              <li key={e.id}>
                <StatusBadge status={e.status} />
                <p className="mt-1 text-sm">{e.message}</p>
                <time className="text-xs text-muted">
                  {new Date(e.createdAt).toLocaleString("en-ZA")}
                </time>
              </li>
            ))
          ) : (
            <li className="text-sm">
              Your application has been submitted. Updates will appear here.
            </li>
          )}
        </ol>
      </Card>
      {d.funding.map((m) => (
        <Card key={m.id}>
          <div className="flex justify-between gap-3">
            <span>Wallet funding · {formatZAR(m.amountCents)}</span>
            <StatusBadge status={m.status} />
          </div>
        </Card>
      ))}
    </div>
  );
}
export function WalletTransferView() {
  const { client, refreshMe } = useAuth();
  const data = useApi((c) => c.request<WalletState>("GET", "/wallet"));
  const banks = useApi((c) =>
    c.request<{ code: string; name: string }[]>("GET", "/wallet/banks"),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [bankCode, setBank] = useState(""),
    [accountNumber, setAccount] = useState(""),
    [accountType, setType] = useState("CURRENT"),
    [beneficiaryId, setBeneficiary] = useState(""),
    [amount, setAmount] = useState<number | null>(null),
    [clientKey, setKey] = useState("");
  async function action(route: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await client.request("POST", route, body);
      setPassword("");
      setAccount("");
      if (route === "/wallet/withdrawals") {
        setKey("");
        setAmount(null);
      }
      data.reload();
      await refreshMe();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete banking request",
      );
      data.reload();
    } finally {
      setBusy(false);
    }
  }
  if (data.loading && !data.data) return <Loading />;
  if (!data.data)
    return <Alert tone="red">{data.error || "Wallet unavailable"}</Alert>;
  const d = data.data;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Wallet and bank transfers"
        subtitle="Transfer available wallet cash to your verified own-name bank account."
        actions={
          <Button variant="secondary" onClick={data.reload}>
            Refresh
          </Button>
        }
      />
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      <Card className="space-y-3 bg-brand-purple text-white">
        <div><p className="text-sm text-white/75">Available cash</p><p className="mt-1 text-3xl font-black tabular-nums">{formatZAR(d.availableCents)}</p></div>
        <div className="flex items-center justify-between border-t border-white/20 pt-3 text-sm"><span className="text-white/75">Reserved for bank transfers</span><strong className="tabular-nums">{formatZAR(d.heldCents)}</strong></div>
      </Card>
      {!d.configuration.enabled && (
        <Alert tone="amber">
          Bank verification and EFT withdrawals are not active yet. Your wallet balance is available to view; transfers cannot be submitted until this service is enabled.
        </Alert>
      )}
      {d.configuration.enabled && <>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Your bank accounts</h2>
        {d.beneficiaries.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <span>
              {b.bankCode} · ending {b.last4}
            </span>
            <StatusBadge status={b.status} />
            {b.status !== "VERIFIED" && (
              <Button
                size="sm"
                disabled={!d.configuration.enabled}
                loading={busy}
                onClick={() =>
                  action(`/wallet/beneficiaries/${b.id}/verify`, {})
                }
              >
                Check verification
              </Button>
            )}
          </div>
        ))}
        <Field label="Bank">
          <Select
            value={bankCode}
            disabled={!d.configuration.enabled}
            onChange={(e) => setBank(e.target.value)}
          >
            <option value="">Select your bank</option>
            {banks.data?.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        {banks.error && <Alert tone="red">{banks.error}</Alert>}
        <Field label="Your bank account number">
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={accountNumber}
            maxLength={20}
            onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Account type">
          <Select value={accountType} onChange={(e) => setType(e.target.value)}>
            <option value="CURRENT">Current</option>
            <option value="SAVINGS">Savings</option>
            <option value="TRANSMISSION">Transmission</option>
          </Select>
        </Field>
        <Field label="Confirm account password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          loading={busy}
          disabled={
            !d.configuration.enabled ||
            !password ||
            !bankCode ||
            accountNumber.length < 6
          }
          onClick={() =>
            action("/wallet/beneficiaries", {
              bankCode,
              accountNumber,
              accountType,
              password,
            })
          }
        >
          Verify my bank account
        </Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Transfer to my bank</h2>
        <Field label="Verified account">
          <Select
            value={beneficiaryId}
            onChange={(e) => {
              setBeneficiary(e.target.value);
              setKey("");
            }}
          >
            <option value="">Choose your account</option>
            {d.beneficiaries
              .filter((b) => b.status === "VERIFIED")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bankCode} · ending {b.last4}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Transfer amount">
          <MoneyInput
            cents={amount}
            onCents={(v) => {
              setAmount(v);
              setKey("");
            }}
          />
        </Field>
        <p className="text-sm text-muted">
          Transfer fee charged by XTRA-CASH: R0.00 for this release. Bank
          arrival depends on the supported rail and bank processing. Money is
          reserved while processing.
        </p>
        <Field label="Confirm account password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          disabled={
            !d.configuration.enabled ||
            !beneficiaryId ||
            !password ||
            !amount ||
            amount > d.availableCents
          }
          loading={busy}
          onClick={() => {
            const key = clientKey || crypto.randomUUID();
            setKey(key);
            void action("/wallet/withdrawals", {
              beneficiaryId,
              amountCents: amount,
              clientKey: key,
              password,
            });
          }}
        >
          Confirm {formatZAR(amount ?? 0)} transfer
        </Button>
      </Card>
      </>}
      <Card>
        <h2 className="mb-3 font-bold">Recent money movements</h2>
        <div className="divide-y divide-line">
          {d.movements.map((m) => (
            <div key={m.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{m.kind === "FUNDING" ? "Loan funding" : "Bank transfer"}</p><p className="truncate text-xs text-muted">{new Date(m.createdAt).toLocaleDateString("en-ZA")} · Ref {m.id}</p></div>
              <strong className="shrink-0 text-sm tabular-nums">{formatZAR(m.amountCents)}</strong>
              <StatusBadge status={m.status} />
            </div>
          ))}
          {!d.movements.length && <p className="py-2 text-sm text-muted">No money movements yet.</p>}
        </div>
      </Card>
    </div>
  );
}
export function MoneyOperationsView() {
  const { client } = useAuth();
  const reconciliation = useApi((c) =>
    c.request<{
      trialBalanceCents: number;
      walletMismatches: unknown[];
      reservationMismatches: unknown[];
      note: string;
    }>("GET", "/money/reconciliation"),
  );
  const data = useApi((c) =>
    c.request<{
      configuration: MoneyConfiguration;
      movements: MoneyMovement[];
      unresolved: number;
    }>("GET", "/money/operations"),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function process() {
    setBusy(true);
    setError("");
    try {
      await client.request("POST", "/money/process", {});
      data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check provider");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Funding and bank transfers"
        subtitle="Review pending instructions and provider outcomes."
        actions={
          <Button variant="secondary" onClick={data.reload}>
            Refresh
          </Button>
        }
      />
      {error && <Alert tone="red">{error}</Alert>}
      {data.error && <Alert tone="red">{data.error}</Alert>}
      {reconciliation.error && <Alert tone="red">{reconciliation.error}</Alert>}
      {reconciliation.data && (
        <Card className="space-y-2">
          <h2 className="text-lg font-bold">Internal accounting checks</h2>
          <p>
            Trial balance difference:{" "}
            {formatZAR(reconciliation.data.trialBalanceCents)}. Wallet
            mismatches: {reconciliation.data.walletMismatches.length}.
            Reservation mismatches:{" "}
            {reconciliation.data.reservationMismatches.length}.
          </p>
          <p className="text-sm text-muted">{reconciliation.data.note}</p>
          <Button variant="secondary" size="sm" onClick={reconciliation.reload}>
            Recheck accounting
          </Button>
        </Card>
      )}
      {data.data && (
        <>
          <Alert tone={data.data.configuration.enabled ? "blue" : "amber"}>
            {data.data.configuration.enabled
              ? "Banking connection enabled."
              : "Banking is awaiting activation."}{" "}
            Unresolved in latest 200: {data.data.unresolved}.
          </Alert>
          {!data.data.configuration.enabled && (
            <Card>
              <p className="font-semibold">Activation requirements</p>
              <ul className="mt-2 list-inside list-disc text-sm">
                {data.data.configuration.missing.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Card>
          )}
          <Button
            loading={busy}
            disabled={!data.data.configuration.enabled}
            onClick={process}
          >
            Check queued instructions with provider
          </Button>
          {data.data.movements.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {m.kind} · {formatZAR(m.amountCents)}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <p className="mt-2 break-all text-xs">
                Instruction {m.id} · {m.attempts} checks ·{" "}
                {m.providerReference || "Awaiting provider reference"}
              </p>
              {m.failureCode && (
                <p className="text-sm">Provider code: {m.failureCode}</p>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
