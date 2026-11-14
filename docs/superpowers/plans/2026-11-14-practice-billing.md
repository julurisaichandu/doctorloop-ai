# Practice Billing (Stripe test mode + simulated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meter every AI model call caused by patient (or doctor) activity, bill it to the paying doctor through Stripe Billing Meters (test mode) or a labeled simulated provider, and give doctors a privacy-preserving Billing page plus per-patient statements.

**Architecture:** An AsyncLocalStorage collector captures token usage from `callStructured` and the mock providers. Services open a scope around AI work and hand the events to `recordAiUsage`, which resolves the payer, stores system-only usage records and reports them (simulated: instantly; Stripe: meter events). Doctor views come from a views service that itemizes only shared updates and pre-visit summaries.

**Tech Stack:** Next.js 16.4 App Router, TypeScript strict, Zod v4, date-fns v4, Vitest 5, Playwright, local JSON DB + Supabase Postgres/RLS (PGlite in tests), `stripe@^23.1.0` (pins API `2026-10-28.endive`).

**Spec:** `docs/superpowers/specs/2026-11-14-stripe-usage-billing-design.md`

## Global Constraints

- Read `docs/ARCHITECTURE.md` (contracts, §5 access rules, §5.1 hardening) and `docs/DESIGN.md` (UI) before coding. Next.js 16.4: `params`/`searchParams`/`cookies()` are Promises; check `node_modules/next/dist/docs/` when unsure.
- Shared contract files are additive only: `src/lib/domain/types.ts`, `src/lib/data/repository.ts`, `src/lib/config/env.ts`, `src/lib/errors.ts`.
- **Concurrent editing:** another Claude session is editing this repo (privacy filter). Never use Write on an existing file; use Edit with small unique anchors; Read a file right before editing it; if an Edit fails because the file changed, re-read and retry; never revert or reformat code you didn't write. Don't run `npm run build`, `npm run dev`, `npm run start` or Playwright (the lead does).
- Not a git repository: there are no commit steps.
- Server-only modules start with `import "server-only";`. Modules under `src/lib/billing/` are pure (no `server-only`, no Node APIs) so client components can import formatting helpers.
- Money is integer micro-USD (1 USD = 1,000,000). Default rate `10_000` micro-USD per 1,000 tokens ($0.01). `amountMicros = Math.round(totalTokens * rateMicrosPer1k / 1000)`.
- Stripe receives only: Customer `name`, `email`, `metadata.doctorloop_doctor_id`; Checkout/subscription `metadata.doctorloop_doctor_id`; meter events `{ event_name: "doctorloop_ai_tokens", payload: { stripe_customer_id, value }, identifier: <usage record id>, timestamp }`. Never patient names or ids, entry ids, text or health data.
- Billing mode is `"stripe"` only when `STRIPE_SECRET_KEY` matches `/^(sk|rk)_test_/`; otherwise `"simulated"`.
- `recordAiUsage` never throws and never blocks patient flows.
- Doctor-facing views never contain entry text, entry ids or links to entries. Itemize only (a) `entry_extraction` of entries that are currently `approved` and readable by the doctor's actor repository, and (b) `clinician_summary`. Everything else goes into "Private processing (not itemized)".
- Exact copy: footer "Patients are never billed. Stripe receives only your practice's account and token counts — no patient information." · patient note "Your care team covers DoctorLoop's AI costs — you're never billed. For updates you haven't shared, they see only a total, never dates or what you wrote." · statement disclaimer "Usage statement — not an insurance claim. No clinical content. Synthetic demo data." · activity labels "Update structuring", "Pre-visit summary", "Private processing (not itemized)" · status labels billed "Billed", not_billed "Not billed", pending "Sending…", sync_failed "Sync failed" · triggered-by labels "Patient", "Clinician", "System".
- Verify each task with `npx vitest run <its test files>`, `npm run typecheck` and `npm run lint`.

## Review Focus

