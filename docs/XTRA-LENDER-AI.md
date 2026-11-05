# XTRA-Lender-AI and shared work assistance

Update: LOAN-ROUTING-POLICY.md supersedes the earlier applicant-choice default below. Administration now controls lender selection by default, with optional applicant choice and eligible lender pool modes. AI preparation and credit-authorisation safeguards remain in force.

Implementation plan and operating guide — 4 November 2026.

## Agreed choices

- Default: AI prepares; an authorised lender/admin reviews and authorises.
- Referral: the verified applicant chooses one matched lender product. The application is visible only to that selected lender and platform staff, not broadcast to several lenders.
- Manual entry remains available. Admins/lenders can request AI assistance now or save automatic assignment of preparation under their own instructions and amount limit.

## User journey and referral stage

1. Applicant submits the personal-loan request and identity/address evidence. A request without a selected lender is SUBMITTED in the platform queue.
2. After verification, the applicant views matched products and chooses one lender's product. Submitting that selection makes the application REFERRED and places it in that lender's inbox. Approval now requires an applicant-selected lender/product; staff cannot silently allocate an unassigned application to a lender.
3. Admin/lender clicks **Start lending decision**. The page opens with **Prepare with AI chat**, plus **Enter manually**.
4. Chat gathers the actual completed financial-assessment reference, mandate, approved legal wording/reference and assessment date. Product selection and approved legal defaults are drawn from the lender's existing policy where available. Missing information is requested explicitly. The saved draft shows provenance, missing items and a server-calculated quotation.
5. Reviewer can prepare an information request, start review, record a completed human-review resolution, or prepare an offer. AI prose cannot change status by itself. A separately labelled authorisation button validates the saved version/fingerprint and advances the prepared action exactly once.
6. Applicant reads and accepts the final agreement under the existing acceptance gate. A different administrator handles funding under the existing money gate. This agent does not accept the applicant's contract or release funds.

## Shared work assistance across admin and lender forms

The shared portal shell exposes **Manual**, **AI assist now**, and **Auto-assign AI**. Assistance is available on supported visible text/number/select/date controls, including forms opened in a modal. It does not submit the form.

- Chat uses only the supplied task instructions, saved administrative preferences and field descriptors/options. It does not scrape existing field values, identity documents or full applicant profiles into the model.
- AI returns a constrained draft. Text values must cite literal supplied source text; limited numeric conversion is supported. Unavailable select options, unknown fields, duplicate fields and amounts above the user's saved cap are rejected.
- The user reviews the proposed values and explicitly clicks **Apply reviewed draft to form**. The existing form submission, role checks and validation remain in force.
- Automatic assignment prepares a draft when a supported form is detected. It does not automatically apply or submit it. Instructions and amount caps are per account, initially MANUAL and R5,000.
- Passwords, security/role changes, identity/bank fields, OTPs, confirmation checkboxes and file uploads stay in their dedicated secure/manual workflows. The dedicated lending workflow supplies its own controlled authorisation path.
- Form structure is checked again before applying a draft. It cannot be applied to a different or changed form. Fields unavailable/unsupported by the detector can still be entered manually.
- Shared assistance conversations reset when the active form changes. Saved preparation tasks are encrypted and audit logged. A temporary gateway outage leaves manual entry and previously saved decision drafts available; it does not invent a successful AI response.

## Lender account modes

At `/lender/ai` the accredited account owner can configure:

| Mode | Behaviour |
| --- | --- |
| MANUAL | Default. AI prepares a draft and a human authorises each decision. |
| AUTO_ENGAGE | Acknowledge newly referred applications in the applicant timeline and start review. It does not send unsolicited external messages or issue offers. |
| AUTO_OFFER | Acknowledge applications, then execute a verified approved lender assessment under a specifically authorised lender policy and platform activation gate. |

Policy parameters: owned active personal-loan product, maximum amount, rolling 24-hour offer limit, offer validity, approved agreement wording, legal approval reference and automation/human-review safeguards reference. Changes are versioned and audit logged. Another lender cannot read or edit the policy.

An AUTO_OFFER is not an LLM creditworthiness judgement. The language model has no access to applicant identities, bureau reports or financial profiles in this preparation path. Automatic offers require a separately authenticated lender-underwriting event that already says APPROVED and confirms identity, income, credit, affordability and repayment mandate checks. Missing/expired checks, insufficient capacity, policy mismatch or a paused human review leaves the case for a person. The system does not automatically decline applicants.

Applicants can request human review and give a question or representation. The workflow records it, pauses automatic offers and agreement acceptance, and requires an authorised reviewer to record the resolution before proceeding.

## Underwriting connection and activation

Default variables:

```dotenv
LENDER_AUTO_OFFERS_ENABLED=false
# LENDER_AI_MODEL=inception/mercury-2.5
# LENDER_ASSESSMENT_WEBHOOK_SECRET=
```

Preparation uses the existing Vercel AI SDK/Gateway integration (OIDC on Vercel or a securely provisioned gateway key). Model selection is configurable. Do not put gateway credentials or assessment signing secrets in chat or source control.

`POST /lender-ai/assessment` accepts this normalised event from the approved lender-underwriting bridge:

```json
{
  "eventId": "unique-stable-underwriting-event-id",
  "applicationId": "selected-application-id",
  "lenderId": "selected-lender-id",
  "offerId": "applicant-selected-approved-product",
  "assessmentReference": "secure-evidence-case-reference",
  "mandateReference": "verified-repayment-mandate-reference",
  "assessedAt": "2026-11-04T10:00:00Z",
  "expiresAt": "2026-11-05T10:00:00Z",
  "decision": "APPROVED",
  "checks": {"identity": true, "income": true, "credit": true, "affordability": true, "mandate": true}
}
```

Alternative decision: REFER_TO_HUMAN. No raw bureau report, identity number or banking detail is accepted in this event.

Headers: `x-assessment-timestamp` = Unix seconds; `x-assessment-signature` = lower-case hex HMAC-SHA256 over `timestamp + "." + raw request body`, signed with LENDER_ASSESSMENT_WEBHOOK_SECRET (32+ characters). Timestamp validity is five minutes. Retry the identical event with a fresh timestamp/signature; a conflicting changed assessment is rejected. The bridge must authenticate its own upstream lender/provider, bind the selected application/lender/product and retain genuine evidence. This is a prepared bridge contract, not a claim that a bureau or underwriting partner has been connected.

The scheduled worker `/lender-ai/process` requires the existing CRON_SECRET and runs every five minutes. A lender can process its own queue through `/lender/ai/process`. Batches are limited; load/capacity testing and operational monitoring remain necessary before broader use.

Before enabling automatic offers, provide/approve: named lender and authorised owner, approved product and legal wording, completed automation/compliance review and human-review process, signed underwriting bridge with genuine assessment evidence, amount/volume limits and monitoring owner. Then authorise the lender policy and enable the platform gate. Agreement acceptance and wallet/EFT activation remain separate and unchanged.

## Release plan

1. Add encrypted, versioned chat drafts, policies, verified-assessment events and audit records.
2. Replace repetitive decision forms with chat-led preparation while retaining manual choice.
3. Add shared form assistance and per-account automatic preparation parameters.
4. Add lender mode settings, controlled worker and applicant human-review pause/resolution.
5. Test invalid model output, source grounding, tenant isolation, stale versions, replay, policy limits, missing evidence, human review and React-controlled form filling.
6. Deploy with manual authorisation as the default and automatic offers disabled; verify live routes, role restrictions, gateway operation and activation gates. No real loan approval or funds movement is needed for release verification.
