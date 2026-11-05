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
export function CompetitionOfferForm({
  applicationId,
  onComplete,
}: {
  applicationId: string;
  onComplete: () => void;
}) {
  const { client } = useAuth(),
    detail = useApi(
      (c) =>
        c.request<{
          application: {
            id: string;
            amountCents: number;
            termMonths: number;
            purpose: string;
            province: string;
            monthlyIncomeCents: number;
            monthlyExpensesCents: number;
          };
          message: string;
        }>("GET", `/loan-operations/competitions/${applicationId}`),
      [applicationId],
    );
  const [creating, setCreating] = useState(false),
    [created, setCreated] = useState<LoanOffer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [product, setProduct] = useState({
    name: "",
    monthlyInterestRateBps: 100,
    initiationFeeCents: 0,
    monthlyServiceFeeCents: 0,
    minCreditScore: 0,
    minMonthlyIncomeCents: 0,
  });
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await client.request<LoanOffer>(
        "POST",
        `/loan-operations/competitions/${applicationId}/products`,
        { ...product, confirmed },
      );
      setCreated(result);
      setCreating(false);
      setConfirmed(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create matching product",
      );
    } finally {
      setBusy(false);
    }
  }
  const app = detail.data?.application;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Prepare a matching offer</h3>
      {(error || detail.error) && (
        <Alert tone="red">{error || detail.error}</Alert>
      )}
      {app && (
        <>
          <Card>
            <strong>
              {formatZAR(app.amountCents)} · {app.termMonths} months
            </strong>
            <p>
              {app.purpose} · {app.province}
            </p>
            <p className="mt-2 text-sm">
              Declared monthly income {formatZAR(app.monthlyIncomeCents)} ·
              expenses {formatZAR(app.monthlyExpensesCents)}
            </p>
          </Card>
          <Alert tone="amber">
            {detail.data?.message} Review actual supporting evidence before
            authorising. The request remains available until a valid offer
            commits.
          </Alert>
          <div className="rounded-xl border p-3">
            <h4 className="font-semibold">1. Choose or create your product</h4>
            <p className="my-2 text-sm">
              You do not need an existing matching product to open this
              opportunity. A created product is active in your stall and is not
              itself a winning offer.
            </p>
            <Button variant="secondary" onClick={() => setCreating(!creating)}>
              {creating
                ? "Back to offer preparation"
                : "Create a product for this request"}
            </Button>
            {created && (
              <p className="mt-2" role="status">
                Created {created.name}. Select it in the product dropdown below.
              </p>
            )}
            {creating && (
              <div className="mt-3 space-y-3">
                <Field label="Product name">
                  <Input
                    maxLength={80}
                    value={product.name}
                    onChange={(e) =>
                      setProduct({ ...product, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Monthly interest">
                  <Select
                    value={product.monthlyInterestRateBps}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        monthlyInterestRateBps: Number(e.target.value),
                      })
                    }
                  >
                    {[0, 50, 100, 150, 200, 300, 400, 500].map((v) => (
                      <option key={v} value={v}>
                        {v / 100}% per month
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Initiation fee">
                  <Select
                    value={product.initiationFeeCents}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        initiationFeeCents: Number(e.target.value),
                      })
                    }
                  >
                    {[0, 5000, 10000, 15000, 25000].map((v) => (
                      <option key={v} value={v}>
                        {formatZAR(v)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Monthly service fee">
                  <Select
                    value={product.monthlyServiceFeeCents}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        monthlyServiceFeeCents: Number(e.target.value),
                      })
                    }
                  >
                    {[0, 2500, 5000, 6900].map((v) => (
                      <option key={v} value={v}>
                        {formatZAR(v)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Minimum credit score requirement">
                  <Select
                    value={product.minCreditScore}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        minCreditScore: Number(e.target.value),
                      })
                    }
                  >
                    {[0, 500, 550, 600, 650, 700].map((v) => (
                      <option key={v} value={v}>
                        {v ||
                          "No product score threshold — actual assessment still required"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Minimum monthly income">
                  <Select
                    value={product.minMonthlyIncomeCents}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        minMonthlyIncomeCents: Number(e.target.value),
                      })
                    }
                  >
                    {[0, 300000, 500000, 1000000, 1500000].map((v) => (
                      <option key={v} value={v}>
                        {formatZAR(v)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-sm">
                  Amount and term are fixed to this request. Current platform
                  pricing limits and the applicant's matching criteria are
                  checked again.
                </p>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I authorise this product and its lending criteria.
                </label>
                <Button
                  disabled={
                    busy || !confirmed || product.name.trim().length < 3
                  }
                  onClick={create}
                >
                  Create product
                </Button>
              </div>
            )}
          </div>
          {!creating && (
            <div key={created?.id ?? "existing"}>
              <h4 className="font-semibold">
                2. Complete assessment and authorise the offer
              </h4>
              <ManualDecisionForm
                request={{
                  amountCents: app.amountCents,
                  termMonths: app.termMonths,
                }}
                applicationId={applicationId}
                endpoint={`/loan-operations/competitions/${applicationId}/offer`}
                onAdvanced={onComplete}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function LoanJourney({
  status,
  reviewer,
}: {
  status: string;
  reviewer: boolean;
}) {
  const steps = [
    "Apply",
    "Lenders notified",
    "Offer received",
    "Applicant acceptance",
    "Wallet funding",
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
            ? "Finance action: a different authorised administrator reviews funding. Banking activation is required."
            : status === "FUNDING_PENDING"
              ? "Waiting for the banking provider. Do not repeat funding or treat pending money as available."
              : status === "DISBURSED"
                ? "Applicant action: manage your wallet. Own-bank EFT requires verification and an active banking programme."
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