1. A Stripe key is set but Stripe is unreachable or the key is wrong (a typo in tomorrow's key): the Billing page still renders our own usage numbers and shows an inline error only in the Stripe-backed sections. → Task 8 test `overview survives Stripe failures`.
2. Checkout returns with a session that belongs to another doctor, isn't complete, or is garbage: nothing is activated, the doctor is redirected to `/doctor/billing?setup=error`, never a 500. → Task 7 tests.
3. "Set up billing" clicked twice, or Checkout abandoned and retried: the same Stripe Customer is reused, never duplicated. → Task 7 test.
4. "Invoice now (demo)" with no billed usage in the period, or clicked twice: CONFLICT "Nothing to invoice yet — no billed AI usage in this period."; no $0 invoices. → Task 7 tests.
5. Statement URL with garbage, reversed or huge ranges (`?from=abc&to=2020-01-01`, a 5-year span, a future `to`): the range is normalized, never an error. → Task 8 `parseStatementRange` tests.

## File structure

```
src/lib/billing/money.ts            pure: rate parsing, amount math, USD/token formatting, Stripe decimal
src/lib/billing/period.ts           pure: billing period from an anchor, last-30-days window
src/lib/billing/views.ts            pure: itemization rule, totals, usage lines, private total, labels
src/lib/billing/statement-range.ts  pure: statement ?from&to normalization
src/lib/billing/csv.ts              pure: statement → CSV (escaped)
src/lib/billing/simulated.ts        pure: simulated account activation / cancel / close period
src/lib/ai/usage.ts                 AsyncLocalStorage usage collector + token estimate
src/lib/integrations/stripe/client.ts     server-only: StripeLike, getStripe(), test override
src/lib/integrations/stripe/catalog.ts    server-only: meter + price + portal configuration ensure
src/lib/integrations/stripe/operations.ts server-only: every Stripe call the app makes
src/lib/services/billing-usage.ts   recordAiUsage, resolvePayer, usageItemsFromEvents, retryUsageSync
src/lib/services/billing-account.ts setup / activate / complete / cancel / portal / invoice now / refresh / webhook
src/lib/services/billing-views.ts   doctor overview, patient statement, statement CSV
src/app/api/billing/checkout/complete/route.ts   Stripe Checkout return (GET)
src/app/api/webhooks/stripe/route.ts             Stripe webhook (POST)
src/app/doctor/billing/{page,loading,actions}.tsx|ts, checkout/page.tsx, statements/[patientId]/page.tsx
src/components/billing/*            billing UI components
supabase/migrations/20261114100000_billing.sql
scripts/stripe-setup.ts
```

---

### Task 1: Contracts, config and money/period helpers

**Files:**
- Modify: `src/lib/domain/types.ts` (append one section at the end of the file)
- Modify: `src/lib/config/env.ts`
- Modify: `tests/support/setup.ts`, `.env.example`
- Create: `src/lib/billing/money.ts`, `src/lib/billing/period.ts`
- Test: `tests/billing/money.test.ts`, `tests/billing/period.test.ts`, `tests/billing/env-billing.test.ts`

**Interfaces:**
- Produces (types.ts, append verbatim, then JSDoc as you see fit):
```ts
export type BillingMode = "stripe" | "simulated";
export type BillingAccountStatus = "pending_setup" | "active" | "past_due" | "canceled";
export type UsageOperation = "entry_extraction" | "patient_summary" | "clinician_summary" | "privacy_filter";
export type UsageTriggerKind = "patient" | "doctor" | "system";
export type TokenCountSource = "provider" | "estimated";
export type UsageBillingStatus = "not_billed" | "pending" | "billed" | "sync_failed";
export interface UsageTrigger { kind: UsageTriggerKind; userId: string | null }
export interface AiUsageRecord {
  id: string; patientId: string; billingDoctorId: string | null;
  operation: UsageOperation; triggeredBy: UsageTriggerKind; triggeredByUserId: string | null;
  journalEntryId: string | null; provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
  rateMicrosPer1k: number; amountMicros: number;
  billingStatus: UsageBillingStatus; billingMode: BillingMode | null; billingError: string | null;
  billedAt: string | null; occurredAt: string; createdAt: string;
}
export interface SimulatedInvoice {
  id: string; number: string; periodStart: string; periodEnd: string;
  totalTokens: number; amountMicros: number; status: "paid"; paidWith: string; createdAt: string;
}
export interface BillingAccount {
  doctorId: string; mode: BillingMode; status: BillingAccountStatus;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null; stripePriceId: string | null;
  paymentMethodLabel: string | null; rateMicrosPer1k: number;
  periodAnchorAt: string | null; activatedAt: string | null; canceledAt: string | null;
  simulatedInvoices: SimulatedInvoice[]; createdAt: string; updatedAt: string;
}
export interface BillingPeriod { start: string; end: string }
export interface UsageLine {
  id: string; occurredAt: string; patientId: string; patientName: string;
  activity: "entry_extraction" | "clinician_summary"; activityLabel: string;
  triggeredBy: UsageTriggerKind; provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
  amountMicros: number; billingStatus: UsageBillingStatus;
}
export interface UsageTotals {
  runs: number; inputTokens: number; outputTokens: number; totalTokens: number;
  billedMicros: number; notBilledMicros: number; estimatedRuns: number; failedSyncs: number;
}
export interface PatientUsageRow { patientId: string; patientName: string; totals: UsageTotals; lastItemizedAt: string | null }
export interface BillingInvoiceView {
  id: string; number: string | null; periodStart: string; periodEnd: string; amountCents: number;
  status: string; hostedUrl: string | null; pdfUrl: string | null; source: BillingMode;
}
export interface UpcomingInvoiceView {
  periodStart: string; periodEnd: string; amountCents: number; totalTokens: number;
  source: BillingMode; note: string | null;
}
export interface DoctorBillingOverview {
  mode: BillingMode; modeLabel: string; rateMicrosPer1k: number;
  account: { status: "not_set_up" | BillingAccountStatus; paymentMethodLabel: string | null; activatedAt: string | null; currentPeriod: BillingPeriod | null };
  window: BillingPeriod; totals: UsageTotals; patients: PatientUsageRow[]; recent: UsageLine[];
  upcomingInvoice: UpcomingInvoiceView | null; invoices: BillingInvoiceView[]; stripeError: string | null;
}
export interface PatientUsageStatement {
  doctor: { name: string; title: string | null };
  patient: { id: string; ref: string; name: string; dateOfBirth: string | null };
  period: BillingPeriod; rateMicrosPer1k: number; mode: BillingMode;
  lines: UsageLine[]; privateTotal: UsageTotals; totals: UsageTotals; generatedAt: string;
}
```
- Produces (`src/lib/billing/money.ts`): `DEFAULT_RATE_MICROS_PER_1K = 10_000`; `parseRateMicrosPer1k(raw: string | undefined): number`; `usageAmountMicros(totalTokens: number, rateMicrosPer1k: number): number`; `microsToCents(micros: number): number` (`Math.round(micros / 10_000)`); `formatUsd(micros: number, decimals?: 2 | 4): string`; `formatCents(cents: number): string`; `formatRate(rateMicrosPer1k: number): string`; `formatTokens(n: number): string`; `stripeUnitAmountDecimal(rateMicrosPer1k: number): string` (cents per token = rate / 10^7, max 12 decimals, trailing zeros trimmed).
- Produces (`src/lib/billing/period.ts`): `currentBillingPeriod(anchorIso: string, now: Date): BillingPeriod` (period k = `[addMonthsUtc(anchor, k), addMonthsUtc(anchor, k + 1))` containing `now`; k ≥ 0; `now` before the anchor → k = 0); `last30Days(now: Date): BillingPeriod` (`now − 30 × 86_400_000 ms`). All math is UTC: do **not** use date-fns `addMonths` (it uses the machine's local time zone); `addMonthsUtc` keeps the anchor's UTC time of day and clamps the day to the target month's length, always computed from the original anchor (never chained).
- Produces (env.ts): `env.stripeSecretKey`, `env.stripeWebhookSecret`, `env.billingRateMicrosPer1k`; `export function getBillingMode(): BillingMode`; `IntegrationStatus.billing: { mode: BillingMode; label: string }` in `getIntegrationStatus()`.

- [ ] **Step 1: Write the failing tests**

`tests/billing/money.test.ts`:
```ts
expect(parseRateMicrosPer1k(undefined)).toBe(10_000);
expect(parseRateMicrosPer1k("0.01")).toBe(10_000);
expect(parseRateMicrosPer1k("0.015")).toBe(15_000);
for (const bad of ["abc", "0", "-1", "10.5", ""]) expect(parseRateMicrosPer1k(bad)).toBe(10_000);
expect(parseRateMicrosPer1k("10")).toBe(10_000_000);
expect(usageAmountMicros(2_100, 10_000)).toBe(21_000);
expect(usageAmountMicros(0, 10_000)).toBe(0);
expect(microsToCents(21_000)).toBe(2);
expect(formatUsd(1_520_000)).toBe("$1.52");
expect(formatUsd(21_000, 4)).toBe("$0.0210");
expect(formatCents(152)).toBe("$1.52");
expect(formatRate(10_000)).toBe("$0.01 per 1,000 tokens");
expect(formatTokens(152_340)).toBe("152,340");
expect(stripeUnitAmountDecimal(10_000)).toBe("0.001");
expect(stripeUnitAmountDecimal(15_000)).toBe("0.0015");
expect(stripeUnitAmountDecimal(1)).toBe("0.0000001");
```
`tests/billing/period.test.ts`:
```ts
const p = currentBillingPeriod("2026-10-05T10:00:00.000Z", new Date("2026-11-14T00:00:00.000Z"));
expect(p).toEqual({ start: "2026-11-05T10:00:00.000Z", end: "2026-12-05T10:00:00.000Z" });
expect(currentBillingPeriod("2026-11-14T00:00:00.000Z", new Date("2026-11-14T00:00:00.000Z")))
  .toEqual({ start: "2026-11-14T00:00:00.000Z", end: "2026-12-14T00:00:00.000Z" });
// month-end anchor: each boundary is computed from the anchor, not chained (Feb 28 → Mar 31 contains Mar 30)
expect(currentBillingPeriod("2026-01-31T00:00:00.000Z", new Date("2026-03-30T00:00:00.000Z")))
  .toEqual({ start: "2026-02-28T00:00:00.000Z", end: "2026-03-31T00:00:00.000Z" });
// before the anchor → first period
expect(currentBillingPeriod("2026-11-14T00:00:00.000Z", new Date("2026-11-01T00:00:00.000Z")).start).toBe("2026-11-14T00:00:00.000Z");
expect(last30Days(new Date("2026-11-14T00:00:00.000Z")))
  .toEqual({ start: "2026-10-15T00:00:00.000Z", end: "2026-11-14T00:00:00.000Z" });
```
`tests/billing/env-billing.test.ts` (set/restore `process.env` per test):
```ts
// STRIPE_SECRET_KEY → getBillingMode(), getIntegrationStatus().billing
// unset → "simulated", label "Simulated billing (no Stripe key)"
// "sk_test_abc" and "rk_test_abc" → "stripe", label "Stripe test mode"
// "sk_live_abc" and "rk_live_abc" → "simulated", label "Simulated billing (live Stripe keys are ignored)"
// BILLING_PRICE_PER_1K_TOKENS_USD="0.02" → env.billingRateMicrosPer1k === 20_000; "nope" → 10_000
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/billing/money.test.ts tests/billing/period.test.ts tests/billing/env-billing.test.ts`
Expected: FAIL (modules / exports missing).

- [ ] **Step 3: Implement**

Append the types above to `src/lib/domain/types.ts` under a header comment "AI usage & practice billing (doctor side only — patients are never billed)". Write `money.ts` and `period.ts` (date-fns `addMonths`, `subDays`). In `env.ts` add the three getters (reading `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_PRICE_PER_1K_TOKENS_USD`; warn once with `console.warn` when the rate is set but invalid), `getBillingMode()` and the `billing` entry of `IntegrationStatus`. In `tests/support/setup.ts` add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_PRICE_PER_1K_TOKENS_USD` to the deleted keys. In `.env.example` add a "Stripe (practice billing, TEST MODE ONLY)" section documenting the three variables (live keys are ignored; webhook secret comes from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; default price 0.01).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run tests/billing && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

---

### Task 2: AI usage capture (AsyncLocalStorage collector)

**Files:**
- Create: `src/lib/ai/usage.ts`
- Modify: `src/lib/ai/openai/structured.ts`, `src/lib/ai/openai/extractor.ts`, `src/lib/ai/openai/summarizer.ts`, `src/lib/ai/mock/provider.ts`
- Test: `tests/ai/usage.test.ts`

**Interfaces:**
- Consumes: `AiProvider`, `TokenCountSource` (types.ts).
- Produces (`src/lib/ai/usage.ts`, no `server-only` so tests and scripts can import it):
```ts
export interface ModelUsageEvent {
  kind: string; // structured-output schema name: "observation_extraction" | "recovery_summary" | "privacy_filter" | …
  provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
}
export function estimateTokens(text: string): number; // Math.ceil(text.length / 4)
export function estimatedUsageEvent(kind: string, provider: AiProvider, model: string | null, promptText: string, outputText: string): ModelUsageEvent;
export function reportModelUsage(event: ModelUsageEvent): void; // no-op outside a scope
export function collectModelUsage<T>(fn: () => Promise<T>): Promise<{ result: T; events: ModelUsageEvent[] }>;
```
- Produces: `export function buildExtractorUserPrompt(entry: PipelineEntry): string` (openai/extractor.ts, the existing inline `user` string); `export function buildSummarizerUserPrompt(input: SummarizerInput): string` (openai/summarizer.ts, today's `compactInput`).
- `OpenAIClientLike.responses.parse` result type gains `usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null`.

- [ ] **Step 1: Write the failing tests** (`tests/ai/usage.test.ts`; reuse the input builders and fake-client pattern from `tests/ai/workflow.test.ts`)
```ts
it("reportModelUsage outside a scope is a no-op", () => { expect(() => reportModelUsage(evt)).not.toThrow(); });
it("collects events inside a scope; inner scopes do not leak outward; concurrent scopes are isolated", async () => {
  const outer = await collectModelUsage(async () => {
    reportModelUsage({ ...evt, kind: "a" });
    const inner = await collectModelUsage(async () => reportModelUsage({ ...evt, kind: "b" }));
    expect(inner.events.map((e) => e.kind)).toEqual(["b"]);
  });
  expect(outer.events.map((e) => e.kind)).toEqual(["a"]);
  const [x, y] = await Promise.all([collectModelUsage(async () => reportModelUsage({ ...evt, kind: "x" })), collectModelUsage(async () => reportModelUsage({ ...evt, kind: "y" }))]);
  expect(x.events.map((e) => e.kind)).toEqual(["x"]); expect(y.events.map((e) => e.kind)).toEqual(["y"]);
});
it("mock pipeline run reports estimated extraction + summary usage", async () => {
  const { events } = await collectModelUsage(() => runHealthUpdatePipeline({ ...baseInput, newEntries: [entry], summarize: true }, { providers: MOCK_PROVIDERS }));
  expect(events.map((e) => e.kind)).toEqual(["observation_extraction", "recovery_summary"]);
  for (const e of events) { expect(e.provider).toBe("mock"); expect(e.tokenSource).toBe("estimated"); expect(e.inputTokens).toBeGreaterThan(0); expect(e.outputTokens).toBeGreaterThan(0); expect(e.totalTokens).toBe(e.inputTokens + e.outputTokens); }
});
it("callStructured reports provider counts when the response has usage", async () => {
  // fake parse resolves { output_parsed: valid, output: [], usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 } }
  // expect one event { kind: request.name, provider: "openai", model: request.model, inputTokens: 120, outputTokens: 30, totalTokens: 150, tokenSource: "provider" }
});
it("callStructured estimates when usage is missing", async () => { /* tokenSource "estimated", inputTokens === estimateTokens(system + "\n" + user) */ });
it("a failing OpenAI extractor reports only the mock fallback", async () => {
  // extractor { provider: "openai", model: "gpt-4.1-mini", extract: async () => { throw new Error("boom") } } + MOCK summarizer
  // events: extraction event has provider "mock"; no event with provider "openai" and kind "observation_extraction"
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/ai/usage.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`usage.ts` uses `AsyncLocalStorage<ModelUsageEvent[]>` from `node:async_hooks`; `collectModelUsage` runs `fn` in a fresh array (`storage.run(events, fn)`) and returns `{ result, events }` (on rejection it rethrows). `callStructured` keeps its signature and calls `reportModelUsage` once, after the parsed output passes `request.schema.parse` (refusals and invalid output report nothing): provider counts when `response.usage` exists, otherwise `estimatedUsageEvent(request.name, "openai", request.model, request.system + "\n" + request.user, JSON.stringify(parsed))`. The mock extractor and summarizer in `mock/provider.ts` report `estimatedUsageEvent("observation_extraction" | "recovery_summary", "mock", null, <SYSTEM_PROMPT> + "\n" + <build…UserPrompt(input)>, JSON.stringify(<result>))`, using the extractor output wrapped as `{ observations }`. The OpenAI extractor/summarizer use the exported builders (behavior unchanged).

- [ ] **Step 4: Run AI tests, typecheck, lint**

Run: `npx vitest run tests/ai && npm run typecheck && npm run lint`
Expected: PASS (all existing AI tests still pass).

---

### Task 3: Repository contract, local DB, Supabase repository code, seed usage

**Files:**
- Modify: `src/lib/data/repository.ts` (append types; add methods at the end of `Repository`)
- Modify: `src/lib/data/local/local-db.ts`, `src/lib/data/local/local-repository.ts`
- Modify: `src/lib/data/supabase/mappers.ts`, `src/lib/data/supabase/repository.ts`
- Modify: `src/lib/demo/seed.ts`
- Test: `tests/billing/local-repository.test.ts`, `tests/seed/seed.test.ts` (add cases only)

**Interfaces:**
- Consumes: Task 1 types; Task 2 `estimatedUsageEvent`, `buildExtractorUserPrompt`, `buildSummarizerUserPrompt`, and the prompt constants; `DEFAULT_RATE_MICROS_PER_1K`, `usageAmountMicros`.
- Produces (repository.ts):
```ts
export type NewAiUsageRecord = Omit<AiUsageRecord, "id" | "createdAt"> & { id?: string; createdAt?: string };
export type AiUsageRecordPatch = Partial<Pick<AiUsageRecord, "billingStatus" | "billingMode" | "billingError" | "billedAt">>;
export interface UsageQuery {
  billingDoctorId?: string; patientId?: string;
  /** Inclusive bounds on occurredAt (ISO). */ since?: string; until?: string;
  billingStatus?: UsageBillingStatus[]; limit?: number;
  /** Order by occurredAt. Default "desc". */ order?: "asc" | "desc";
}
// Repository (system repository only; actor repositories throw FORBIDDEN):
createUsageRecords(records: NewAiUsageRecord[]): Promise<AiUsageRecord[]>;
updateUsageRecord(id: string, patch: AiUsageRecordPatch): Promise<AiUsageRecord>; // NOT_FOUND when missing
listUsageRecords(query: UsageQuery): Promise<AiUsageRecord[]>;
getBillingAccount(doctorId: string): Promise<BillingAccount | null>;
saveBillingAccount(account: BillingAccount): Promise<BillingAccount>; // upsert by doctorId, sets updatedAt
findBillingAccountByStripeCustomer(customerId: string): Promise<BillingAccount | null>;
```
- Produces (seed.ts): `SeedData.usageRecords: AiUsageRecord[]`. `LocalData` gains `usageRecords` (from the seed) and `billingAccounts: BillingAccount[]` (starts `[]`); both are added to `TABLES`, so an older JSON file without them is re-seeded.
- Produces (mappers.ts): `UsageRecordRow`, `BillingAccountRow`, `usageRecordFromRow`, `usageRecordToRow`, `usageRecordPatchToRow`, `billingAccountFromRow`, `billingAccountToRow`. Column names = snake_case of the field names; tables `ai_usage_records`, `billing_accounts` (exact DDL in Task 4); `simulatedInvoices` ↔ jsonb `simulated_invoices`.

- [ ] **Step 1: Write the failing tests**

`tests/billing/local-repository.test.ts` (`beforeEach(() => resetLocalDb())`, actors from `tests/services/support.ts`):
```ts
it("actor repositories cannot touch usage or billing", async () => {
  for (const actor of [maya(), drPark()]) {
    const repo = getRepository(actor);
    await expect(repo.listUsageRecords({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.createUsageRecords([])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.getBillingAccount(drPark().userId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.saveBillingAccount(account)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});
it("system repository creates, filters, orders, limits and updates usage records", async () => { /* create 3 records (two doctors, two patients, distinct occurredAt); assert filters by billingDoctorId, patientId, since/until (inclusive), billingStatus, order asc/desc, limit; updateUsageRecord changes only billing fields; unknown id → NOT_FOUND */ });
it("system repository upserts billing accounts and finds them by Stripe customer", async () => { /* save twice → one row, updatedAt refreshed; findBillingAccountByStripeCustomer("cus_123") */ });
```
`tests/seed/seed.test.ts` (new `it` blocks):
```ts
it("seeds one estimated, not-billed usage record per entry and per summary, billed to Dr. Park", () => {
  expect(data.usageRecords).toHaveLength(data.entries.length + data.summaries.length);
  for (const r of data.usageRecords) {
    expect(r.billingDoctorId).toBe(DEMO_IDS.users.drPark);
    expect(r.billingStatus).toBe("not_billed"); expect(r.tokenSource).toBe("estimated");
    expect(r.totalTokens).toBe(r.inputTokens + r.outputTokens); expect(r.totalTokens).toBeGreaterThan(0);
    expect(r.amountMicros).toBe(usageAmountMicros(r.totalTokens, r.rateMicrosPer1k));
  }
  // extraction records point at their entry; summary records have journalEntryId null and the audience's operation
});
```
Also make sure the existing "unique, valid UUIDs" test covers the new ids (use `fixedId("b0000000", n)`).

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/billing/local-repository.test.ts tests/seed/seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Local repository: every new method starts with `this.requireSystem("AI usage records" | "Billing accounts")`; reads return clones; writes call `this.db.save()`. Supabase repository: every new method calls `this.requireSystem()`, uses the mappers, `upsert(..., { onConflict: "doctor_id" })` for accounts. Seed: payer = the doctor of the patient's earliest assignment (`createdAt` asc, then `id` asc) — Dr. Park for all three; extraction record per entry (`operation: "entry_extraction"`, `journalEntryId`, `triggeredBy: "patient"`, `triggeredByUserId`: the patient's user id, `occurredAt`: entry `createdAt`, tokens from `estimatedUsageEvent("observation_extraction", "mock", null, EXTRACTOR_SYSTEM_PROMPT + "\n" + buildExtractorUserPrompt(toPipelineEntry-shaped {id, source, body, occurredAt}), JSON.stringify({ observations: <that entry's seeded observations> }))`); summary record per summary (`operation` from audience, `journalEntryId: null`, `triggeredBy: "patient"`, prompt text = `SUMMARIZER_SYSTEM_PROMPT` + the source entry bodies joined, output = `JSON.stringify(content)`, `occurredAt`: summary `createdAt`); all `rateMicrosPer1k: DEFAULT_RATE_MICROS_PER_1K`, `billingStatus: "not_billed"`, `billingMode/billingError/billedAt: null`.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run tests/billing tests/seed tests/services && npm run typecheck && npm run lint`
Expected: PASS (existing service tests unaffected).

---

### Task 4: Supabase schema, RLS tests and the Supabase seed script

**Files:**
- Create: `supabase/migrations/20261114100000_billing.sql`
- Modify: `tests/db/rls.test.ts` (load the new migration after the privacy-filter migration; add a describe block), `scripts/seed-supabase.ts`, `supabase/README.md` (one line listing the migration)

**Interfaces:**
- Consumes: Task 3 mappers (`usageRecordToRow`).
- Produces (DDL; mapper column names must match):
```sql
create table public.billing_accounts (
  doctor_id              uuid primary key references public.profiles (id) on delete cascade,
  mode                   text not null check (mode in ('stripe', 'simulated')),
  status                 text not null check (status in ('pending_setup', 'active', 'past_due', 'canceled')),
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  stripe_price_id        text,
  payment_method_label   text,
  rate_micros_per_1k     integer not null check (rate_micros_per_1k > 0),
  period_anchor_at       timestamptz,
  activated_at           timestamptz,
  canceled_at            timestamptz,
  simulated_invoices     jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create table public.ai_usage_records (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.patient_profiles (id) on delete cascade,
  billing_doctor_id    uuid references public.profiles (id) on delete set null,
  operation            text not null check (operation in ('entry_extraction', 'patient_summary', 'clinician_summary', 'privacy_filter')),
  triggered_by         text not null check (triggered_by in ('patient', 'doctor', 'system')),
  triggered_by_user_id uuid references public.profiles (id) on delete set null,
  journal_entry_id     uuid references public.journal_entries (id) on delete set null,
  provider             text not null check (provider in ('openai', 'mock')),
  model                text,
  input_tokens         integer not null check (input_tokens >= 0),
  output_tokens        integer not null check (output_tokens >= 0),
  total_tokens         integer not null check (total_tokens >= 0),
  token_source         text not null check (token_source in ('provider', 'estimated')),
  rate_micros_per_1k   integer not null check (rate_micros_per_1k > 0),
  amount_micros        bigint not null check (amount_micros >= 0),
  billing_status       text not null check (billing_status in ('not_billed', 'pending', 'billed', 'sync_failed')),
  billing_mode         text check (billing_mode in ('stripe', 'simulated')),
  billing_error        text,
  billed_at            timestamptz,
  occurred_at          timestamptz not null,
  created_at           timestamptz not null default now()
);
-- indexes: (billing_doctor_id, occurred_at desc), (patient_id, occurred_at desc)
-- updated_at trigger on billing_accounts via private.set_updated_at() (as vexo_connections)
-- enable row level security on both; NO policies
-- revoke all on both from anon, authenticated; grant all on both to service_role
```
Note: `amount_micros` is `bigint` — PostgREST returns it as a number for these magnitudes; the mapper must coerce with `Number(...)`.

- [ ] **Step 1: Write the failing RLS tests** (style of the existing `vexo_connections` checks)
```ts
for (const u of [U.maya, U.drPark]) {
  await expect(asUser(u, "select * from public.ai_usage_records")).rejects.toThrow(/permission denied/i);
  await expect(asUser(u, "select * from public.billing_accounts")).rejects.toThrow(/permission denied/i);
  await expect(asUser(u, `insert into public.billing_accounts (doctor_id, mode, status, rate_micros_per_1k) values ('${U.drPark}', 'simulated', 'active', 10000)`)).rejects.toThrow(/permission denied/i);
}
```
Plus one service-role insert of a usage record and an account that succeeds (proves the DDL and checks).

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/db/rls.test.ts`
Expected: FAIL (tables do not exist).

- [ ] **Step 3: Write the migration; update the seed script**

`scripts/seed-supabase.ts`: upsert `ai_usage_records` from `data.usageRecords` after `generated_summaries`; in its cleanup/reset path also delete demo rows from `ai_usage_records` (by demo patient ids) and `billing_accounts` (by demo doctor ids) so a re-seed resets billing.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run tests/db && npm run typecheck && npm run lint`
Expected: PASS.

---

### Task 5: Stripe adapter (test mode)

**Files:**
- Modify: `package.json` (`npm install stripe@^23.1.0`; script `"stripe:setup": "tsx --env-file=.env.local scripts/stripe-setup.ts"`)
- Create: `src/lib/integrations/stripe/client.ts`, `catalog.ts`, `operations.ts`, `scripts/stripe-setup.ts`
- Test: `tests/integrations/stripe.test.ts`

**Interfaces:**
- Consumes: `getBillingMode`, `env` (Task 1); `stripeUnitAmountDecimal` (Task 1); types.
- Produces (`client.ts`, server-only):
```ts
export type StripeLike = Pick<Stripe, "billing" | "prices" | "customers" | "checkout" | "subscriptions" | "invoices" | "billingPortal" | "webhooks">;
export function getStripe(): StripeLike; // test override first; else new Stripe(env.stripeSecretKey, { timeout: 5_000, maxNetworkRetries: 0, appInfo: { name: "DoctorLoop AI (demo)" } }), memoized; throws integrationError("Stripe test mode is not configured.") when getBillingMode() !== "stripe"
export function setStripeForTests(client: StripeLike | null): void;
```
- Produces (`catalog.ts`, server-only):
```ts
export const METER_EVENT_NAME = "doctorloop_ai_tokens";
export interface StripeCatalog { meterId: string; priceId: string; portalConfigurationId: string }
export function ensureStripeCatalog(stripe: StripeLike, rateMicrosPer1k: number): Promise<StripeCatalog>; // memoized per rate (cache the promise; drop it on rejection)
export function resetStripeCatalogCache(): void;
```
Meter: `billing.meters.list({ status: "active", limit: 100 })`, reuse `event_name === METER_EVENT_NAME`, else `billing.meters.create({ display_name: "DoctorLoop AI tokens", event_name: METER_EVENT_NAME, default_aggregation: { formula: "sum" }, customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" }, value_settings: { event_payload_key: "value" } })`. Price: lookup key `doctorloop_ai_tokens_${rateMicrosPer1k}`; `prices.list({ lookup_keys: [key], active: true, limit: 1 })`, else `prices.create({ currency: "usd", unit_amount_decimal: Stripe.Decimal.from(stripeUnitAmountDecimal(rate)), billing_scheme: "per_unit", recurring: { interval: "month", usage_type: "metered", meter: meterId }, lookup_key: key, product_data: { name: "DoctorLoop AI usage" } })` (v23 types `unit_amount_decimal` as `Stripe.Decimal`). Portal: `billingPortal.configurations.list({ active: true, limit: 20 })`, reuse one with `metadata.doctorloop === "portal"`, else create `{ features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "immediately" } }, business_profile: { headline: "DoctorLoop AI · practice billing (test mode)" }, metadata: { doctorloop: "portal" } }`.
- Produces (`operations.ts`, server-only):
```ts
export function ensureCustomer(stripe: StripeLike, doctor: { id: string; fullName: string; email: string }, existingCustomerId: string | null): Promise<string>; // existing id → returned without any Stripe call
export function createSubscriptionCheckout(stripe: StripeLike, input: { customerId: string; priceId: string; doctorId: string; appUrl: string }): Promise<{ id: string; url: string }>;
export interface CheckoutCompletion { customerId: string; subscriptionId: string; status: BillingAccountStatus; periodAnchorAt: string; paymentMethodLabel: string | null }
export function readCompletedCheckout(stripe: StripeLike, sessionId: string, doctorId: string): Promise<CheckoutCompletion>;
export interface SubscriptionState { status: BillingAccountStatus; periodStart: string; periodEnd: string; paymentMethodLabel: string | null }
export function readSubscriptionState(stripe: StripeLike, subscriptionId: string): Promise<SubscriptionState>;
export function mapSubscriptionStatus(status: string): BillingAccountStatus;
export function sendMeterEvent(stripe: StripeLike, input: { customerId: string; recordId: string; totalTokens: number; occurredAt: string }): Promise<void>;
export function previewUpcomingInvoice(stripe: StripeLike, input: { customerId: string; subscriptionId: string }): Promise<{ amountCents: number }>;
export function listStripeInvoices(stripe: StripeLike, customerId: string): Promise<BillingInvoiceView[]>;
export function createPortalSession(stripe: StripeLike, input: { customerId: string; returnUrl: string; configurationId: string }): Promise<string>;
export function invoiceUsageNow(stripe: StripeLike, subscriptionId: string): Promise<void>;
export function parseWebhookEvent(stripe: StripeLike, rawBody: string, signature: string, secret: string): Stripe.Event;
```
Pinned values: Checkout `{ mode: "subscription", customer, line_items: [{ price: priceId }] /* no quantity for metered */, client_reference_id: doctorId, metadata: { doctorloop_doctor_id: doctorId }, subscription_data: { metadata: { doctorloop_doctor_id: doctorId } }, success_url: \`${appUrl}/api/billing/checkout/complete?session_id={CHECKOUT_SESSION_ID}\`, cancel_url: \`${appUrl}/doctor/billing?setup=cancelled\` }`; retrieve with `expand: ["subscription", "subscription.default_payment_method"]`; `client_reference_id !== doctorId` → `forbidden("This checkout belongs to another account.")`; `status !== "complete"` or no subscription → `conflict("Checkout isn't complete yet.")`; period from `subscription.items.data[0].current_period_start/end` (Unix seconds → ISO); card label `"Visa •••• 4242"` (capitalized brand); status map: active/trialing→active, past_due/unpaid→past_due, incomplete→pending_setup, canceled/incomplete_expired/paused→canceled, anything else→pending_setup. Meter event `timestamp = Math.floor(Date.parse(occurredAt) / 1000)`, `value: String(totalTokens)`. Invoice view `amountCents = invoice.total`, `status = invoice.status ?? "draft"`, URLs `hosted_invoice_url ?? null` / `invoice_pdf ?? null`, `source: "stripe"`, `invoices.list({ customer, limit: 12 })`. Invoice now: `subscriptions.update(id, { billing_cycle_anchor: { type: "now" }, proration_behavior: "always_invoice" })`. Wrap Stripe errors in `integrationError` with a safe message (never echo Stripe's message to the UI; log it).
- `scripts/stripe-setup.ts`: refuses unless the key is a test key; runs `ensureStripeCatalog(new Stripe(key), env rate)` and prints the meter id, price id and portal configuration id.

- [ ] **Step 1: Write the failing tests** (fake = plain object of `vi.fn()`s cast `as unknown as StripeLike`)
```ts
it("reuses an existing meter, price and portal configuration", …); // no create calls
it("creates meter, price and portal configuration when missing", …); // assert exact create params above; String(price params.unit_amount_decimal) === "0.001"
it("memoizes the catalog per rate", …); // second call → list calls not repeated
it("ensureCustomer reuses an existing id and only creates once", …);
it("checkout uses subscription mode, metered price without quantity and the doctor as client_reference_id", …);
it("readCompletedCheckout rejects another doctor's session", …); // FORBIDDEN
it("readCompletedCheckout rejects an incomplete session", …); // CONFLICT
it("readCompletedCheckout maps subscription, period and card label", …); // { status: "active", periodAnchorAt: ISO of current_period_start, paymentMethodLabel: "Visa •••• 4242" }
it("meter events carry only stripe_customer_id and value", …); // toHaveBeenCalledWith({ event_name: "doctorloop_ai_tokens", payload: { stripe_customer_id: "cus_1", value: "2100" }, identifier: "rec-1", timestamp: 1_789_000_000 }); Object.keys(payload) === ["stripe_customer_id", "value"]
it("invoice now resets the billing cycle anchor and always invoices", …);
it("getStripe refuses live keys", …); // STRIPE_SECRET_KEY = "sk_live_x", no override → INTEGRATION
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/integrations/stripe.test.ts`
Expected: FAIL.

- [ ] **Step 3: Install and implement**

Run `npm install stripe@^23.1.0`, then implement the three modules and the script. Check exact param types in `node_modules/stripe/esm/resources/*.d.ts` when unsure.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run tests/integrations/stripe.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

---

### Task 6: Usage recording service

**Files:**
- Create: `src/lib/services/billing-usage.ts`
- Test: `tests/services/billing-usage.test.ts`

**Interfaces:**
- Consumes: Task 3 repository methods; Task 5 `getStripe`, `sendMeterEvent`; `getBillingMode`, `env.billingRateMicrosPer1k`; `usageAmountMicros`; `ModelUsageEvent`.
- Produces:
```ts
export interface UsageItem {
  operation: UsageOperation; journalEntryId: string | null; provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
}
export function usageItemsFromEvents(events: ModelUsageEvent[], map: (kind: string) => { operation: UsageOperation; journalEntryId: string | null } | null): UsageItem[]; // unmapped kinds dropped
export function resolvePayer(patientId: string, trigger: UsageTrigger): Promise<string | null>;
export function recordAiUsage(input: { patientId: string; trigger: UsageTrigger; items: UsageItem[] }): Promise<void>; // never throws
export function isBillableAccount(account: BillingAccount | null, mode: BillingMode): account is BillingAccount; // status active|past_due && account.mode === mode
export function retryUsageSync(actor: Actor): Promise<{ retried: number; failed: number }>;
```
Rules: payer = `trigger.userId` when `trigger.kind === "doctor"` and that doctor is assigned to the patient; otherwise the doctor of the earliest assignment (`createdAt` asc, then `id` asc); none → `null`. Records are inserted first with `occurredAt = now`, the account's rate when billable (else `env.billingRateMicrosPer1k`), `billingStatus`: not billable → `"not_billed"`; simulated → `"billed"` (`billingMode: "simulated"`, `billedAt: now`); Stripe → `"pending"` then `sendMeterEvent` per record → `"billed"` (`billedAt`) or `"sync_failed"` with `billingError: "Could not reach Stripe."`. Any error is logged with `console.error("[DoctorLoop] Usage recording failed:", error)` and swallowed. `retryUsageSync`: `assertDoctor`; Stripe mode with a billable account only (else `{ retried: 0, failed: 0 }`); retries the doctor's `sync_failed` records and `pending` records older than 2 minutes, with `occurredAt` within the last 30 days, reusing the record id as identifier.

- [ ] **Step 1: Write the failing tests** (`beforeEach(() => { resetLocalDb(); setStripeForTests(null); resetStripeCatalogCache(); })`; restore env after Stripe-mode tests)
```ts
it("bills a patient's usage to the earliest-assigned doctor (Priya → Dr. Park)", …);
it("bills doctor-triggered usage to that doctor (Dr. Bell regenerates Priya's summary)", …);
it("records not_billed when the payer has no billing account", …); // rate 10_000, amount = usageAmountMicros
it("bills immediately in simulated mode once the account is active", …); // seed an active simulated account via the system repo
it("does not bill an account activated in the other mode", …); // account.mode "stripe" while simulated → not_billed
it("sends one meter event per record in Stripe mode and marks them billed", …); // STRIPE_SECRET_KEY=sk_test_x + fake
it("marks sync_failed and resolves when Stripe rejects", …); // fake meterEvents.create rejects; recordAiUsage resolves; billingError "Could not reach Stripe."
it("retryUsageSync resends failed records with the same identifier", …);
it("usageItemsFromEvents maps kinds and drops unknown ones", …);
```

- [ ] **Step 2: Run and confirm failure** — Run: `npx vitest run tests/services/billing-usage.test.ts` → FAIL.

- [ ] **Step 3: Implement `billing-usage.ts`** (server-only; system repository only, after the checks above).

- [ ] **Step 4: Run tests, typecheck, lint** — `npx vitest run tests/services && npm run typecheck && npm run lint` → PASS.

---

### Task 7: Billing account lifecycle, checkout return route and Stripe webhook

**Files:**
- Create: `src/lib/billing/simulated.ts`, `src/lib/services/billing-account.ts`, `src/app/api/billing/checkout/complete/route.ts`, `src/app/api/webhooks/stripe/route.ts`
- Test: `tests/services/billing-account.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 5, 6 (`isBillableAccount`).
- Produces (`src/lib/billing/simulated.ts`, pure):
```ts
export const SIMULATED_CARD_LABEL = "Visa •••• 4242 (test card)";
export function activateSimulatedAccount(existing: BillingAccount | null, doctorId: string, rateMicrosPer1k: number, now: Date): BillingAccount; // keeps existing simulatedInvoices when existing.mode === "simulated"
export function cancelSimulatedAccount(account: BillingAccount, now: Date): BillingAccount;
export function closeSimulatedPeriod(account: BillingAccount, billed: Pick<AiUsageRecord, "totalTokens" | "amountMicros">[], period: BillingPeriod, now: Date): BillingAccount; // prepends { number: SIM-0001…, periodStart: period.start, periodEnd: now, status "paid", paidWith: card }, keeps 24, anchor = now
```
- Produces (`billing-account.ts`, server-only; every function starts with `assertDoctor(actor)` and uses the system repository for the actor's own account only):
```ts
export function getEffectiveAccount(doctorId: string): Promise<BillingAccount | null>; // account whose mode === getBillingMode(), else null
export function refreshAccount(account: BillingAccount): Promise<BillingAccount>; // Stripe + subscription id: readSubscriptionState → save when changed (periodAnchorAt = periodStart); errors logged, original returned
export function startBillingSetup(actor: Actor): Promise<{ redirectTo: string }>;
export function activateSimulatedBilling(actor: Actor): Promise<BillingAccount>;
export function completeStripeCheckout(actor: Actor, sessionId: string): Promise<BillingAccount>;
export function cancelSimulatedBilling(actor: Actor): Promise<BillingAccount>;
export function openBillingPortal(actor: Actor): Promise<{ redirectTo: string }>;
export function invoiceNow(actor: Actor, now?: Date): Promise<{ invoiceNumber: string | null }>;
export function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: string }>;
```
Rules and copy:
- `startBillingSetup`: billable account already → `conflict("Billing is already set up.")`. Simulated → `{ redirectTo: "/doctor/billing/checkout" }` (nothing saved). Stripe → `ensureStripeCatalog` → `ensureCustomer` (reuse `stripeCustomerId` of an existing Stripe-mode account) → save `{ mode: "stripe", status: "pending_setup", stripeCustomerId, stripePriceId, rateMicrosPer1k: env rate }` → `createSubscriptionCheckout` → `{ redirectTo: url }`.
- `activateSimulatedBilling`: Stripe mode → `conflict("Simulated billing is off because a Stripe test key is configured.")`.
- `completeStripeCheckout`: Stripe mode only; `readCompletedCheckout(stripe, sessionId, actor.userId)`; the completion's customer must equal the saved account's `stripeCustomerId` (else `forbidden()`); save status, subscription id, anchor, card label, `activatedAt: now`.
- `cancelSimulatedBilling`: needs an active simulated account (else `conflict("Billing isn't active.")`).
- `openBillingPortal`: Stripe mode with a customer → portal URL (return `${env.appUrl}/doctor/billing`); otherwise `conflict("The billing portal is available in Stripe test mode.")`.
- `invoiceNow`: needs a billable account (else `conflict("Billing isn't active.")`); period = `currentBillingPeriod(account.periodAnchorAt, now)`; billed records of this doctor with `occurredAt` in `[period.start, now]`; none → `conflict("Nothing to invoice yet — no billed AI usage in this period.")`. Simulated → save `closeSimulatedPeriod(...)`, return its number. Stripe → `invoiceUsageNow`, then `refreshAccount`, return `{ invoiceNumber: null }`.
- `handleStripeWebhook`: simulated mode → `{ status: 404, body: "Billing webhooks are not enabled." }`; no `env.stripeWebhookSecret` → 503 `"STRIPE_WEBHOOK_SECRET is not configured."`; missing/invalid signature → 400 `"Invalid signature."`; `checkout.session.completed` → when `client_reference_id` has an account in `pending_setup` with the same customer, activate it (re-read via `readCompletedCheckout`); `customer.subscription.updated|deleted` → account by customer → `mapSubscriptionStatus` (deleted → `canceled`) + period; `invoice.payment_failed` → `past_due`; `invoice.paid` → `active` when `past_due`; unknown customers/events → 200 `"ignored"`; handler errors → log + 500 `"error"`; success → 200 `"ok"`.
- Route `GET /api/billing/checkout/complete`: `const actor = await requireActor("doctor")`; read `session_id`; call `completeStripeCheckout` inside try/catch; respond with `NextResponse.redirect(new URL("/doctor/billing?setup=success" | "/doctor/billing?setup=error", env.appUrl))` — build the response outside the catch (never call `redirect()` inside try/catch).
- Route `POST /api/webhooks/stripe`: `export const runtime = "nodejs"`; `handleStripeWebhook(await request.text(), request.headers.get("stripe-signature"))` → `new Response(body, { status })`.

- [ ] **Step 1: Write the failing tests**
```ts
// simulated mode
it("startBillingSetup sends the doctor to the simulated checkout", …); // { redirectTo: "/doctor/billing/checkout" }
it("activateSimulatedBilling activates with the test card and current rate", …); // status active, paymentMethodLabel "Visa •••• 4242 (test card)", periodAnchorAt now
it("patients cannot use billing services", …); // maya() → FORBIDDEN for startBillingSetup / invoiceNow / activateSimulatedBilling
it("invoiceNow refuses when nothing was billed in the period", …); // CONFLICT, message exact
it("invoiceNow closes the simulated period with a paid invoice and refuses an immediate second click", …); // SIM-0001, amount = sum, second call → CONFLICT
it("cancelSimulatedBilling stops billing new usage", …); // then recordAiUsage → not_billed
// Stripe mode (fake)
it("startBillingSetup reuses the saved Stripe customer on a second attempt", …); // customers.create called once across two calls
it("completeStripeCheckout activates only the doctor's own completed session", …); // other doctor → FORBIDDEN; incomplete → CONFLICT; ok → active + card label
it("checkout return route redirects to setup=error on failure", …); // call GET with a bad session id; Location ends with /doctor/billing?setup=error (mock requireActor via vi.mock("@/lib/auth/session"))
it("invoiceNow in Stripe mode resets the anchor once there is billed usage", …);
it("webhook: 503 without secret, 400 on bad signature, 200 ignored for unknown customers, subscription.deleted cancels", …);
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run tests/services/billing-account.test.ts` → FAIL.

- [ ] **Step 3: Implement** `simulated.ts`, `billing-account.ts`, both routes.

- [ ] **Step 4: Run tests, typecheck, lint** — `npx vitest run tests/services tests/billing && npm run typecheck && npm run lint` → PASS.

---

### Task 8: Billing views: overview, statement, CSV

**Files:**
- Create: `src/lib/billing/views.ts`, `src/lib/billing/statement-range.ts`, `src/lib/billing/csv.ts`, `src/lib/services/billing-views.ts`
- Test: `tests/billing/views.test.ts`, `tests/services/billing-views.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 5, 6, 7 (`getEffectiveAccount`, `refreshAccount`, `previewUpcomingInvoice`, `listStripeInvoices`).
- Produces (pure):
```ts
// views.ts
export const ACTIVITY_LABELS: Record<"entry_extraction" | "clinician_summary", string>; // "Update structuring", "Pre-visit summary"
export const PRIVATE_LINE_LABEL = "Private processing (not itemized)";
export const BILLING_STATUS_LABELS: Record<UsageBillingStatus, string>; // Billed / Not billed / Sending… / Sync failed
export const TRIGGER_LABELS: Record<UsageTriggerKind, string>; // Patient / Clinician / System
export function isItemized(record: Pick<AiUsageRecord, "operation" | "journalEntryId">, sharedEntryIds: ReadonlySet<string>): boolean;
export function summarizeUsage(records: AiUsageRecord[]): UsageTotals; // notBilledMicros = everything not "billed"; failedSyncs = count "sync_failed"
export function toUsageLine(record: AiUsageRecord, patientName: string): UsageLine; // only for itemized records
// statement-range.ts
export function parseStatementRange(input: { from?: string; to?: string }, now: Date): BillingPeriod; // YYYY-MM-DD; from = 00:00:00.000Z, to = 23:59:59.999Z capped at now; invalid → last30Days(now); reversed → swapped; > 366 days → from = to − 366 days
// csv.ts
export const STATEMENT_CSV_HEADER = "date_utc,patient,patient_ref,doctor,activity,triggered_by,ai_engine,input_tokens,output_tokens,total_tokens,token_count,rate_usd_per_1k,amount_usd,billing_status";
export function escapeCsvCell(value: string): string; // prefix ' when starting with = + - @ tab or CR; quote when containing , " CR or LF (double inner quotes)
export function statementToCsv(statement: PatientUsageStatement): string; // header, one row per line, then the private row (empty date, PRIVATE_LINE_LABEL, empty triggered_by/ai_engine, token_count "estimated"|"measured"|"mixed", billing_status "Billed"|"Not billed"|"Partly billed"); amounts with 4 decimals, no "$"
export function statementFilename(statement: PatientUsageStatement): string; // doctorloop-usage-<patient-slug>-<YYYY-MM-DD>-<YYYY-MM-DD>.csv
```
- Produces (`billing-views.ts`, server-only):
```ts
export function getDoctorBillingOverview(actor: Actor, now?: Date): Promise<DoctorBillingOverview>;
export function getPatientUsageStatement(actor: Actor, patientId: string, range: { from?: string; to?: string }, now?: Date): Promise<PatientUsageStatement>;
export function getPatientUsageStatementCsv(actor: Actor, patientId: string, range: { from?: string; to?: string }): Promise<{ filename: string; csv: string }>;
```
Rules: `assertDoctor`. The overview first loads `getEffectiveAccount(actor.userId)` and, for a Stripe account, `refreshAccount(account)` (its failure must not throw — same `stripeError` handling as below). Usage rows come from the system repository filtered to `billingDoctorId = actor.userId`. Shared entry ids = `getRepository(actor).listEntries(patientId, { reviewStatus: ["approved"] })` per patient (the actor repository enforces assignment). Patient names from `getRepository(actor).getPatient`, fallback "Former patient". Overview: window `last30Days(now)`; `recent` = first 20 itemized (desc); `patients` sorted by `totals.totalTokens` desc; `account.status` = `"not_set_up"` when there is no effective account; `currentPeriod` only for active/past_due; `modeLabel` from `getIntegrationStatus().billing.label`; upcoming invoice: simulated = billed records since `currentPeriod.start` (`amountCents = microsToCents(sum)`, `note: null`); Stripe = `previewUpcomingInvoice` amount + our billed tokens, `note: "Stripe preview · may lag a few minutes"`; invoices: simulated = stored list mapped to `BillingInvoiceView` (`amountCents = microsToCents(amountMicros)`, status "paid", URLs null); Stripe = `listStripeInvoices`. **Any Stripe failure** sets `stripeError: "Couldn't reach Stripe. Showing DoctorLoop's own usage records."`, leaves `upcomingInvoice`/`invoices` empty, and never throws. Statement: doctor must be assigned (`isDoctorAssigned`), else `notFound("Patient not found.")`; lines ascending; `privateTotal = summarizeUsage(non-itemized)`; `ref = patientId.slice(0, 8).toUpperCase()`; rate = effective account's rate, else env rate.

- [ ] **Step 1: Write the failing tests**

`tests/billing/views.test.ts`: `isItemized` truth table (clinician_summary → true; extraction of shared id → true; extraction of unshared id / null id → false; patient_summary, privacy_filter → false); `summarizeUsage` sums; `parseStatementRange` cases from Review Focus 5 (`{ from: "abc" }` → last 30 days; `{ from: "2026-11-10", to: "2026-11-01" }` → swapped; 5-year span → 366 days ending at `to`; future `to` → now); `escapeCsvCell("=SUM(A1)") === "'=SUM(A1)"`, `escapeCsvCell('a,"b"') === '"a,""b"""'`; `statementToCsv` first line equals `STATEMENT_CSV_HEADER` and last row starts with `,` + `"Private processing (not itemized)"` cell.

`tests/services/billing-views.test.ts` (local DB, seeded usage):
```ts
it("Maya's pending entry is only in the private total; shared entries and pre-visit summaries are itemized", …); // use DEMO_IDS + seed statuses
it("an entry becomes itemized after approval and leaves again after revoke", …); // approveEntry / revokeEntry from services/patient
it("Dr. Bell sees nothing billed to Dr. Park", …); // overview.patients has no Priya rows
it("statement for an unassigned patient is NOT_FOUND; patients cannot read billing views", …);
it("views never contain entry ids or entry text", …); // JSON.stringify(overview + statement) contains no seeded entry id and no 20-char slice of any seeded body
it("overview survives Stripe failures", …); // STRIPE_SECRET_KEY=sk_test_x, active Stripe account in repo, fake whose invoices.* and subscriptions.retrieve reject → resolves with stripeError set, totals intact
it("upcoming invoice in simulated mode sums billed usage of the current period", …);
it("CSV export escapes cells and names the file after the patient and range", …);
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run tests/billing/views.test.ts tests/services/billing-views.test.ts` → FAIL.

- [ ] **Step 3: Implement** the four modules.

- [ ] **Step 4: Run tests, typecheck, lint** — `npx vitest run tests/billing tests/services && npm run typecheck && npm run lint` → PASS.

---

### Task 9: Wire usage recording into the AI call sites

> Lead: check that the other session (`doctorloop-ai-b4`) has finished its privacy-filter edits to `src/lib/services/{ingest,patient,vexo,voice}.ts` and `src/lib/ai/privacy/*` before dispatching this task.

**Files:**
- Modify: `src/lib/services/ingest.ts`, `src/lib/services/summaries.ts`, `src/lib/services/patient.ts`, `src/lib/services/doctor.ts`, `src/lib/services/vexo.ts`, `src/lib/ai/privacy/mock-classifier.ts` (and `openai-classifier.ts` only to export its user-prompt builder if it has none)
- Test: `tests/services/billing-recording.test.ts`

**Interfaces:**
- Consumes: `collectModelUsage`, `estimatedUsageEvent` (Task 2); `recordAiUsage`, `usageItemsFromEvents` (Task 6).
- Produces: `refreshClinicianSummary(patientId, opts?: { failSafe?: boolean; trigger?: UsageTrigger })` and `refreshPatientSummary(patientId, opts?: { trigger?: UsageTrigger })` (new optional `trigger`, default `{ kind: "system", userId: null }`).

Mapping (kind → operation): in `processEntry` — `"observation_extraction"` → `entry_extraction` (`journalEntryId: entry.id`), `"recovery_summary"` → `patient_summary` (`journalEntryId: null`); in `generateSummary` — `"recovery_summary"` → `clinician_summary` | `patient_summary` by audience, one scope and one `recordAiUsage` per pipeline attempt (revalidation retries are billed); in the privacy filter's shared helper (the one function in `ingest.ts` that calls `runPrivacyFilter`) — `"privacy_filter"` → `privacy_filter` (`journalEntryId: null`), recorded even when the filter kept nothing. Triggers: `processEntry` and the privacy filter use `{ kind: actor.role, userId: actor.userId }`; `decide()` in `patient.ts` passes the patient actor; `regenerateWeeklySummary` and the Vexo import pass the patient; `regenerateClinicianSummary` in `doctor.ts` passes `{ kind: "doctor", userId: actor.userId }`. Record after the AI work finishes and before returning; a failing pipeline must still mark the entry failed exactly as today. The mock privacy classifier reports `estimatedUsageEvent("privacy_filter", "mock", null, PRIVACY_SYSTEM_PROMPT + "\n" + <its numbered-sentence user prompt>, JSON.stringify(<classification>))`.

- [ ] **Step 1: Write the failing tests**
```ts
it("a manual check-in records privacy filter, extraction and patient summary usage billed to Dr. Park", …); // createManualEntry(maya(), { body: KNEE_NOTE }); system listUsageRecords({ patientId }) newest 3 operations ⊇ {privacy_filter, entry_extraction, patient_summary}; extraction journalEntryId === new entry id; all not_billed; triggeredBy "patient"
it("approving an update records a clinician summary run", …); // approveEntry → new clinician_summary record
it("Dr. Bell regenerating Priya's pre-visit summary is billed to Dr. Bell", …);
it("after simulated setup, a check-in is billed immediately", …); // activateSimulatedBilling(drPark()) first
it("a privacy-filter run that keeps nothing is still recorded", …); // body with only non-health chatter (see the privacy tests for an example that keeps nothing)
it("usage recording failures never break a check-in", …); // vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(LocalRepository.prototype, "createUsageRecords").mockRejectedValue(new Error("boom")) → createManualEntry still resolves with entry.processingStatus "processed"; console.error called with "[DoctorLoop] Usage recording failed:"; restore mocks afterwards
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run tests/services/billing-recording.test.ts` → FAIL.

- [ ] **Step 3: Implement the wiring** (Edit only; keep every existing behavior and signature).

- [ ] **Step 4: Run the whole unit suite, typecheck, lint** — `npm test && npm run typecheck && npm run lint` → PASS (all pre-existing tests included).

---

### Task 10: Doctor billing UI, patient note, nav and e2e spec

**Files:**
- Modify: `src/app/doctor/layout.tsx` (nav item), `src/components/app-shell/app-shell.tsx` (`NavIconKey` + `billing: Receipt`), `src/components/app-shell/integrations-popover.tsx` (Billing row: `mode: status.billing.mode === "stripe" ? "live" : "simulated"`), `src/app/patient/page.tsx` (note above `<ClinicalDisclaimer variant="patient" />`)
- Create: `src/app/doctor/billing/page.tsx`, `loading.tsx`, `actions.ts`, `checkout/page.tsx`, `statements/[patientId]/page.tsx`; `src/components/billing/` (`billing-hero.tsx` (C), `usage-tables.tsx`, `invoice-list.tsx`, `simulated-checkout-form.tsx` (C), `statement-actions.tsx` (C), `coverage-note.tsx`)
- Test: `tests/e2e/billing-flow.spec.ts`

**Interfaces:**
- Consumes: Task 7 service functions, Task 8 views, Task 1 money formatting.
- Produces (`actions.ts`, `"use server"`, each = `toActionResult(async () => { const actor = await requireActor("doctor"); … revalidatePath("/doctor/billing") })`):
```ts
startBillingSetupAction(): Promise<ActionResult<{ redirectTo: string }>>;
activateSimulatedBillingAction(): Promise<ActionResult<{ redirectTo: string }>>; // "/doctor/billing?setup=success"
cancelSimulatedBillingAction(): Promise<ActionResult<void>>;
openBillingPortalAction(): Promise<ActionResult<{ redirectTo: string }>>;
invoiceNowAction(): Promise<ActionResult<{ invoiceNumber: string | null }>>;
retryUsageSyncAction(): Promise<ActionResult<{ retried: number; failed: number }>>;
downloadStatementCsvAction(input: { patientId: string; from?: string; to?: string }): Promise<ActionResult<{ filename: string; csv: string }>>; // patientId validated with z.uuid()
```
UI (follow `docs/DESIGN.md`; reuse `PageHeader`, `StatCard`, `IntegrationModeBadge`, `EmptyState`, `Timestamp`, `ui/table`, `ui/button`, `ui/alert`, `sonner` toasts; read each component file for exact exports):
- `/doctor/billing` — `PageHeader` eyebrow "Practice billing", title "Billing", description "AI usage from your patients is billed to your practice — never to patients."; ink hero band: hero metric = upcoming invoice amount (`formatCents`) with period, or "Not set up" + the last-30-days not-billed amount; status pill "Billing active" (lime) / "Setup not finished" / "Payment past due" / "Billing off" / "Not set up"; buttons "Set up billing" (not set up / pending / canceled), "Invoice now (demo)" and "Manage billing" (Stripe) or "Turn off billing (demo)" (simulated) when active; `IntegrationModeBadge` with `modeLabel`; rate line `formatRate`. Stat strip (last 30 days): AI runs, Tokens, Billed, Not billed (+ "N estimated" hint when `estimatedRuns > 0`). Per-patient table with a "Statement" link to `/doctor/billing/statements/<patientId>`. Recent activity table (itemized lines; token cell shows "estimated" tag when estimated; status label). Invoices list (number, period, amount, status, "View" / "PDF" links when present; empty state "Invoices appear here when a billing period closes."). `stripeError` → inline `Alert`. `failedSyncs > 0` → notice + "Retry sync" button. Query `?setup=success|cancelled|error` → one toast/alert ("Billing is set up.", "Checkout was cancelled.", "Couldn't finish setting up billing. Try again."). Footer copy (Global Constraints).
- `/doctor/billing/checkout` — simulated mode only (Stripe mode → `redirect("/doctor/billing")`); plan summary (`formatRate`, "billed monthly"), doctor name/email, read-only test card fields "4242 4242 4242 4242", "12 / 34", "123", mono tag "SIMULATED · NO REAL PAYMENT", buttons "Start billing (simulated)" (→ action, then `router.push(redirectTo)`) and a "Cancel" link to `/doctor/billing?setup=cancelled`. Not Stripe-branded.
- `/doctor/billing/statements/[patientId]` — `await params`/`await searchParams`; NOT_FOUND → `notFound()`; printable layout (`print:` variants hide nav/buttons); header block (doctor, patient name, DOB, ref, period, rate, mode), itemized table, private row (label + runs/tokens/amount), totals, disclaimer; range form (two `type="date"` inputs, GET); `StatementActions` (C): "Print / Save as PDF" (`window.print()`), "Download CSV" (action → `Blob` → temporary `<a download>`).
- `CoverageNote` on `/patient` with the exact patient copy.

- [ ] **Step 1: Write the e2e spec** (`tests/e2e/billing-flow.spec.ts`, helpers from `tests/e2e/helpers.ts`; for writing a check-in copy the steps from `tests/e2e/demo-flow-text.spec.ts`)
```ts
test("practice billing: simulated setup, private until shared, invoice now", async ({ page }) => {
  const errors = trackErrors(page);
  await startAs(page, "Dr. Elena Park");
  await page.getByRole("link", { name: "Billing" }).click();
  await page.getByRole("button", { name: "Set up billing" }).click();
  await page.waitForURL(/\/doctor\/billing\/checkout/);
  await page.getByRole("button", { name: "Start billing (simulated)" }).click();
  await page.waitForURL(/\/doctor\/billing\?setup=success/);
  await expect(page.getByText("Billing active")).toBeVisible();
  await switchRole(page, "Maya Thompson");
  // write + submit a check-in (copy from demo-flow-text.spec.ts)
  await switchRole(page, "Dr. Elena Park");
  await page.goto(`/doctor/billing/statements/${MAYA_PATIENT_ID}`);
  await expect(page.getByRole("cell", { name: "Billed", exact: true })).toHaveCount(0);
  await expect(page.getByText("Private processing (not itemized)")).toBeVisible();
  await switchRole(page, "Maya Thompson");
  await page.goto("/patient/review"); await approvePending(page, /* text of the new check-in */);
  await switchRole(page, "Dr. Elena Park");
  await page.goto(`/doctor/billing/statements/${MAYA_PATIENT_ID}`);
  await expect(page.getByRole("cell", { name: "Billed", exact: true }).first()).toBeVisible(); // structuring + pre-visit summary now itemized
  await page.goto("/doctor/billing");
  await page.getByRole("button", { name: "Invoice now (demo)" }).click();
  await expect(page.getByText("SIM-0001")).toBeVisible();
  errors.expectClean();
});
```
(`MAYA_PATIENT_ID = "20000000-0000-4000-8000-000000000001"`.)

- [ ] **Step 2: Implement the UI** (Edit for existing files).

- [ ] **Step 3: Verify** — `npm test && npm run typecheck && npm run lint` → PASS. Do not run Playwright; report the spec as ready for the lead.

---

### Task 11: Docs and full verification (lead)

**Files:**
- Modify: `docs/ARCHITECTURE.md` (§2 modes table row "Billing", §4 ownership `[BILLING]` paths, §5 two table rows, new §6.10 "Billing" listing the service/adapter functions above, §9 demo flow step 9), `README.md` (billing section: modes, demo flow, "tomorrow with a Stripe test key": set `STRIPE_SECRET_KEY=sk_test_…`, `npm run stripe:setup`, test card 4242 4242 4242 4242, optional `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `STRIPE_WEBHOOK_SECRET`, "Invoice now (demo)").

- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Full verification** — `npm run typecheck && npm run lint && npm test && npm run build`, then Playwright when port 3100 is free (`npx playwright test tests/e2e/billing-flow.spec.ts`, then the full e2e suite). Expected: all green; existing e2e specs untouched and passing.
- [ ] **Step 3: Whole-branch review** on the most capable model against the spec, then fix findings.
