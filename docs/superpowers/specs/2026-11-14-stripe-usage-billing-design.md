# Practice billing for AI usage (Stripe test mode + simulated demo) — design

Date: 2026-11-14 · Status: approved in conversation ("each doctor pays", per-patient insurance
statement, build the no-key demo now; Stripe test key arrives 2026-11-15).

## 1. Intent

Every time a patient's input makes DoctorLoop's AI work (a check-in gets structured, a summary gets
written), the tokens used are counted and billed **to the doctor's side, never to the patient**.
The doctor gets a clear, per-patient record of that usage that they can attach to their own
insurance paperwork. Stripe is used in **test mode only** (fake cards, no real money). Until the
key exists, the same feature runs as a clearly labeled **simulated billing** mode, like every other
integration in this app.

## 2. Goals, non-goals, anti-goals

Goals
- Meter tokens for every model call in the health-update pipeline: entry extraction (per entry),
  patient weekly summary, clinician pre-visit summary (and the privacy filter, see §5.2).
- Attribute each usage record to a patient and a paying doctor; bill that doctor through Stripe
  Billing Meters (test mode) or the simulated provider.
- Doctor Billing page: setup, status, upcoming invoice, per-patient breakdown, recent activity,
  invoices (Stripe mode), payment management, per-patient statement (printable page + CSV).
- Patients see only a one-line note that their care team covers the cost.

Non-goals
- Insurance claims, CPT/billing codes, claim submission, payer integrations.
- Charging patients in any way. Clinic/organization accounts (per-doctor accounts for now).
- Metronome. Live Stripe keys. Billing ElevenLabs voice minutes. Simulated invoice history.

Anti-goals (would be a failure even if it "works")
- Any patient name, patient id, entry text, observation or other health content reaching Stripe.
- A patient check-in, approval or summary failing or blocking because of billing or Stripe.
- Costs or prices shown anywhere in the patient UI.
- A doctor seeing usage of patients not billed to them, or entry content/links via billing views.

## 3. Constraints

- Follow `docs/ARCHITECTURE.md` (contracts additive only, §5 access rules, §5.1 hardening:
  system-only writes, server actions for UI mutations, route handlers only for redirects/callbacks
  and webhooks) and `docs/DESIGN.md` ("Ink & Signal" visual system, AA contrast, motion rules).
- Two data backends (local JSON + Supabase/RLS) must both support the new tables.
- Next.js 16.4 (async params/searchParams/cookies, `src/proxy.ts`). Stripe Node SDK `stripe@^23.1.0`.
- Synthetic data only; AI output stays labeled unverified; no risk/triage language.
- **A second Claude session (`doctorloop-ai-b4`) is concurrently adding a privacy filter**
  (`src/lib/ai/privacy/*`, `JournalEntry.privacyFilter`, migration `20261114000000_privacy_filter.sql`)
  and touches the same shared files. Build only after its edits to shared files settle; re-read
  every file before editing; never overwrite whole shared files. Our migration sorts after theirs.

