"use client";
import { useEffect, useState } from "react";
import { formatZAR } from "@xtra/shared";
import { useApi, useAuth } from "./api";
import {
  Alert,
  Button,
  Card,
  Modal,
  StatusBadge,
  Field,
  Select,
  Input,
  Textarea,
} from "./components";
import {
  PersonalSettlementView,
  WalletTransferView,
} from "./personal-settlement";
import { CompetitionOfferForm } from "./loan-competition";
type Notification = {
  key: string;
  applicationId: string;
  title: string;
  description: string;
  cta: string;
  kind: string;
  owner: string;
  read: boolean;
};
type Demo = {
  id: string;
  title: string;
  stage: string;
  payload: {
    amountCents: number;
    termMonths: number;
    purpose: string;
    nextActor: string;
    action: string;
    description: string;
  };
};
export function LoanActionCentre() {
  const { client, me } = useAuth(),
    data = useApi(
      (c) =>
        c.request<{ notifications: Notification[]; delivery: string }>(
          "GET",
          "/loan-operations/notifications",
        ),
      [me?.id],
    ),
    demos = useApi((c) =>
      c.request<Demo[]>("GET", "/loan-operations/demo-cases"),
    );
  const [open, setOpen] = useState(false),
    [active, setActive] = useState<Notification | null>(null),
    [demo, setDemo] = useState<Demo | null>(null),
    [training, setTraining] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") data.reload();
    }, 30000);
    const refresh = () => data.reload();
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [data.reload]);
  const reviewer = !!me?.roles.some(
      (r) => r === "ADMIN" || r === "SUPER_ADMIN" || r === "LENDER",
    ),
    unread = data.data?.notifications.filter((n) => !n.read).length ?? 0;
  async function act(n: Notification) {
    setActive(n);
    try {
      await client.request("POST", "/loan-operations/notifications/read", {
        key: n.key,
      });
      data.reload();
    } catch {
      setNotice(
        "The task may have changed. Refresh notifications before acting.",
      );
    }
  }
  return (
    <section
      className="mb-5 rounded-2xl border border-line bg-white p-4"
      aria-label="Loan tasks and notifications"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Your next actions</h2>
          <p className="text-sm text-muted">
            {data.data?.notifications.length
              ? `${data.data.notifications.length} current tasks · ${unread} unread`
              : "No loan action is waiting for you."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(!open);
              data.reload();
            }}
          >
            Tasks & notifications{unread ? ` (${unread})` : ""}
          </Button>
          <Button variant="ghost" onClick={() => setTraining(true)}>
            Explore demo journey
          </Button>
        </div>
      </div>
      {data.error && <Alert tone="red">{data.error}</Alert>}
      {notice && <Alert tone="amber">{notice}</Alert>}
      {open && (
        <div className="mt-3 space-y-2">
          {data.data?.notifications.map((n) => (
            <div key={n.key} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{n.title}</strong>
                <span className="text-xs">
                  {n.owner} · {n.read ? "Viewed" : "New"}
                </span>
              </div>
              <p className="my-2 text-sm">{n.description}</p>
              <Button onClick={() => act(n)}>{n.cta}</Button>
            </div>
          ))}
          <p className="text-xs text-muted">
            Notifications refresh while the app is open. Email, SMS and push
            delivery are not activated by this inbox.
          </p>
        </div>
      )}
      <Modal
        open={!!active}
        title={active?.title ?? "Loan task"}
        onClose={() => {
          setActive(null);
          data.reload();
        }}
      >
        {active?.kind === "COMPETITION" ? (
          <CompetitionOfferForm
            applicationId={active.applicationId}
            onComplete={() => {
              setActive(null);
              setNotice(
                "Your offer was authorised and won this request. The applicant must now read and accept the agreement.",
              );
              data.reload();
            }}
          />
        ) : active?.kind === "WALLET" ? (
          <WalletTransferView />
        ) : (
          active && (
            <PersonalSettlementView
              key={active.applicationId}
              applicationId={active.applicationId}
              reviewer={reviewer}
            />
          )
        )}
      </Modal>
      <Modal
        open={training}
        title="Personal-loan demo journey"
        onClose={() => {
          setTraining(false);
          setDemo(null);
        }}
      >
        <Alert tone="amber">
          Training only. These examples are separate from real applications,
          agreements, wallet balances and EFT payments.
        </Alert>
        <p className="my-3 text-sm">
          Follow a request from submission to lender offers, acceptance and
          banking. Every stage names the person who acts next.
        </p>
        {demo ? (
          <Card>
            <Button variant="ghost" onClick={() => setDemo(null)}>
              Back to all examples
            </Button>
            <h3 className="mt-3 font-bold">{demo.title}</h3>
            <StatusBadge status={demo.stage} />
            <p className="my-2">
              {formatZAR(demo.payload.amountCents)} · {demo.payload.termMonths}{" "}
              months · {demo.payload.purpose}
            </p>
            <p>
              <strong>Who acts:</strong> {demo.payload.nextActor}
            </p>
            <p className="my-2">{demo.payload.description}</p>
            <DemoActivity
              key={demo.id}
              demo={demo}
              onNext={() => {
                const list = demos.data ?? [];
                const i = list.findIndex((d) => d.id === demo.id);
                setDemo(list[(i + 1) % list.length] ?? null);
              }}
            />
            <p className="mt-2 text-sm" role="status">
              {notice}
            </p>
          </Card>
        ) : (
          <div className="mt-3 space-y-2">
            {demos.data?.map((d) => (
              <button
                key={d.id}
                className="block w-full rounded-xl border p-3 text-left hover:bg-surface"
                onClick={() => setDemo(d)}
              >
                <strong>{d.title}</strong>
                <p className="text-sm">
                  {d.stage} · Next: {d.payload.nextActor}
                </p>
              </button>
            ))}
            {demos.data?.length === 0 && (
              <p>Demo records are awaiting setup.</p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
function DemoActivity({ demo, onNext }: { demo: Demo; onNext: () => void }) {
  const [choice, setChoice] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [done, setDone] = useState(false);
  return (
    <div className="mt-3 space-y-3">
      <Field label="Training action">
        <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose an action</option>
          <option value="complete">{demo.payload.action}</option>
          <option value="review">
            Ask for human review / more information
          </option>
        </Select>
      </Field>
      {["COMPETITION_OPEN", "OFFERED"].includes(demo.stage) && (
        <Field label="Demo assessment date and time">
          <Input type="datetime-local" />
        </Field>
      )}
      {demo.stage === "ACTION_REQUIRED" && (
        <Field label="Demo information reply">
          <Textarea placeholder="Enter a synthetic training reply only" />
        </Field>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I understand this is a training simulation.
      </label>
      <Button
        disabled={!choice || !confirmed || done}
        onClick={() => setDone(true)}
      >
        {demo.payload.action} · demo
      </Button>
      {done && (
        <>
          <Alert tone="green">
            Training action completed. No real application, agreement, balance
            or payment changed.
          </Alert>
          <Button variant="secondary" onClick={onNext}>
            Explore the next stage
          </Button>
        </>
      )}
    </div>
  );
}
