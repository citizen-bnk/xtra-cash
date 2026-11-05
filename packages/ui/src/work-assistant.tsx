"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync, createPortal } from "react-dom";
import { useApi, useAuth } from "./api";
import { Alert, Button, Card, Field, Input, Textarea, Modal } from "./components";
import { Sparkles } from 'lucide-react';
type Prefs = {
  mode: "MANUAL" | "ASSIST" | "AUTO_PREPARE";
  instructions: string;
  maxAmountRand: number;
};
type Target = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "select";
  options: { value: string; label: string }[];
  maxLength: number;
  min: number | null;
  max: number | null;
};
type Draft = {
  id: string;
  message: string;
  values: { key: string; value: string }[];
};
const protectedField =
  /password|\bpin\b|\botp\b|secret|token|credential|permission|\brole\b|security|identity|\bid number\b|bank account|account number|card number/i;
/** Applies only a reviewed draft to visible editable controls. It never clicks or submits anything. */
export function applyPreparedControl(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw Error("This control requires manual entry");
  flushSync(() => {
    setter.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
export function WorkFormAssistant({ pathname }: { pathname: string }) {
  const [popup, setPopup] = useState(false);
  const { client, me } = useAuth();
  const allowed =
    !!me?.roles.some(
      (r) => r === "ADMIN" || r === "SUPER_ADMIN" || r === "LENDER",
    ) &&
    !pathname.startsWith("/affiliate") &&
    !pathname.startsWith("/app/");
  const preferences = useApi(
    (c) =>
      allowed
        ? c.request<Prefs>("GET", "/work-assistant/preferences")
        : Promise.resolve(null),
    [allowed, me?.id],
  );
  const [expanded, setExpanded] = useState(false),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [fields, setFields] = useState<Target[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [edited, setEdited] = useState<Prefs | null>(null);
  const [conversation, setConversation] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const conversationRef = useRef<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const controls = useRef(
      new Map<
        string,
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(),
    ),
    signature = useRef(""),
    draftSignature = useRef(""),
    autoSignature = useRef("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const prefs = edited || preferences.data;
  const scan = useCallback(() => {
    const map = new Map<
        string,
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(),
      next: Target[] = [];
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ].filter(
      (el) =>
        el.getClientRects().length && !el.closest("[data-work-assistant]"),
    );
    const target = dialogs.at(-1) ?? null;
    setPortalTarget((current) => (current === target ? current : target));
    const root = target || document;
    for (const el of root.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input,textarea,select")) {
      if (
        next.length >= 40 ||
        el.closest("[data-work-assistant], [data-decision-ai]") ||
        el.disabled ||
        el.getAttribute("readonly") !== null ||
        !el.getClientRects().length
      )
        continue;
      if (
        el instanceof HTMLInputElement &&
        ![
          "text",
          "number",
          "search",
          "url",
          "email",
          "date",
          "datetime-local",
          "month",
          "time",
        ].includes(el.type)
      )
        continue;
      const parent = el.closest("label"),
        label = (
          el.getAttribute("aria-label") ||
          parent?.querySelector("span")?.textContent ||
          parent?.textContent ||
          ""
        )
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 120);
      if (!label || protectedField.test(label)) continue;
      const options =
        el instanceof HTMLSelectElement
          ? [...el.options]
              .filter((o) => o.value && !o.disabled)
              .slice(0, 100)
              .map((o) => ({ value: o.value, label: o.label.slice(0, 120) }))
          : [];
      if (options.some((o) => /@|\b\d{6,}\b/.test(o.label))) continue;
      const key = "field-" + next.length;
      map.set(key, el);
      next.push({
        key,
        label,
        type:
          el instanceof HTMLSelectElement
            ? "select"
            : el instanceof HTMLTextAreaElement
              ? "textarea"
              : el.type === "number"
                ? "number"
                : "text",
        options,
        maxLength:
          el instanceof HTMLSelectElement
            ? 100
            : el.maxLength > 0
              ? Math.min(el.maxLength, 24000)
              : 24000,
        min:
          el instanceof HTMLInputElement &&
          el.min !== "" &&
          Number.isFinite(Number(el.min))
            ? Number(el.min)
            : null,
        max:
          el instanceof HTMLInputElement &&
          el.max !== "" &&
          Number.isFinite(Number(el.max))
            ? Number(el.max)
            : null,
      });
    }
    controls.current = map;
    const sig = pathname + JSON.stringify(next);
    if (sig !== signature.current) {
      signature.current = sig;
      setFields(next);
      setDraft(null);
      conversationRef.current = [];
      setConversation([]);
      setNotice("");
    }
    return { fields: next, signature: sig };
  }, [pathname]);
  useEffect(() => {
    if (!allowed) return;
    scan();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver((records) => {
      if (
        records.every((r) =>
          (r.target instanceof Element
            ? r.target
            : r.target.parentElement
          )?.closest("[data-work-assistant]"),
        )
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(scan, 200);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden", "style", "class"],
    });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [allowed, scan]);
  async function prepare(text = message) {
    const snapshot = scan();
    if (!snapshot.fields.length) {
      setError(
        "Open the form you want help with. Sensitive fields and confirmations require their own secure workflow.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const instructions = [
        ...conversationRef.current
          .filter((x) => x.role === "user")
          .map((x) => x.content),
        text,
      ].join("\n");
      if (instructions.length > 4000)
        throw new Error(
          "This form conversation has reached its instruction limit. Finish the current draft or open a fresh form.",
        );
      const scope =
        "/" +
        pathname
          .split("/")
          .filter((x) => /^[a-z-]+$/.test(x))
          .slice(0, 2)
          .join("/");
      const result = await client.request<Draft>(
        "POST",
        "/work-assistant/prepare",
        { scope, message: instructions, fields: snapshot.fields },
      );
      if (signature.current !== snapshot.signature) {
        setError(
          "The form changed while preparing. Ask again for the current form.",
        );
        return;
      }
      draftSignature.current = snapshot.signature;
      setDraft(result);
      conversationRef.current = [
        ...conversationRef.current,
        { role: "user", content: text },
        { role: "assistant", content: result.message },
      ];
      setConversation(conversationRef.current);
      setMessage("");
      setExpanded(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI preparation is unavailable; manual entry remains available.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      prefs?.mode !== "AUTO_PREPARE" ||
      busy ||
      !fields.length ||
      autoSignature.current === signature.current
    )
      return;
    autoSignature.current = signature.current;
    void prepare(
      prefs.instructions.trim() ||
        "Prepare the administrative fields using my saved parameters. Ask for missing facts and do not invent values.",
    );
  }, [prefs?.mode, fields]);
  async function save(value: Prefs) {
    setBusy(true);
    setError("");
    try {
      const result = await client.request<Prefs>(
        "PUT",
        "/work-assistant/preferences",
        value,
      );
      preferences.setData(result);
      setEdited(null);
      setNotice("Your assistance mode and limits have been saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!draft) return;
    const snap = scan();
    if (snap.signature !== draftSignature.current) {
      setError("This draft belongs to an earlier form. Prepare it again.");
      return;
    }
    for (const v of draft.values) {
      const el = controls.current.get(v.key);
      if (!el || el.disabled || !el.getClientRects().length) {
        setError("A prepared field is no longer available. Review manually.");
        return;
      }
    }
    try {
      for (const v of draft.values)
        applyPreparedControl(controls.current.get(v.key)!, v.value);
      setNotice(
        "Prepared values applied. Review the form and use its normal submission button.",
      );
      setDraft(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Complete this control manually.",
      );
    }
  }
  if (!allowed || !prefs) return null;
  const content = (
    <section
      data-work-assistant
      className="mb-5 rounded-xl border border-brand-purple/20 bg-white p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Work assistance</p>
          <p className="text-xs text-muted">
            Manual, AI-assisted or automatically assigned preparation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={prefs.mode === "MANUAL" ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => save({ ...prefs, mode: "MANUAL" })}
          >
            Manual
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setExpanded((v) => !v)}
          >
            AI assist now
          </Button>
          <Button
            size="sm"
            variant={prefs.mode === "AUTO_PREPARE" ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => {
              setExpanded(true);
              void save({ ...prefs, mode: "AUTO_PREPARE" });
            }}
          >
            Auto-assign AI
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted">
            AI can prepare editable administrative fields. Identity, banking,
            security, file uploads, confirmations and submission stay in their
            secure workflows. Automatic lending offers use your separately
            approved XTRA-Lender-AI policy.
          </p>
          {error && <Alert tone="red">{error}</Alert>}
          {notice && <Alert tone="blue">{notice}</Alert>}
          {conversation.length > 0 && (
            <div
              role="log"
              aria-label="Form preparation conversation"
              className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3"
            >
              {conversation.map((m, i) => (
                <p key={i} className="whitespace-pre-wrap text-sm">
                  <strong>{m.role === "user" ? "You" : "AI assistant"}:</strong>{" "}
                  {m.content}
                </p>
              ))}
            </div>
          )}
          <Field label="Ask AI to prepare this form">
            <Textarea
              rows={3}
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Use these details and prepare the missing fields…"
            />
          </Field>
          <Button
            size="sm"
            loading={busy}
            disabled={!message.trim() || !fields.length}
            onClick={() => prepare()}
          >
            Prepare draft
          </Button>
          <p className="text-xs text-muted">
            {fields.length} supported editable fields found. Open the relevant
            form or modal first.
          </p>
          {draft && (
            <Card className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{draft.message}</p>
              <dl className="space-y-2 text-sm">
                {draft.values.map((v) => (
                  <div key={v.key}>
                    <dt className="font-semibold">
                      {fields.find((f) => f.key === v.key)?.label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {fields
                        .find((f) => f.key === v.key)
                        ?.options.find((o) => o.value === v.value)?.label ||
                        v.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Button size="sm" disabled={!draft.values.length} onClick={apply}>
                Apply reviewed draft to form
              </Button>
            </Card>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Saved preparation parameters
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="Administrative preferences">
                <Textarea
                  value={prefs.instructions}
                  maxLength={1000}
                  onChange={(e) =>
                    setEdited({ ...prefs, instructions: e.target.value })
                  }
                />
              </Field>
              <Field label="Maximum amount AI may prepare (rand)">
                <Input
                  type="number"
                  min={1}
                  max={1000000}
                  value={prefs.maxAmountRand}
                  onChange={(e) =>
                    setEdited({
                      ...prefs,
                      maxAmountRand: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Button size="sm" disabled={busy} onClick={() => save(prefs)}>
                Save parameters
              </Button>
            </div>
          </details>
        </div>
      )}
    </section>
  );
  return <><button type="button" aria-label="Work assistance" title="Work assistance" onClick={() => { setPopup(true); setExpanded(true); }} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink hover:bg-surface"><Sparkles className="h-5 w-5" /></button><Modal open={popup} title="Work assistance" onClose={() => setPopup(false)}>{content}</Modal></>;
}