## 4. Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **A. Stripe Billing Meters** (meter + metered price + subscription via Checkout; meter events per usage record) | Needs only a Stripe test key. Stripe now labels it "not recommended for new integrations" (it points to Metronome) but it is fully supported. Stripe's own usage view lags until invoice time, so our dashboard reads our own records. | **Picked** — fastest path to a working test-mode demo. Swapping to Metronome later is contained to one adapter. |
| B. Metronome (Stripe's recommended usage platform, LLM token pricing) | Separate account signup + API, more setup, real-time usage, model price sync. | Rejected for the hackathon: extra account and setup for no demo benefit. |
| C. Own ledger + monthly Stripe invoice items per patient | Per-patient lines on the Stripe invoice, but those lines would put patient identity into Stripe; reinvents metering. | Rejected: violates the "no patient data in Stripe" anti-goal. |

## 5. Design

### 5.1 Modes
- `billingMode = "stripe"` when `STRIPE_SECRET_KEY` starts with `sk_test_` or `rk_test_`;
  otherwise `"simulated"`. Live keys (`sk_live_`, `rk_live_`) are ignored (simulated mode; the
  integration label says live keys are ignored).
- `getIntegrationStatus()` gains `billing: { mode: "stripe" | "simulated"; label }`; the
  integrations popover shows a "Billing" row ("Stripe test mode" / "Simulated billing").
- A doctor's billing account remembers the mode it was activated in. An account from the other
  mode counts as **not set up** in the current mode (simulated activation does not carry over).

### 5.2 What is metered and how tokens are counted
- One usage record per model call that produced output: extraction of each new entry, each
  summary (patient or clinician audience), including every revalidation retry in
  `refreshClinicianSummary`, and every privacy-filter classification. Calls that failed and fell
  back to the mock are not billed; the mock run that replaced them is (estimated).
- OpenAI calls: exact `response.usage.input_tokens / output_tokens / total_tokens` →
  `tokenSource: "provider"`. Mock AI (no key, or fallback) or a response without usage:
  estimate `ceil(chars / 4)` of the prompt the OpenAI path *would* send (system + user prompt)
  and of the JSON output → `tokenSource: "estimated"`, labeled as estimated in every view.
- Privacy filter (other session's feature, `src/lib/ai/privacy/*`, runs *before* an entry exists
  in four flows: manual ingest, voice completion, each Vexo item, edit re-filter): metered as
  operation `privacy_filter` with `journalEntryId = null`, **including runs that kept nothing**
  (tokens were spent). Always reported in the private total (§5.11), never itemized.
- ElevenLabs voice minutes are not metered.

### 5.3 Who pays
- Each doctor is their own billing account.
- Patient- or system-triggered usage is billed to the patient's **billing provider**: the doctor
  with the earliest care assignment (`createdAt` asc, then assignment `id` asc). Seed: Dr. Park for
  Maya, Daniel and Priya (Priya's second doctor, Dr. Bell, is not her billing provider).
- Doctor-triggered usage (a doctor clicks "regenerate summary") is billed to that doctor.
- The payer is snapshotted on each record (`billingDoctorId`); later reassignment never rewrites
  history. No assigned doctor → `billingDoctorId = null`, record stays `not_billed`.

### 5.4 Price and money math
- One rate: `BILLING_PRICE_PER_1K_TOKENS_USD` (default `0.01`), parsed once to integer
  **micro-USD per 1,000 tokens** (`rateMicrosPer1k`, default 10 000). Invalid/≤0/>10 → default
  with a console warning.
- Per record: `amountMicros = round(totalTokens × rateMicrosPer1k / 1000)`. All sums in integer
  micros; display totals with 2 decimals, line items with 4.
- An account stores the rate it was activated with; records billed to it use the account's rate.
- Stripe price: `unit_amount_decimal` in cents **per token** = `rateMicrosPer1k / 10^7`
  (10 000 → `"0.001"`), `recurring: { interval: "month", usage_type: "metered", meter }`,
  `lookup_key: doctorloop_ai_tokens_<rateMicrosPer1k>`, product "DoctorLoop AI usage".

### 5.5 Billing lifecycle
- No account row (or `pending_setup`) = **Not set up**. Statuses: `pending_setup | active |
  past_due | canceled`.
- Usage recorded while not set up / canceled / mode-mismatched is stored as `not_billed` and is
  **never backfilled** (Stripe would not invoice events dated before the subscription anyway).
- Usage record statuses: `not_billed | pending | billed | sync_failed`. Records are inserted first
  (source of truth), then reported, then updated. `sync_failed` (and `pending` older than
  2 minutes) can be retried from the Billing page within **23 hours**, reusing the record id as
  the Stripe meter event `identifier` (Stripe only guarantees identifier de-duplication for ≥24 h,
  so later retries could double-bill; older failures stay `sync_failed`). Records of one batch are
  reported concurrently, so a Stripe outage costs a patient request about one 5 s timeout.
- Recording is best-effort: `recordAiUsage` never throws (logs and continues). Stripe client uses
  a short timeout (5 s) and no retries for meter events, so a patient request waits at most ~5 s.

### 5.6 Data model (additive)
Domain types (`src/lib/domain/types.ts`): `BillingMode`, `BillingAccountStatus`,
`UsageOperation = "entry_extraction" | "patient_summary" | "clinician_summary" | "privacy_filter"`,
`UsageTriggerKind = "patient" | "doctor" | "system"`, `TokenCountSource = "provider" | "estimated"`,
`UsageBillingStatus`, `AiUsageRecord`, `BillingAccount`, plus view models for the billing page and
statement. Fields (records): id, patientId, billingDoctorId, operation, triggeredBy,
triggeredByUserId, journalEntryId, provider, model, inputTokens, outputTokens, totalTokens,
tokenSource, rateMicrosPer1k, amountMicros, billingStatus, billingMode, billingError (safe text),
billedAt, occurredAt, createdAt. Accounts: doctorId, mode, status, stripeCustomerId,
stripeSubscriptionId, stripePriceId, paymentMethodLabel ("Visa •••• 4242"), rateMicrosPer1k,
periodAnchorAt, activatedAt, canceledAt, createdAt, updatedAt.

Repository (`src/lib/data/repository.ts`, additive): `createUsageRecords`, `updateUsageRecord`
(billing fields only), `listUsageRecords(query)`, `getBillingAccount(doctorId)`,
`saveBillingAccount(account)` (upsert), `findBillingAccountByStripeCustomer(customerId)`.

Access rules (add to ARCHITECTURE §5; same in SQL RLS and local code):

| Table | Patient | Doctor | Writes |
|---|---|---|---|
| ai_usage_records | none | **none directly** — the billing service reads via the system repo after `assertDoctor`, filters to rows billed to that doctor, and returns privacy-aggregated views (§5.11) | system only |
| billing_accounts | none | none directly (billing service, own account only) | system only |

Raw usage rows carry `journal_entry_id` and timestamps of unshared activity, so they must never
be readable by a doctor's own session (Supabase Data API included) — same pattern as
`vexo_connections`. Actor repositories throw FORBIDDEN for every new method.

SQL: new migration `supabase/migrations/20261114100000_billing.sql` (tables, checks, indexes on
`(billing_doctor_id, occurred_at desc)` and `(patient_id, occurred_at desc)`, RLS enabled with
**no** policies and no grants to `authenticated`). Local DB: two new tables (`usageRecords`,
`billingAccounts`); an older JSON file without them is re-seeded (existing `isLocalData`
behavior). Seed: estimated, `not_billed` usage records for the seeded entries and summaries
(deterministic ids); no billing accounts (everyone starts "Not set up").
`BillingAccount.simulatedInvoices` (jsonb `simulated_invoices`, newest first, max 24) holds
simulated-mode invoices: id, number `SIM-0001`…, periodStart, periodEnd, totalTokens,
amountMicros, status `paid`, paidWith (card label), createdAt.

### 5.7 Usage capture in the AI layer (AsyncLocalStorage collector)
- New `src/lib/ai/usage.ts`: `ModelUsageEvent { kind: string /* structured-output schema name,
  e.g. "observation_extraction", "recovery_summary", the privacy classifier's name */; provider;
  model; inputTokens; outputTokens; totalTokens; tokenSource }`, `estimateTokens(text)`,
  `reportModelUsage(event)` (no-op outside a scope) and `collectModelUsage(fn)` →
  `{ result, events }` built on `node:async_hooks` `AsyncLocalStorage`. Innermost scope wins;
  events never propagate to an outer scope.
- Spike (2026-11-14): ALS context survives Mastra 1.83 workflow steps, `Promise.all`,
  `setImmediate` and two concurrent runs stay isolated. So no workflow schema, stage result or
  provider interface changes are needed.
- `callStructured` keeps its signature and reports one event after a successful parse (exact
  usage when `response.usage` exists, else estimated from `system + user` and the parsed JSON;
  `OpenAIClientLike.parse` result gains optional `usage`). Failed/refused calls report nothing.
- Mock extractor and mock summarizer report estimated events using the prompts the OpenAI path
  would send (export the prompt builders from `openai/extractor.ts` / `openai/summarizer.ts`).
  The privacy filter's mock classifier (if it is a separate provider) reports the same way.
- The AI layer never imports billing code; services open scopes and record.

### 5.8 Recording (services)
- New `src/lib/services/billing.ts`: `recordAiUsage({ patientId, trigger, items })` (resolves
  payer, inserts records, reports to the active provider, updates status; never throws).
- Call sites wrap the AI work in `collectModelUsage` and map each event's `kind` to an operation:
  `processEntry` (extraction → `entry_extraction` with `journalEntryId`; summary →
  `patient_summary`), `generateSummary` in `summaries.ts` (one scope per pipeline attempt;
  audience → operation), and the privacy filter at its narrowest shared function (→
  `privacy_filter`, `journalEntryId = null`; wire this only after the other session's privacy
  code settles). Trigger flows in through new optional options:
  `refreshClinicianSummary(patientId, { failSafe?, trigger? })`,
  `refreshPatientSummary(patientId, { trigger? })`; callers in `patient.ts`, `doctor.ts`, `vexo.ts`
  pass the actor. Default trigger `{ kind: "system", userId: null }`.

### 5.9 Stripe integration (test mode, `src/lib/integrations/stripe/*`)
- Injected `StripeLike` subset so everything is unit-testable without a key.
- Catalog ensure (cached per process, also runnable as `npm run stripe:setup`): find active meter
  with event name `doctorloop_ai_tokens` (sum, `customer_mapping` by_id on payload
  `stripe_customer_id`, value key `value`) or create it; find price by lookup key or create
  product + price; ensure a Customer Portal configuration (payment method update, invoice history,
  cancel) exists.
- Setup: server action creates/reuses the Customer (doctor name + email + metadata
  `doctorloop_doctor_id`), saves account `pending_setup`, creates a Checkout Session
  (`mode: "subscription"`, metered price without quantity, `client_reference_id` = doctor id,
  success → `/api/billing/checkout/complete?session_id={CHECKOUT_SESSION_ID}`, cancel →
  `/doctor/billing?setup=cancelled`), returns the URL; the client navigates.
- Completion route handler: requires the doctor session, retrieves the session (expand
  subscription + default payment method), verifies `client_reference_id` and `status: complete`,
  activates the account (status mapped from the subscription, period anchor, card label), redirects
  to `/doctor/billing?setup=success`.
- Meter events: `billing.meterEvents.create({ event_name, payload: { stripe_customer_id, value:
  String(totalTokens) }, identifier: record.id, timestamp })`. Nothing else is sent.
- Billing page (Stripe mode) refreshes subscription status on load, shows `invoices.createPreview`
  ("Stripe preview · may lag a few minutes"), `invoices.list` (hosted links + PDF), and "Manage
  billing" → Customer Portal session.
- Webhook `POST /api/webhooks/stripe` (optional, needs `STRIPE_WEBHOOK_SECRET`; 503 when not
  configured): verify signature on the raw body; handle `checkout.session.completed`,
  `customer.subscription.updated|deleted`, `invoice.paid`, `invoice.payment_failed` → status sync.
- "Invoice now (demo)": `subscriptions.update(id, { billing_cycle_anchor: { type: "now" },
  proration_behavior: "always_invoice" })` (object form required by API `2026-10-28.endive`;
  `always_invoice` makes it invoice in flexible billing mode too). Stripe ends the period early and
  invoices the usage accrued so far, charged to the test card. Meter events are processed
  asynchronously, so usage from the last few minutes can land on the next invoice (say so in
  the UI). No test clocks; meter event timestamps are real `occurredAt`.
- SDK v23 specifics: `unit_amount_decimal` takes `Stripe.Decimal.from("0.001")` (not a string);
  subscription periods live on items (`items.data[0].current_period_start/end`).

### 5.10 Simulated billing
- "Set up billing" → `/doctor/billing/checkout`: an in-app page (not Stripe-branded) with plan
  summary, a prefilled test card (4242 4242 4242 4242, any future date, any CVC) and a "Start
  billing (simulated)" button → server action activates the account (`mode: "simulated"`, card
  label "Visa •••• 4242 (test card)", anchor = now) → redirect `/doctor/billing?setup=success`.
- Reporting marks records `billed` immediately. Upcoming invoice = sum of billed records in the
  current period (monthly steps from the anchor). "Invoice now (demo)" appends a `paid`
  simulated invoice for the billed records in `[periodStart, now)` and moves the anchor to now.
  "Turn off billing (demo)" sets `canceled`.

### 5.11 Doctor UI and the privacy rule for usage views
**Privacy rule (binding, from ARCHITECTURE: doctors see only patient-approved updates).** A usage
record is **itemized** (dated line) for the doctor only if it is (a) `entry_extraction` of an
entry that is *currently* `approved` and whose patient is assigned to this doctor, or (b)
`clinician_summary`. Everything else — structuring of pending/private entries, `privacy_filter`,
`patient_summary` — is folded into one undated **"Private processing (not itemized)"** line per
period per patient (runs, tokens, amount only). Status is evaluated when the view is built, so a
line moves between itemized and private as the patient shares or stops sharing. Totals always
include everything (the doctor pays for it). Views never contain entry text, entry links or
entry ids. **Private totals are bucketed to whole UTC calendar months** (statements compute the
private line over the full months the requested range touches, capped at now; the overview
window is the current calendar month), so narrow or repeated date ranges cannot reveal the dates
of unshared activity (ruling after the Task 8 review). Known limitation: per-patient month-to-date
totals update live, so a doctor could notice that a patient used AI processing privately around a
time (never which update or its content); showing per-patient private totals only for closed
months is the stronger option (next step). Only the newest extraction record of an entry is
itemized; older records of the same entry stay in the private total.

- Nav item "Billing" (`/doctor/billing`, new `NavIconKey` `"billing"`, lucide `Receipt`).
- `/doctor/billing`: ink hero band with one hero metric (upcoming invoice amount when active, or
  "Not set up" + unbilled amount of this calendar month) and the setup / manage / "Invoice now
  (demo)" actions; mode badge; stat strip for this calendar month (AI runs, tokens, billed, not
  billed); per-patient table (runs, tokens, billed, not billed, last itemized activity,
  "Statement" link); recent activity (latest 20 **itemized** records only: date, patient,
  activity, tokens + measured/estimated, amount, status); invoices (Stripe: live list with hosted
  link + PDF; simulated: stored list); sync-failure notice with "Retry"; footer note: "Patients are
  never billed. Stripe receives only your practice's account and token counts — no patient
  information."
