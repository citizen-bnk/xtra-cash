"use client";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, Clock3, FileCheck2, HandCoins, WalletCards } from "lucide-react";
import { formatZAR, type LoanOffer } from "@xtra/shared";
import { useApi, useAuth } from "./api";
import { Alert, Button, Card, Field, Input, Select } from "./components";
import { ManualDecisionForm } from "./lender-ai";
export function CompetitionRelease({
  applicationId,
  reviewer,
  onChanged,
}: {
  applicationId: string;
  reviewer: boolean;
  onChanged: () => void;
}) {
  const { client } = useAuth(),
    data = useApi(
      (c) =>
        c.request<{
          competition: null | { status: string; winnerLenderId: string | null };
          consented: boolean;
        }>("GET", `/loan-operations/competitions/${applicationId}/state`),
      [applicationId],
    );
  const [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act() {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/loan-operations/competitions/${applicationId}/${reviewer ? "release" : "consent"}`,
        reviewer ? { authorityReference: reference, confirmed } : { confirmed },
      );
      setConfirmed(false);
      data.reload();
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save competition action",
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestConsent() {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/loan-operations/competitions/${applicationId}/request-consent`,
        {},
      );
      onChanged();
      data.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request consent");
    } finally {
      setBusy(false);
    }
  }
  async function closeCompetition() {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/loan-operations/competitions/${applicationId}/close`,
        { authorityReference: reference, confirmed },
      );
      data.reload();
      onChanged();
      setConfirmed(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not close the competition",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-bold">
        {reviewer
          ? "Invite all accredited lenders to make an offer"
          : "Let lenders create a suitable offer"}
      </h2>
      <p className="my-2 text-sm">
        {reviewer
          ? "Use this when no current product matches, or when you want lenders to compete. After applicant consent and document review, all active accredited lenders can review the request and create a matching product. The first valid authorised offer wins."
          : "If current products do not match, you may let all active accredited lenders see a limited opportunity and review your declared finances to prepare an offer. Administration must release the request. The first valid authorised offer is presented to you; you still choose whether to accept the agreement."}
      </p>
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {data.data?.competition ? (
        <Alert tone="blue">
          {data.data.competition.status === "OPEN"
            ? "Open for lender offers. Opening or viewing does not reserve the request."
            : data.data.competition.winnerLenderId
              ? "Competition closed. The winning offer proceeds through agreement acceptance and funding controls."
              : "Competition closed without an offer. Administration will manage the next step."}
        </Alert>
      ) : (
        <div className="space-y-3">
          {reviewer && (
            <>
              <p className="text-sm">
                Applicant consent:{" "}
                {data.data?.consented ? "Recorded" : "Still required"}
              </p>
              {!data.data?.consented && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={requestConsent}
                >
                  Notify applicant to confirm consent
                </Button>
              )}
              <Field label="Release authorisation / sharing reference">
                <Input
                  maxLength={500}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            </>
          )}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {reviewer
              ? "I reviewed the request and authorise release to all active accredited lenders."
              : "I consent to this all-lender matching and offer process."}
          </label>
          <Button
            disabled={
              busy ||
              !confirmed ||
              (reviewer &&
                (!data.data?.consented || reference.trim().length < 5))
            }
            onClick={act}
          >
            {reviewer
              ? "Release for competing offers"
              : "Confirm competition consent"}
          </Button>
          {!reviewer && data.data?.consented && (
            <p className="text-sm">
              Consent recorded. Administration will review and release your
              request.
            </p>
          )}
        </div>
      )}
      {reviewer && data.data?.competition?.status === "OPEN" && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Close competition and intervene manually
          </summary>
          <Field label="Reason for closing competition">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={500}
            />
          </Field>
          <label className="my-2 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I authorise closing this competition before a winning offer.
          </label>
          <Button
            variant="secondary"
            disabled={busy || !confirmed || reference.trim().length < 5}
            onClick={closeCompetition}
          >
            Close competition
          </Button>
        </details>
      )}
    </Card>
  );
}
type CandidateOffer = { id: string; rank: number; lenderName: string; offerName: string; monthlyInterestRateBps: number; initiationFeeCents: number; monthlyServiceFeeCents: number; monthlyInstallmentCents: number; totalRepayableCents: number; costOfCreditCents: number };
export function CandidateOffers({ applicationId, onSelected }: { applicationId: string; onSelected: () => void }) {
  const { client } = useAuth();
  const offers = useApi((c) => c.request<CandidateOffer[]>('GET', `/loan-operations/competitions/${applicationId}/offers`), [applicationId]);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  if (!offers.data?.length && !offers.error) return <Alert tone="blue">Your request is with active accredited lenders. You will be notified when an offer is ready.</Alert>;
  async function select(id: string) {
    setBusy(id); setError('');
    try { await client.request('POST', `/loan-operations/competitions/${applicationId}/offers/${id}/select`, {}); onSelected(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not select this offer'); }
    finally { setBusy(''); }
  }
  return (
    <section className="space-y-3" aria-label="Lender offers">
      <h2 className="text-lg font-bold">Choose your offer</h2>
      {(error || offers.error) && <Alert tone="red">{error || offers.error}</Alert>}
      {offers.data?.map(offer => (
        <Card key={offer.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-bold text-ink">{offer.offerName}</h3>
              <p className="text-sm text-ink">{offer.lenderName}</p>
            </div>
            {offer.rank === 1 && offers.data!.length > 1 && <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-900">Lowest total cost</span>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm text-ink">
            <div><dt>Monthly instalment</dt><dd className="font-bold">{formatZAR(offer.monthlyInstallmentCents)}</dd></div>
            <div><dt>Total repayment</dt><dd className="font-bold">{formatZAR(offer.totalRepayableCents)}</dd></div>
          </dl>
          <details className="text-sm text-ink">
            <summary className="cursor-pointer font-semibold text-purple-800">Interest and fees</summary>
            <p className="mt-2">{(offer.monthlyInterestRateBps / 100).toFixed(2)}% monthly interest · {formatZAR(offer.initiationFeeCents)} initiation fee · {formatZAR(offer.monthlyServiceFeeCents)} monthly service fee</p>
          </details>
          <Button className="w-full sm:w-auto" loading={busy === offer.id} disabled={!!busy} onClick={() => select(offer.id)}>Review agreement <ArrowRight size={16} /></Button>
        </Card>
      ))}
    </section>
  );
}

export function LoanJourney({
  status,
  reviewer,
  externalPayment = false,
}: {
  status: string;
  reviewer: boolean;
  externalPayment?: boolean;
}) {
  const steps = [
    { label: "Request submitted", icon: HandCoins },
    { label: "Lenders reviewing", icon: Clock3 },
    { label: "Review loan offers", icon: BadgeCheck },
    { label: "Sign agreement", icon: FileCheck2 },
    { label: "Funds to wallet", icon: WalletCards },
    { label: "Manage & repay", icon: CheckCircle2 },
  ];
  const index = ["SUBMITTED", "REFERRED", "UNDER_REVIEW", "ACTION_REQUIRED"].includes(status)
    ? 1
    : status === "OFFERED" ? 2
      : status === "ACCEPTED" ? 3
        : status === "FUNDING_PENDING" ? 4
          : status === "DISBURSED" ? 5 : 0;
  const complete = status === "DISBURSED" ? 6 : status === "FUNDING_PENDING" ? 3 : status === "ACCEPTED" ? 2 : status === "OFFERED" ? 1 : 0;
  const currentStep = steps[index];
  const StepIcon = currentStep.icon;
  const message = status === "OFFERED"
    ? "Your lender has sent an offer. Compare the full costs and repayment schedule, then accept only if you agree."
    : status === "ACCEPTED"
      ? "Your agreement is accepted. After the lender sends the funds, XTRA-CASH admin confirms the transfer and credits your wallet."
      : status === "FUNDING_PENDING"
        ? "Your funds are being confirmed for wallet credit. No further action is needed right now."
        : status === "DISBURSED"
          ? externalPayment ? "Your wallet has been credited. Open your loan to view the repayment schedule and make payments." : "Your wallet is funded. Check your wallet balance and loan repayment schedule."
          : status === "ACTION_REQUIRED"
            ? "Your lender needs a little more information. Open the application activity to respond."
            : status === "DECLINED"
              ? "This request was declined. Review the recorded reason in your application activity."
              : reviewer
                ? "Active accredited lenders are reviewing your request. You will be notified when offers are available."
                : "Your request is with active accredited lenders. We’ll notify you when there is an offer or an action to take.";
  return (
    <Card className="overflow-hidden border-[#e7d8f1] p-0">
      <div className="bg-gradient-to-r from-[#32144e] via-[#5c2394] to-[#a617d3] px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/70">Loan journey</p><h2 className="mt-0.5 text-base font-bold text-white">{currentStep.label}</h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><StepIcon className="h-5 w-5" /></span></div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#fb9320] transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="p-4">
        <ol className="grid grid-cols-3 gap-y-3 sm:grid-cols-6">
          {steps.map(({ label, icon: Icon }, i) => <li key={label} className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center"><span className={`grid h-8 w-8 place-items-center rounded-full ${i <= complete ? "bg-emerald-100 text-emerald-700" : i === index ? "bg-[#f3e7f8] text-brand-purple ring-2 ring-brand/25" : "bg-surface text-muted"}`}>{i < complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}</span><span className={`text-[10px] leading-tight ${i === index ? "font-bold text-ink" : "text-muted"}`}>{label}</span></li>)}
        </ol>
        <p className="mt-4 rounded-xl bg-[#f8f2fc] px-3 py-2.5 text-sm leading-relaxed text-ink">{message}</p>
      </div>
    </Card>
  );
}
