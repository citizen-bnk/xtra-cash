"use client";
import { useEffect, useState } from "react";
import { formatZAR } from "@xtra/shared";
import { useApi, useAuth } from "./api";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "./components";
type Policy = {
  mode: "ADMIN" | "APPLICANT" | "OPEN_POOL";
  automation: "OFF" | "PREPARE" | "ASSIGN";
  maxLenders: number;
  geography: "PRODUCT_AREA" | "VICINITY";
  radiusKm: number;
  version: number;
};
type Candidate = {
  offerId: string;
  lenderId: string;
  lenderName: string;
  offerName: string;
  totalRepayableCents: number;
  distanceKm: number | null;
};
export function RoutingSettings() {
  const { client } = useAuth(),
    data = useApi((c) =>
      c.request<Policy>("GET", "/personal-loans/routing/policy"),
    );
  const [policy, setPolicy] = useState<Policy | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (data.data) setPolicy(data.data);
  }, [data.data]);
  async function save() {
    if (!policy) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.request<Policy>(
        "PUT",
        "/personal-loans/routing/policy",
        { ...policy, confirmed },
      );
      setPolicy(next);
      setConfirmed(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save routing policy",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-bold">Personal-loan lender matching policy</h2>
      <p className="my-3 text-sm">
        Default: administration matches lenders. Matching does not approve
        credit. Changing policy does not broadcast existing applications or
        change decided loans. Admin and super-admin can manage these controls.
      </p>
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {policy && (
        <div className="space-y-3">
          <Field label="Who selects the lender?">
            <Select
              value={policy.mode}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  mode: e.target.value as Policy["mode"],
                  automation: "OFF",
                })
              }
            >
              <option value="ADMIN">Administrator matching (default)</option>
              <option value="APPLICANT">
                Applicant chooses a matched lender
              </option>
              <option value="OPEN_POOL">
                Eligible lender pool — first successful claim
              </option>
            </Select>
          </Field>
          <Field label="Automatic administration">
            <Select
              disabled={policy.mode !== "ADMIN"}
              value={policy.automation}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  automation: e.target.value as Policy["automation"],
                })
              }
            >
              <option value="OFF">Off — manual intervention</option>
              <option value="PREPARE">
                Prepare matching shortlist for review
              </option>
              <option value="ASSIGN">
                Automatically assign or invite within these rules
              </option>
            </Select>
          </Field>
          <Field label="Maximum lenders in an admin shortlist">
            <Input
              type="number"
              min={1}
              max={10}
              value={policy.maxLenders}
              onChange={(e) =>
                setPolicy({ ...policy, maxLenders: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Location matching">
            <Select
              value={policy.geography}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  geography: e.target.value as Policy["geography"],
                })
              }
            >
              <option value="PRODUCT_AREA">
                Product service areas and applicant province
              </option>
              <option value="VICINITY">
                Within a configured lender area and distance
              </option>
            </Select>
          </Field>
          {policy.geography === "VICINITY" && (
            <Field label="Maximum matching distance in kilometres">
              <Input
                type="number"
                min={1}
                max={200}
                value={policy.radiusKm}
                onChange={(e) =>
                  setPolicy({ ...policy, radiusKm: Number(e.target.value) })
                }
              />
            </Field>
          )}
          <Alert tone="blue">
            Automation ranks eligible products by distance when available, then
            total repayable cost. It cannot bypass verification, consent,
            product criteria or lender capacity. AI form assistance can help
            prepare settings; matching uses these explicit rules. Missing
            vicinity coordinates leave the case for manual review.
          </Alert>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I authorise this routing policy and its automation limits.
          </label>
          <Button disabled={!confirmed || busy} onClick={save}>
            Save matching policy
          </Button>
        </div>
      )}
    </Card>
  );
}
export function ApplicationRouting({
  applicationId,
  onChanged,
}: {
  applicationId: string;
  onChanged: () => void;
}) {
  const { client } = useAuth(),
    endpoint = `/personal-loans/routing/applications/${applicationId}`;
  const data = useApi(
    (c) =>
      c.request<{
        policy: Policy;
        consentRecorded: boolean;
        candidates: Candidate[];
        invitations: { offerId: string }[];
        selectedOfferId: string | null;
      }>("GET", endpoint),
    [applicationId],
  );
  const [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function act(action: "ASSIGN" | "CLEAR" | "DECLINE") {
    setBusy(true);
    setError("");
    try {
      await client.request("POST", endpoint, {
        action,
        offerIds: action === "ASSIGN" ? selected : [],
        reason,
        confirmed,
      });
      setConfirmed(false);
      data.reload();
      onChanged();
      setNotice("Routing decision saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update matching");
    } finally {
      setBusy(false);
    }
  }
  async function automate() {
    setBusy(true);
    setError("");
    try {
      const result = await client.request<{
        applied: boolean;
        candidates?: Candidate[];
        reason?: string;
      }>("POST", endpoint + "/automate", {});
      if (result.candidates)
        setSelected(result.candidates.map((c) => c.offerId));
      setNotice(
        result.applied
          ? "Approved matching automation applied."
          : (result.reason ?? "Shortlist prepared for review."),
      );
      data.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare matching");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-bold">Match lenders to this application</h2>
      <p className="my-2 text-sm">
        Choose one product to assign its lender, or several lenders to invite
        them to claim responsibility. The first valid claim becomes the single
        decision maker. You can keep the request private or decline it after
        human review.
      </p>
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {notice && <Alert tone="blue">{notice}</Alert>}
      {data.data && !data.data.consentRecorded && (
        <Alert tone="amber">
          Applicant routing consent is still required before referral. Existing
          applications are not opted in automatically.
        </Alert>
      )}
      <div className="my-3 space-y-2">
        {data.data?.candidates.map((c) => (
          <label
            key={c.offerId}
            className="flex gap-2 rounded-lg border p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(c.offerId)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, c.offerId]
                    : selected.filter((x) => x !== c.offerId),
                )
              }
            />
            <span>
              <strong>{c.lenderName}</strong> · {c.offerName}
              <br />
              Total repayable {formatZAR(c.totalRepayableCents)}
              {c.distanceKm !== null ? ` · ${c.distanceKm.toFixed(1)} km` : ""}
              {data.data?.selectedOfferId === c.offerId
                ? " · Currently assigned"
                : ""}
              {data.data?.invitations.some((i) => i.offerId === c.offerId)
                ? " · Invited"
                : ""}
            </span>
          </label>
        ))}
        {data.data && !data.data.candidates.length && (
          <p>
            No eligible matching product is available. Retain for manual review
            or record your own decision.
          </p>
        )}
      </div>
      <Field label="Matching decision or decline reason">
        <Textarea
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <label className="my-3 flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed the information and authorise this action.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            busy ||
            !confirmed ||
            reason.trim().length < 5 ||
            !selected.length ||
            !data.data?.consentRecorded
          }
          onClick={() => act("ASSIGN")}
        >
          Assign / invite selected lenders
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !confirmed || reason.trim().length < 5}
          onClick={() => act("CLEAR")}
        >
          Keep private / clear matching
        </Button>
        <Button
          variant="danger"
          disabled={busy || !confirmed || reason.trim().length < 5}
          onClick={() => act("DECLINE")}
        >
          Decline after human review
        </Button>
        <Button
          variant="secondary"
          disabled={busy || data.data?.policy.automation === "OFF"}
          onClick={automate}
        >
          Run approved matching automation
        </Button>
      </div>
      <p className="mt-3 text-xs">
        AI does not decline applications. Once an offer/agreement exists,
        routing is locked.{" "}
        <a className="underline" href="/settings">
          Manage policy
        </a>
        .
      </p>
    </Card>
  );
}
export function LenderMatchingPool() {
  const { client } = useAuth(),
    data = useApi((c) =>
      c.request<
        {
          id: string;
          amountCents: number;
          termMonths: number;
          purpose: string;
          province: string;
          offerId: string;
          offerName: string;
          accessMode: string;
        }[]
      >("GET", "/personal-loans/routing/queue"),
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function claim(id: string, offerId: string) {
    setBusy(true);
    setError("");
    try {
      await client.request(
        "POST",
        `/personal-loans/routing/applications/${id}/claim`,
        { offerId, confirmed: true },
      );
      window.location.assign(`/lender/applications/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim request");
      data.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-bold">Matching invitations and eligible pool</h2>
      <p className="my-2 text-sm">
        Limited previews are shown before a claim. Claiming assigns review
        responsibility; it is not credit approval. Availability and eligibility
        are checked again when you claim.
      </p>
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      {data.data?.map((r) => (
        <div
          className="my-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          key={r.id}
        >
          <div>
            {formatZAR(r.amountCents)} · {r.termMonths} months · {r.purpose}
            <p className="text-sm">
              {r.province} · {r.offerName} ·{" "}
              {r.accessMode === "INVITED"
                ? "Admin invitation"
                : "Eligible pool"}
            </p>
          </div>
          <Button disabled={busy} onClick={() => claim(r.id, r.offerId)}>
            Claim for lender review
          </Button>
        </div>
      ))}
      {data.data?.length === 0 && <p>No matching requests available.</p>}
    </Card>
  );
}
export function ApplicantRoutingConsent({
  applicationId,
}: {
  applicationId: string;
}) {
  const { client } = useAuth(),
    policy = useApi((c) =>
      c.request<Policy>("GET", "/personal-loans/routing/policy"),
    );
  const [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState(""),
    [location, setLocation] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null);
  async function save() {
    try {
      await client.request(
        "POST",
        `/personal-loans/routing/applications/${applicationId}/consent`,
        { confirmed, ...(location ?? {}) },
      );
      setNotice(
        "Your routing consent has been recorded. Administration can now match your request.",
      );
      setConfirmed(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save consent");
    }
  }
  return (
    <Card>
      <h2 className="font-semibold">Lender matching consent</h2>
      <p className="my-2 text-sm">
        {policy.data?.mode === "APPLICANT"
          ? "You choose a matched lender."
          : policy.data?.mode === "OPEN_POOL"
            ? "A limited request preview may be shown to eligible lenders in the configured area. The first successful claim assigns your request to one lender."
            : "XTRA-CASH administration can match your request to one lender or shortlist several eligible lenders. Only the assigned lender receives decision authority."}{" "}
        This does not accept a loan agreement.
      </p>
      {policy.data?.geography === "VICINITY" && (
        <Button
          variant="secondary"
          onClick={() =>
            navigator.geolocation
              ? navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setLocation({
                      latitude: p.coords.latitude,
                      longitude: p.coords.longitude,
                    });
                    setNotice(
                      "Location selected for vicinity matching. Confirm consent to save it.",
                    );
                  },
                  () =>
                    setNotice(
                      "Location unavailable. Contact administration for matching assistance.",
                    ),
                )
              : setNotice("Location is unavailable on this device.")
          }
        >
          Use my location for matching
        </Button>
      )}
      <label className="my-3 flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I consent to sharing my request through this matching process
        {location ? " and using my supplied location" : ""}.
      </label>
      <Button disabled={!confirmed} onClick={save}>
        Confirm matching consent
      </Button>
      {notice && (
        <p className="mt-2" role="status">
          {notice}
        </p>
      )}
    </Card>
  );
}