- `/doctor/billing/statements/[patientId]?from&to` (default last 30 days, max 366): printable
  statement — doctor name/title, patient name + DOB (fictional) + short patient ref, period, rate,
  itemized lines (date UTC, activity, triggered by, AI engine, input/output/total tokens,
  measured/estimated, amount, status) + the private line, totals, disclaimer "Usage statement —
  not an insurance claim. No clinical content. Synthetic demo data." Buttons (hidden in print):
  Print / Save as PDF, Download CSV (server action returns CSV text; client saves a Blob; cells
  starting with `= + - @` are escaped; the private line's date cell is its month-bucket span `YYYY-MM-DD..YYYY-MM-DD`). Only records billed
  to this doctor; doctor must be assigned to the patient, else not found.
- Activity labels: entry_extraction "Update structuring", clinician_summary "Pre-visit
  summary", private line "Private processing (not itemized)". Triggered by: Patient / Clinician /
  System.

### 5.12 Patient UI
- One line on `/patient` (overview): "Your care team covers DoctorLoop's AI costs — you're never
  billed. For updates you haven't shared, they see only a monthly total of AI usage — never the
  update itself or what you wrote." No other patient-facing billing UI.

### 5.13 Env & docs
- `.env.example` + `env.ts`: `STRIPE_SECRET_KEY` (test keys only), `STRIPE_WEBHOOK_SECRET`
  (optional, from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`),
  `BILLING_PRICE_PER_1K_TOKENS_USD=0.01`.
- Update `docs/ARCHITECTURE.md` (modes table, ownership, §5 rows, module contracts, demo flow
  step) and `README.md` (billing section + "tomorrow" steps: add key, `npm run stripe:setup`,
  test card 4242…, optional `stripe listen`).

### 5.14 Tests
- AI usage: events captured through `runHealthUpdatePipeline` (mock → estimated; fake OpenAI
  client with `usage` → provider counts; without `usage` → estimated); fallback reports only the
  mock run; no events outside a scope; concurrent scopes isolated.
- Billing service: payer rule (Priya → Park; doctor-triggered → that doctor), `not_billed` before
  setup, `billed` after simulated setup, mode mismatch, `recordAiUsage` swallows provider errors,
  overview aggregates, **privacy rule** (pending/private entry usage and privacy-filter runs only
  appear in the undated private line; an entry becomes itemized after approval and leaves again
  after revoke), statement scope (Dr. Bell cannot read Priya's records billed to Park; a patient
  cannot call billing services), "Invoice now" (simulated) closes the period, CSV escaping, no
  health text or entry ids in views.
- Stripe adapter with a fake `StripeLike`: catalog ensure (reuse vs create), checkout params
  (subscription mode, no quantity, client_reference_id), meter event payload contains only
  `stripe_customer_id` + `value` and `identifier` = record id, completion verification, webhook
  signature failure → 400, live key → simulated.
- RLS (PGlite; add the new migration file to `tests/db/rls.test.ts`, which loads migrations by
  name): doctors and patients cannot select, insert, update or delete either table.
- One new Playwright spec: Dr. Park sets up simulated billing → Maya writes a check-in (usage shows
  only as private processing) → Maya shares it → Dr. Park sees an itemized "Update structuring"
  line → "Invoice now (demo)" adds a paid simulated invoice. Existing e2e specs are not edited.

## 6. Calls made without asking (check these)
1. Billing Meters instead of Metronome (§4).
2. Billing provider = earliest-assigned doctor; doctor-triggered usage billed to that doctor (§5.3).
3. Default $0.01 per 1,000 tokens, one rate for input and output tokens (§5.4).
4. Usage before setup is shown as "Not billed" and never backfilled (§5.5).
5. Mock-AI usage is billed with estimated token counts, clearly labeled (§5.2).
6. Doctors get dated lines only for shared updates and pre-visit summaries; all other usage
   (incl. privacy-filter runs, even ones that kept nothing) is one undated private total; raw
   usage rows are system-only (§5.6, §5.11). (Reversed from the first draft after review: the
   architecture already says doctors see only approved updates.)
7. Live Stripe keys are refused (§5.1). Voice minutes not metered.
8. "Invoice now (demo)" in both modes: Stripe via billing-cycle-anchor reset, simulated via a
   stored invoice (§5.9, §5.10). No test clocks.
9. Usage capture via an AsyncLocalStorage collector instead of threading usage through return
   types, to avoid rewriting the other session's in-flight privacy-filter code (§5.7).

## 7. Left to the builder
Exact component breakdown and copy beyond the strings above; table layouts within the design
system; helper names; query-string handling on the statement page; how the CSV button triggers
the download; test file split.
