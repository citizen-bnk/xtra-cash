"use client";
import { useState } from "react";
import { useApi, useAuth } from "./api";
import { Alert, Button, Card, Field, Input, Select } from "./components";
type Access = {
  selectedLenderId: string | null;
  lenders: { id: string; name: string }[];
  access: { lenderId: string; active: number; authorityReference: string }[];
};
export function ApplicationLenderAccess({
  applicationId,
}: {
  applicationId: string;
}) {
  const { client } = useAuth();
  const endpoint = `/personal-loans/applications/${applicationId}/lender-access`;
  const data = useApi(
    (c) => c.request<Access>("GET", endpoint),
    [applicationId],
  );
  const [lenderId, setLenderId] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(id: string, active: boolean) {
    setBusy(true);
    setError("");
    try {
      await client.request("POST", endpoint, {
        lenderId: id,
        active,
        authorityReference: reference,
        confirmed,
      });
      data.reload();
      setConfirmed(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update lender access",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-semibold">Additional lender viewing access</h2>
      <p className="my-2 text-sm">
        Grant access to this application only. The assigned lender
        remains responsible for decisions. Record the applicant consent or other
        approved sharing authority before granting access. Documents, private
        notes, agreements and funding are excluded.
      </p>
      {(error || data.error) && <Alert tone="red">{error || data.error}</Alert>}
      <div className="space-y-3">
        <Field label="Additional accredited lender">
          <Select
            value={lenderId}
            onChange={(e) => setLenderId(e.target.value)}
          >
            <option value="">Choose lender</option>
            {data.data?.lenders
              .filter((l) => l.id !== data.data?.selectedLenderId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Sharing authority or consent reference">
          <Input
            maxLength={500}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm this access change is authorised.
        </label>
        <Button
          disabled={
            busy || !lenderId || reference.trim().length < 5 || !confirmed
          }
          onClick={() => save(lenderId, true)}
        >
          Grant viewing access
        </Button>
        {data.data?.access
          .filter((a) => a.active === 1)
          .map((a) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              key={a.lenderId}
            >
              <div>
                <strong>
                  {data.data?.lenders.find((l) => l.id === a.lenderId)?.name ??
                    "Previously accredited lender"}
                </strong>
                <p className="text-sm">
                  View request only · {a.authorityReference}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy || reference.trim().length < 5 || !confirmed}
                onClick={() => save(a.lenderId, false)}
              >
                Revoke access
              </Button>
            </div>
          ))}
        <p className="text-xs">
          Revocation requires a reason/reference and confirmation above. Changes
          are audit logged. Revoked lenders lose access on their next request.
        </p>
      </div>
    </Card>
  );
}
