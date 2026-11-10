"use client";
import { useState } from "react";
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
  if (!offers.data?.length && !offers.error) return <Alert tone="blue">Your request is with active accredited lenders. XTRA-CASH will notify you when three comparable offers are ready.</Alert>;
  async function select(id: string) {
    setBusy(id); setError('');
    try { await client.request('POST', `/loan-operations/competitions/${applicationId}/offers/${id}/select`, {}); onSelected(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not select this offer'); }
    finally { setBusy(''); }
  }
  return <section className="space-y-3"><div><h2 className="text-xl font-bold">Your top offers</h2><p className="text-sm text-muted">Ranked by lowest total repayment. Selecting an offer creates the agreement; it does not move money.</p></div>{offers.data && offers.data.length < 3 ? <Alert tone="blue">{offers.data.length} of 3 offers received. We’ll notify you when comparison is ready.</Alert> : null}{(error || offers.error) ? <Alert tone="red">{error || offers.error}</Alert> : null}<div className="grid gap-3 lg:grid-cols-3">{offers.data?.map((offer) => <Card key={offer.id} className={offer.rank === 1 ? 'border-brand/40' : ''}><div className="flex items-center justify-between"><strong>#{offer.rank} {offer.offerName}</strong>{offer.rank === 1 ? <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold">Lowest cost</span> : null}</div><p className="mt-1 text-sm text-muted">{offer.lenderName}</p><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt>Monthly instalment</dt><dd className="font-bold">{formatZAR(offer.monthlyInstallmentCents)}</dd></div><div className="flex justify-between"><dt>Total repayment</dt><dd className="font-bold">{formatZAR(offer.totalRepayableCents)}</dd></div><div className="flex justify-between"><dt>Cost of credit</dt><dd>{formatZAR(offer.costOfCreditCents)}</dd></div><div className="flex justify-between"><dt>Interest / month</dt><dd>{(offer.monthlyInterestRateBps / 100).toFixed(2)}%</dd></div></dl><Button className="mt-4 w-full" loading={busy === offer.id} disabled={(offers.data?.length ?? 0) < 3 || !!busy} onClick={() => select(offer.id)}>Choose this offer</Button></Card>)}</div></section>;
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
    "Apply",
    "Lenders notified",
    "Offer received",
    "Applicant acceptance",
    "Payment",
    "Own-bank EFT",
  ];
  const index = [
    "SUBMITTED",
    "REFERRED",
    "UNDER_REVIEW",
    "ACTION_REQUIRED",
  ].includes(status)
    ? 1
    : status === "OFFERED"
      ? 3
      : status === "ACCEPTED" || status === "FUNDING_PENDING"
        ? 4
        : status === "DISBURSED"
          ? 5
          : 0;
  return (
    <Card>
      <h2 className="font-bold">What happens next?</h2>
      <ol className="my-3 grid gap-2 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step}
            className={`rounded-lg border p-2 text-sm ${i === index ? "border-brand bg-brand-soft font-bold" : ""}`}
          >
            {i + 1}. {step}
          </li>
        ))}
      </ol>
      <p className="text-sm">
        {status === "OFFERED"
          ? "Applicant action: read the final quote and agreement, then accept if you agree."
          : status === "ACCEPTED"
            ? "The lender pays the XTRA-CASH settlement account using the deposit reference. An administrator confirms receipt, then the funds are credited to your wallet."
            : status === "FUNDING_PENDING"
              ? "Waiting for the banking provider. Do not repeat funding or treat pending money as available."
              : status === "DISBURSED"
                ? externalPayment ? "Your wallet has been credited. View your balance and loan repayment schedule below." : "Applicant action: manage your wallet. Own-bank EFT requires verification and an active banking programme."
                : status === "ACTION_REQUIRED"
                  ? "Applicant action: reply to the information request below."
                  : status === "DECLINED"
                    ? "The request was declined. Read the recorded reason and contact support if you need human review."
                    : reviewer
            ? "All active accredited lenders receive this request. One lender can make an offer; you then decide whether to accept it."
                      : "Administration is reviewing and matching your request. You will receive an in-app notification when you need to act."}
      </p>
    </Card>
  );
}
