"use client";
import React, { useState } from "react";
import { formatZAR } from "@xtra/shared";
import { useApi, useAuth } from "./api";
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
type Draft = {
  offerId?: string;
  assessmentReference?: string;
  mandateReference?: string;
  legalReference?: string;
  assessedAt?: string;
  expiresAt?: string;
  agreementTerms?: string;
};
type Workspace = {
  version: number;
  status: string;
  messages: { role: "user" | "assistant"; content: string }[];
  draft: Draft;
  provenance: Record<string, string>;
  draftDigest: string;
  missing: string[];
  ready: boolean;
  nextAction:
    | "PREPARE_OFFER"
    | "REQUEST_INFORMATION"
    | "REVIEW"
    | "RESOLVE_HUMAN_REVIEW";
  informationMessage: string;
  products: { id: string; name: string; termMonths: number }[];
  quote: null | {
    principalCents: number;
    monthlyInstallmentCents: number;
    totalRepayableCents: number;
  };
  applicationStatus: string;
};
const labels: Record<string, string> = {
  offerId: "Lender product",
  assessmentReference: "Verified financial assessment reference",
  mandateReference: "Repayment mandate reference",
  legalReference: "Approved legal terms reference",
  assessedAt: "Assessment completion time",
  expiresAt: "Offer expiry",
  agreementTerms: "Lender-approved agreement wording",
};
export function DecisionAiWorkspace({
  applicationId,
  onAdvanced,
}: {
  applicationId: string;
  onAdvanced: () => void;
}) {
  const { client } = useAuth();
  const state = useApi(
    (c) =>
      c.request<Workspace>(
        "GET",
        `/personal-loans/applications/${applicationId}/decision-chat`,
      ),
    [applicationId],
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  async function chat(text = message) {
    if (!state.data || !text.trim()) return;
    setBusy(true);
    setError("");
    const clientKey = key || crypto.randomUUID();
    setKey(clientKey);
    try {
      const result = await client.request<Workspace>(
        "POST",
        `/personal-loans/applications/${applicationId}/decision-chat`,
        { message: text, version: state.data.version, clientKey },
      );
      state.setData(result);
      setMessage("");
      setKey("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The preparation chat is unavailable. Your saved draft remains available.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    if (!state.data) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/personal-loans/applications/${applicationId}/decision-chat/advance`,
        {
          version: state.data.version,
          draftDigest: state.data.draftDigest,
          confirmed: true,
        },
      );
      await state.reload();
      onAdvanced();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not advance this application",
      );
      await state.reload();
    } finally {
      setBusy(false);
    }
  }
  if (state.loading && !state.data) return <Loading />;
  if (!state.data)
    return (
      <Alert tone="red">
        {state.error || "Decision workspace unavailable"}
      </Alert>
    );
  const d = state.data;
  const product = d.products.find((p) => p.id === d.draft.offerId);
  const action =
    d.nextAction === "RESOLVE_HUMAN_REVIEW"
      ? "Record human-review resolution"
      : d.nextAction === "REQUEST_INFORMATION"
        ? "Authorise information request"
        : d.nextAction === "REVIEW"
          ? "Start review and advance"
          : "Authorise offer and advance";
  return (
    <Card data-decision-ai className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-purple">
          XTRA-Lender-AI
        </p>
        <h2 className="mt-1 text-xl font-bold">
          Prepare the lending decision in chat
        </h2>
        <p className="mt-2 text-sm text-muted">
          Tell the assistant what you want to do. It gathers requirements and
          fills the decision draft. You authorise the next stage after reviewing
          the summary.
        </p>
      </div>
      {(error || state.error) && (
        <Alert tone="red">{error || state.error}</Alert>
      )}
      {!d.messages.length ? (
        <div className="space-y-3">
          <p className="text-sm">
            Start with “prepare this lender’s offer”, “request the missing
            income evidence” or “start the review”. Keep identity numbers, bank
            details and passwords out of this chat.
          </p>
          <Button
            loading={busy}
            onClick={() =>
              chat(
                "Start the lending decision process. Help prepare the next step and ask for any missing requirements.",
              )
            }
          >
            Start lending decision
          </Button>
        </div>
      ) : (
        <div
          role="log"
          aria-label="Lending preparation conversation"
          aria-live="polite"
          className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3"
        >
          {d.messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-5 rounded-xl bg-brand-soft p-3"
                  : "mr-5 rounded-xl border bg-white p-3"
              }
            >
              <p className="mb-1 text-xs font-bold">
                {m.role === "user" ? "You" : "XTRA-Lender-AI · preparation"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {m.content}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <Field
          label="Message XTRA-Lender-AI"
          hint="Provide actual assessment and mandate references. Agreement wording must come from your approved legal terms, not from the AI."
        >
          <Textarea
            rows={4}
            maxLength={24000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setKey("");
            }}
            placeholder="Use our approved product. The financial assessment was completed today under reference…"
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!message.trim()}
          loading={busy}
          onClick={() => chat()}
        >
          Prepare from my message
        </Button>
      </div>
      <section className="space-y-3 rounded-xl border p-4">
        <h3 className="font-bold">Prepared next step</h3>
        <p>
          {d.nextAction === "RESOLVE_HUMAN_REVIEW"
            ? "Record your completed human-review resolution"
            : d.nextAction === "REQUEST_INFORMATION"
              ? "Ask the applicant for missing information"
              : d.nextAction === "REVIEW"
                ? "Record that the lender review has started"
                : "Create the lender’s personalised offer and agreement"}
        </p>
        {d.informationMessage && (
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
            {d.informationMessage}
          </p>
        )}
        <dl className="space-y-3 text-sm">
          {Object.entries(d.draft)
            .filter(([k]) => k !== "agreementTerms")
            .map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold">{labels[k] || k}</dt>
                <dd className="break-words">
                  {k === "offerId"
                    ? product?.name || "Choose an available product"
                    : v}
                </dd>
                <dd className="text-xs text-muted">{d.provenance[k]}</dd>
              </div>
            ))}
        </dl>
        {d.quote && (
          <p className="rounded-lg bg-brand-soft p-3 text-sm">
            Wallet proceeds {formatZAR(d.quote.principalCents)} · monthly
            instalment {formatZAR(d.quote.monthlyInstallmentCents)} · total
            repayable {formatZAR(d.quote.totalRepayableCents)}. Calculated from
            the existing lender product.
          </p>
        )}
        {d.draft.agreementTerms && (
          <details>
            <summary className="cursor-pointer font-semibold">
              Read the approved agreement wording
            </summary>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">
              {d.draft.agreementTerms}
            </p>
          </details>
        )}
        {d.nextAction === "PREPARE_OFFER" && d.missing.length > 0 && (
          <div>
            <p className="font-semibold">Still required</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {d.missing.map((x) => (
                <li key={x}>{labels[x] || x}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted">
          By authorising an offer you confirm that the lender completed the real
          responsible-lending checks, verified the supporting evidence and
          approved these terms and repayment arrangements. This does not accept
          the borrower’s agreement or release money.
        </p>
        <Button
          loading={busy}
          disabled={
            !d.ready ||
            d.version === 0 ||
            (![
              "SUBMITTED",
              "REFERRED",
              "UNDER_REVIEW",
              "ACTION_REQUIRED",
            ].includes(d.applicationStatus) &&
              !(
                d.applicationStatus === "OFFERED" &&
                d.nextAction === "RESOLVE_HUMAN_REVIEW"
              ))
          }
          onClick={advance}
        >
          {action}
        </Button>
      </section>
    </Card>
  );
}
export function ManualDecisionForm({
  applicationId,
  onAdvanced,
}: {
  applicationId: string;
  onAdvanced: () => void;
}) {
  const { client, me } = useAuth();
  const products = useApi(
    (c) =>
      me?.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN")
        ? c.admin.offers()
        : c.lender.offers(),
    [me?.id],
  );
  const [draft, setDraft] = useState({
      offerId: "",
      assessmentReference: "",
      mandateReference: "",
      legalReference: "",
      assessedAt: "",
      expiresAt: "",
      agreementTerms: "",
    }),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/personal-loans/applications/${applicationId}/approve`,
        { ...draft, responsibleLendingConfirmed: true },
      );
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare this offer");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Prepare the decision manually</h2>
      {error && <Alert tone="red">{error}</Alert>}
      <Field label="Personal-loan product">
        <Select
          value={draft.offerId}
          onChange={(e) => setDraft({ ...draft, offerId: e.target.value })}
        >
          <option value="">Choose a product</option>
          {products.data
            ?.filter((o) => o.productType === "PERSONAL" && o.active)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </Select>
      </Field>
      {(
        [
          "assessmentReference",
          "mandateReference",
          "legalReference",
          "assessedAt",
          "expiresAt",
        ] as const
      ).map((k) => (
        <Field
          key={k}
          label={labels[k]}
          hint={
            k.endsWith("At")
              ? "Use an ISO time, for example 2026-11-04T10:00:00Z."
              : undefined
          }
        >
          <Input
            value={draft[k]}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="Lender-approved agreement wording">
        <Textarea
          value={draft.agreementTerms}
          maxLength={20000}
          rows={8}
          onChange={(e) =>
            setDraft({ ...draft, agreementTerms: e.target.value })
          }
        />
      </Field>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm the lender completed and evidenced the real
        responsible-lending checks and approved these terms and repayment
        arrangements.
      </label>
      <Button disabled={!confirmed} loading={busy} onClick={submit}>
        Authorise offer and advance
      </Button>
    </Card>
  );
}
type Policy = {
  offerId: string;
  amountLimitCents: number;
  dailyOfferLimit: number;
  expiryHours: number;
  legalReference: string;
  agreementTerms: string;
  automationReviewReference: string;
};
type Settings = {
  mode: string;
  version: number;
  policy: Policy;
  offers: { id: string; name: string }[];
  automaticOffersEnabled: boolean;
  assessmentConnectionConfigured: boolean;
  runs: {
    id: string;
    step: string;
    result: string;
    createdAt: string;
    applicationId: string;
  }[];
};
export function LenderAiSettingsView() {
  const { client } = useAuth();
  const settings = useApi((c) =>
    c.request<Settings>("GET", "/lender/ai/settings"),
  );
  const [edited, setEdited] = useState<Settings | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const d = edited || settings.data;
  const modes = [
    [
      "MANUAL",
      "AI prepares; lender authorises",
      "The assistant fills a draft. An authorised person reviews and advances each application.",
    ],
    [
      "AUTO_ENGAGE",
      "Automatically engage new applications",
      "Acknowledge referred applications in the applicant timeline and start review. Lender authorisation is still required for offers.",
    ],
    [
      "AUTO_OFFER",
      "Automatic offers under lender policy",
      "Execute a verified approved lender assessment within these limits. Missing or failed checks go to a human.",
    ],
  ];
  function change(patch: Partial<Settings>) {
    if (d) {
      setEdited({ ...d, ...patch });
      setConfirmed(false);
      setSuccess("");
    }
  }
  function policy(patch: Partial<Policy>) {
    if (d) change({ policy: { ...d.policy, ...patch } });
  }
  async function save() {
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.request<Settings>(
        "PUT",
        "/lender/ai/settings",
        { version: d.version, mode: d.mode, ...d.policy, confirmed: true },
      );
      settings.setData(result);
      setEdited(null);
      setConfirmed(false);
      setSuccess("Your lender policy has been saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save policy");
    } finally {
      setBusy(false);
    }
  }
  if (settings.loading && !d) return <Loading />;
  if (!d)
    return (
      <Alert tone="red">
        {settings.error || "Lender settings unavailable"}
      </Alert>
    );
  return (
    <div className="space-y-5">
      <PageHeader
        title="XTRA-Lender-AI"
        subtitle="Choose how your lender handles referred personal-loan applications."
      />
      {(error || settings.error) && (
        <Alert tone="red">{error || settings.error}</Alert>
      )}
      {success && <Alert tone="green">{success}</Alert>}
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Your operating mode</h2>
        {modes.map(([mode, title, description]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={d.mode === mode}
            onClick={() => change({ mode })}
            className={`block w-full rounded-xl border p-4 text-left ${d.mode === mode ? "border-brand-purple bg-brand-soft" : ""}`}
          >
            <span className="font-bold">{title}</span>
            <span className="mt-1 block text-sm">{description}</span>
          </button>
        ))}
        <p className="text-xs text-muted">
          Manual authorisation is the platform default. The language model never
          determines creditworthiness, declines a person, signs a borrower
          agreement or moves funds.
        </p>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">
          Approved product and operating limits
        </h2>
        <Field label="Personal-loan product">
          <Select
            value={d.policy.offerId}
            onChange={(e) => policy({ offerId: e.target.value })}
          >
            <option value="">Choose your product</option>
            {d.offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Maximum offer amount">
          <MoneyInput
            cents={d.policy.amountLimitCents}
            onCents={(v) => policy({ amountLimitCents: v ?? 0 })}
          />
        </Field>
        <Field label="Maximum automatic offers per rolling 24 hours">
          <Input
            type="number"
            min={1}
            max={100}
            value={d.policy.dailyOfferLimit}
            onChange={(e) =>
              policy({ dailyOfferLimit: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Offer validity in hours">
          <Input
            type="number"
            min={1}
            max={72}
            value={d.policy.expiryHours}
            onChange={(e) => policy({ expiryHours: Number(e.target.value) })}
          />
        </Field>
        <Field label="Legal approval reference">
          <Input
            value={d.policy.legalReference}
            onChange={(e) => policy({ legalReference: e.target.value })}
          />
        </Field>
        <Field
          label="Approved agreement wording"
          hint="This saved wording can be reused by the decision chat. Enter legally approved terms only."
        >
          <Textarea
            rows={8}
            maxLength={20000}
            value={d.policy.agreementTerms}
            onChange={(e) => policy({ agreementTerms: e.target.value })}
          />
        </Field>
        <Field label="Automation review and human-review safeguards reference">
          <Input
            value={d.policy.automationReviewReference}
            onChange={(e) =>
              policy({ automationReviewReference: e.target.value })
            }
          />
        </Field>
        {d.mode === "AUTO_OFFER" &&
          (!d.automaticOffersEnabled || !d.assessmentConnectionConfigured) && (
            <Alert tone="amber">
              Automatic offer activation is pending. It requires platform
              approval and the signed lender-assessment connection. Saving this
              policy does not bypass those requirements.
            </Alert>
          )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I am authorised by this lender and approve this policy, limits and
          terms. I understand that automated offers need verified underwriting
          and that applicants can ask for a human review.
        </label>
        <Button loading={busy} disabled={!confirmed} onClick={save}>
          Save lender policy
        </Button>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-bold">Recent workflow actions</h2>
        <div className="space-y-3">
          {d.runs.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <StatusBadge status={r.step} />
              <p className="mt-1 text-sm">{r.result.replaceAll("_", " ")}</p>
              <a
                className="text-sm underline"
                href={`/lender/applications/${r.applicationId}`}
              >
                Open application
              </a>
            </div>
          ))}
          {!d.runs.length && (
            <p className="text-sm text-muted">
              No automatic workflow actions yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
