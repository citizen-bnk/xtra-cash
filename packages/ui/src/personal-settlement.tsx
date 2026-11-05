"use client";
import React, { useState } from "react";
import { LoanJourney } from "./loan-competition";
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
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Loading,
  MoneyInput,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from "./components";
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
  const [preparationMode, setPreparationMode] = useState<"AI" | "MANUAL">(
    "MANUAL",
  );
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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action",
      );
    } finally {
      setBusy(false);
    }
  }
  if (data.loading && !data.data) return <Loading />;
  if (!data.data)
    return <Alert tone="red">{data.error || "Application unavailable"}</Alert>;
  const d = data.data,
    ag = d.agreement,
    isOffice = me?.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
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
        title={
          reviewer ? "Review request and make an offer" : "Your loan application"
        }
        subtitle={`${formatZAR(d.application.amountCents)} · ${d.application.termMonths} months · ${d.application.purpose}`}
        actions={
          <Button variant="secondary" onClick={data.reload}>
            Refresh
          </Button>
        }
      />
      <StatusBadge status={d.application.status} />
      <LoanJourney status={d.application.status} reviewer={reviewer} />
      {isOffice && d.application.status === "ACCEPTED" && (
        <Alert tone="blue">The applicant accepted the agreement. Finance can now release the lender-funded wallet transfer.</Alert>
      )}
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {!d.configuration.enabled && (
        <Alert tone="amber">
          Wallet funding and bank transfers are awaiting banking activation. You
          can track your application and read a prepared offer.
        </Alert>
      )}
      {d.application.reviewNotes && (
        <Card>
          <h2 className="font-semibold">Latest update</h2>
          <p className="mt-2">{d.application.reviewNotes}</p>
        </Card>
      )}
      {reviewer &&
        (reviewStates.includes(d.application.status) ||
          d.humanReviewPending) && (
          <section className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={preparationMode === "AI" ? "primary" : "secondary"}
                onClick={() => setPreparationMode("AI")}
              >
                Prepare with AI chat
              </Button>
              <Button
                variant={preparationMode === "MANUAL" ? "primary" : "secondary"}
                onClick={() => setPreparationMode("MANUAL")}
              >
                Guided decision form
              </Button>
            </div>
            {preparationMode === "AI" ? (
              <DecisionAiWorkspace
                applicationId={applicationId}
                onAdvanced={data.reload}
              />
            ) : (
              <ManualDecisionForm
                request={{
                  amountCents: d.application.amountCents,
                  termMonths: d.application.termMonths,
                  offerId: d.application.offerId,
                }}
                applicationId={applicationId}
                onAdvanced={data.reload}
              />
            )}
          </section>
        )}
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
          {reviewer && isOffice && d.application.status === "ACCEPTED" && (
            <Button
              loading={busy}
              disabled={!d.configuration.enabled || ag.approvedBy === me?.id}
              onClick={() => act("fund")}
            >
              Reserve lender funds and request wallet funding
            </Button>
          )}
          {ag.loanId && (
            <a
              className="block font-semibold underline"
              href={reviewer ? "/loans" : `/app/loans/${ag.loanId}`}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-muted">Available cash</p>
          <p className="text-3xl font-bold">{formatZAR(d.availableCents)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Reserved for bank transfers</p>
          <p className="text-3xl font-bold">{formatZAR(d.heldCents)}</p>
        </Card>
      </div>
      {!d.configuration.enabled && (
        <Alert tone="amber">
          Bank verification and EFT transfers are awaiting activation. No bank
          transfer can be submitted yet.
        </Alert>
      )}
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
      <Card>
        <h2 className="mb-3 text-xl font-bold">Money movements</h2>
        <div className="space-y-3">
          {d.movements.map((m) => (
            <div key={m.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {m.kind === "FUNDING" ? "Loan funding" : "Bank transfer"} ·{" "}
                  {formatZAR(m.amountCents)}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {new Date(m.createdAt).toLocaleString("en-ZA")} · Reference{" "}
                {m.id}
              </p>
            </div>
          ))}
          {!d.movements.length && <p>No money movements yet.</p>}
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
