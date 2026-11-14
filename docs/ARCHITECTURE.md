# DoctorLoop AI — Architecture & Build Contract

Read this file fully before writing code. It is the single source of truth for module
boundaries, shared contracts and file ownership. Shared contract files (do not change
signatures without the lead's approval — additive changes only):

- `src/lib/domain/types.ts` — domain types + view models
- `src/lib/ai/schemas.ts` — Zod schemas for AI I/O
- `src/lib/data/repository.ts` — data access interface
- `src/lib/config/env.ts` — server config, feature detection, integration status
- `src/lib/errors.ts` — `AppError`, `toActionResult`

## 1. Product in one paragraph

DoctorLoop AI connects patients' everyday recovery experiences with their doctors.
Patients record health updates between appointments (ElevenLabs voice check-in, typed
notes, or Vexo wearable memories). A deterministic Mastra workflow (OpenAI, or a
rule-based mock without a key) extracts structured observations, builds a timeline and
writes summaries. Patients review/edit/approve/reject each entry before anything is
shared. Doctors see only patient-approved updates of their assigned patients, read an
AI pre-visit summary with citations to original records, and mark updates reviewed.

### Scope rules (apply everywhere: code, prompts, UI copy)
- Synthetic, fictional data only. Show a "Synthetic demo data" indicator in the shell.
- AI output is always labeled **"AI-generated · unverified · needs clinician review"**.
- Patient statements (verbatim quotes, body text) are visually distinct from AI text.
- Never diagnose, prescribe, recommend treatment, score/classify medical risk, triage,
  or raise emergency alerts. Doctor-side "awaiting review" = unread patient-shared
  updates, explicitly **not** a risk score (say so in a tooltip).
- Static safety note in patient check-in UI: "Not for emergencies. If you need urgent
  help, call your local emergency number." (static text, not an AI alert).
- Do not claim HIPAA compliance or clinical validation.

## 2. Runtime modes (auto-detected, see `env.ts`)

| Concern | Live mode (credentials present) | Fallback (no credentials) |
|---|---|---|
| Data + auth | Supabase Postgres + RLS + Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, publishable key, secret key) | Local JSON demo DB at `.data/local-db.json` + signed cookie sessions; same access rules enforced in code |
| AI | OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`) inside Mastra workflow | Deterministic rule-based extractor/summarizer inside the same Mastra workflow |
| Voice | ElevenLabs agent (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`) | "Simulated check-in" scripted text conversation, clearly labeled |
| Vexo | `VEXO_MODE=live`: MCP over Streamable HTTP + OAuth 2.1/PKCE (`vexo:read`) | Mock adapter with fictional memories, clearly labeled |
| Billing | Stripe Billing Meters in TEST MODE only (`STRIPE_SECRET_KEY` = `sk_test_…`/`rk_test_…`; live keys are ignored) | "Simulated billing": in-app checkout with a test card, instant billing, stored simulated invoices |

`getIntegrationStatus()` (env.ts) returns safe labels for the UI.

## 3. Tech conventions

- **Next.js 16.4 App Router**, React 19.3, TypeScript strict, `src/` dir, alias `@/*`.
  This Next version differs from older training data. When unsure, read
  `node_modules/next/dist/docs/` (e.g. `01-app/01-getting-started/*.md`).
  - `cacheComponents` is **disabled** (classic dynamic rendering). Pages that read
    cookies are dynamic automatically. Do not use `"use cache"`.
  - `params`/`searchParams` are **Promises**: `export default async function Page({ params }: { params: Promise<{ patientId: string }> }) { const { patientId } = await params; }`
  - Route handlers: `export async function GET(request: Request, ctx: { params: Promise<{...}> })`.
  - `cookies()` / `headers()` are async: `const store = await cookies()`.
  - Middleware is now `src/proxy.ts` exporting `export async function proxy(request: NextRequest)` + `export const config = { matcher: [...] }`.
  - Lint: `npm run lint` runs `eslint` (flat config). No `next lint`.
- **Tailwind v4** (via `@tailwindcss/turbopack`), **shadcn/ui** (style `radix-nova`, Radix
  primitives from the `radix-ui` package, icons `lucide-react`). Components live in
  `src/components/ui/*` — read them for exact exports before use. `cn` is in `@/lib/utils`.
  Toasts: `import { toast } from "sonner"`; `<Toaster />` from `@/components/ui/sonner`.
  Charts: `@/components/ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`,
  `ChartLegend`, `ChartLegendContent`, `type ChartConfig`) with `recharts` v3.
- **Zod v4** (`import { z } from "zod"`). **date-fns v4** for formatting.
- Server-only modules start with `import "server-only";` (env, data, services, integrations
  server code). Never import them from `"use client"` files.
- **Mutations from UI = Server Actions** (`"use server"` files) that: validate input with
  Zod → `const actor = await requireActor("patient" | "doctor")` → call a service →
  `revalidatePath(...)` → return `ActionResult<T>` via `toActionResult(() => ...)`.
  Never accept `patientId`/`userId` from the client for "self" operations — derive from actor.
- Route handlers only for OAuth redirects/callbacks and webhooks. Billing adds two: the Stripe Checkout
  return (`/api/billing/checkout/complete`) and the Stripe webhook (`/api/webhooks/stripe`). The statement
  CSV export is a server action that returns text; the client saves it as a Blob.
- No secrets in client bundles. Only `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_APP_URL` may reach the browser.
- Times: store ISO UTC; display with date-fns (`format(new Date(iso), "MMM d, h:mm a")`).
  Relative times ("2h ago") only inside client components after mount (avoid hydration
  mismatch) — use the shared `<Timestamp>` component.
- Tests: Vitest (`npm test`), files under `tests/**`. `server-only` is aliased to a no-op
  in tests. Set `process.env.DOCTORLOOP_LOCAL_DB_PATH = ":memory:"` for an isolated local DB.

## 4. Directory layout & ownership

Each build agent owns ONLY the paths listed for it. Import other modules by the
contracts below even if their files do not exist yet.

```
src/
  app/
    layout.tsx, page.tsx (landing), globals.css, not-found.tsx, error.tsx      [SHELL]
    login/page.tsx (+ login-form.tsx)                                          [SHELL]
    actions/auth.ts  (switchDemoAccountAction, signInAction, signOutAction,
                      resetDemoDataAction)                                     [CORE]
    patient/layout.tsx, patient/loading.tsx, patient/error.tsx                 [SHELL]
    patient/page.tsx, patient/actions.ts, patient/timeline/**, patient/review/**,
    patient/summary/**, patient/check-in/page.tsx                              [PATIENT-UI]
    patient/check-in/voice-actions.ts                                          [VOICE]
    patient/import/**                                                          [VEXO]
    doctor/layout.tsx, doctor/loading.tsx, doctor/error.tsx                    [SHELL]
    doctor/page.tsx, doctor/actions.ts, doctor/patients/[patientId]/**         [DOCTOR-UI]
    api/webhooks/elevenlabs/route.ts                                           [VOICE]
    api/integrations/vexo/{connect,callback,disconnect}/route.ts               [VEXO]
    doctor/billing/{page,loading,actions,checkout/page,statements/[patientId]/page}.tsx  [BILLING]
    api/billing/checkout/complete/route.ts, api/webhooks/stripe/route.ts       [BILLING]
  components/
    ui/**                       (shadcn — add new shadcn components only via CLI)
    app-shell/**                                                               [SHELL]
    shared/**                                                                  [SHELL]
    patient/**                                                                 [PATIENT-UI]
    doctor/**                                                                  [DOCTOR-UI]
    voice/**                                                                   [VOICE]
    vexo/**                                                                    [VEXO]
    billing/**                                                                 [BILLING]
  lib/
    domain/types.ts, ai/schemas.ts, data/repository.ts, config/env.ts, errors.ts  [LEAD]
    data/index.ts, data/local/**                                               [CORE]
    data/supabase/**, supabase/**                                              [SUPABASE]
    auth/**, authz/**                                                          [CORE]
    services/{patient,doctor,ingest,summaries,views}.ts                        [CORE]
    services/voice.ts, integrations/elevenlabs/**                              [VOICE]
    services/vexo.ts, integrations/vexo/**                                     [VEXO]
    ai/** (except schemas.ts), mastra/**                                       [AI]
    ai/usage.ts                                                                [BILLING]
    services/{billing-usage,billing-account,billing-views}.ts                  [BILLING]
    integrations/stripe/{client,catalog,operations}.ts, billing/*              [BILLING]
    demo/seed.ts                                                               [SEED]
  proxy.ts                                                                     [SUPABASE]
supabase/migrations/*.sql, supabase/README.md                                  [SUPABASE]
scripts/seed-supabase.ts                                                       [SUPABASE]
scripts/elevenlabs-create-agent.ts                                             [VOICE]
scripts/stripe-setup.ts (`npm run stripe:setup`),
supabase/migrations/20261114100000_billing.sql                                 [BILLING]
tests/authz/**, tests/services/**                                              [CORE]
tests/ai/**                                                                    [AI]
tests/db/**                                                                    [SUPABASE]
tests/integrations/elevenlabs*.test.ts                                         [VOICE]
tests/integrations/vexo*.test.ts                                               [VEXO]
tests/billing/**, tests/services/billing-*.test.ts, tests/integrations/stripe.test.ts,
tests/e2e/billing-flow.spec.ts                                                 [BILLING]
```

Note: `src/mastra/` lives at `src/mastra/index.ts` + `src/mastra/workflows/*` [AI].

## 5. Access rules (RLS semantics — identical in Supabase SQL and local code)

Actor kinds: patient (owns exactly one `PatientProfile`), doctor, system (service role).

| Table / entity | Patient (self) | Doctor | Notes |
|---|---|---|---|
| profiles | read own; read profiles of their assigned doctors | read own; read profiles of assigned patients | no client inserts |
| patient_profiles | read own | read assigned | |
| care_assignments | read own (as patient) | read own (as doctor) | system writes |
| journal_entries | read all own; insert own; update own **only while `pending_review`** (body/occurredAt) and status transitions | read **only `approved`** entries of assigned patients | |
| observations | read own (incl. removed); update own while parent entry `pending_review` | read `active` observations of `approved` entries of assigned patients | inserts: system |
| source_references | read own; insert own | read refs linked from `approved` entries of assigned patients | |
| voice_sessions | read/insert/update own | **none** | no transcript text is kept after completion (data minimisation; the webhook only acknowledges) |
| generated_summaries | read own (both audiences) | read `clinician` audience of assigned patients | inserts: system |
| sharing_approvals | read/insert own | none | audit log |
| doctor_reviews | none directly; services may show the patient that their own shared entry was marked reviewed (doctor name + time) via the system repo after the patient-self check | read/insert/update own rows, only for `approved` entries of assigned patients | |
| vexo_connections | none (system only) | none | encrypted tokens |
| ai_usage_records | none | none directly: billing views read via the system repository after `assertDoctor`, only rows billed to that doctor, privacy-aggregated (§5.2) | system writes only |
| billing_accounts | none | none directly: own account via the billing services | system only |

Status transitions a patient may perform on an entry:
`pending_review → approved` (share), `pending_review → rejected` (keep private),
`approved → rejected` ("stop sharing", logged as `revoked`), `rejected → approved`
(share later). No transition while `processingStatus = "processing"`. Editing
body/observations is only allowed in `pending_review`. Every transition writes a
`sharing_approvals` row and regenerates the clinician summary (from approved entries only).

### 5.1 Hardening rules (from the security review — binding for all code)
- **Writes that only the system repository may perform** (after an explicit authorization
  check in the service): observations insert/replace, generated summaries, sharing approval
  rows, source references, every voice-session UPDATE, journal-entry `processing_status` /
  `processing_error` / `source_ref_id` / `voice_session_id` updates, vexo connections.
  Patient (actor) writes: insert own `pending_review` entries (with own source ref / voice
  session ids), update own entry `body`/`occurred_at`/`edited_by_patient` (pending only) and
  `review_status`/`reviewed_by_patient_at` (valid transitions only), update own observations
  of pending entries, insert own voice sessions. Doctors: insert/update own doctor_reviews only.
- **No free text in source references.** `SourceReference.excerpt` is always `null` for
  new rows; provenance lives in `metadata` (Vexo: `tool`, `query`, `mcpServer`,
  `originalExcerptSha256`, `originalLength`, `trimmed`; ElevenLabs: `transcriptSource`
  = `"elevenlabs_api" | "client_unverified" | "simulated"`). The entry `body` is the only
  patient text that can ever be shared. Doctor-facing views additionally strip
  `sourceRef.excerpt` and keep only whitelisted metadata keys
  (`tool`, `query`, `mcpServer`, `trimmed`, `transcriptSource`).
- Entry `sourceRefId` / `voiceSessionId` must reference rows of the **same patient**
  (composite FKs in SQL; checked in the local repository).
- Only the newest clinician summary per patient is readable by doctors; older ones are
  marked `supersededAt` when a newer one is stored. Clinician summary refreshes are
  serialized per patient and re-validated against the current approved set before storing.
- Secrets: production requires `SESSION_SECRET` (≥ 32 chars); `TOKEN_ENCRYPTION_KEY` is
  required when `VEXO_MODE=live` in production (otherwise derived from the session secret
  with HKDF and a distinct label); demo accounts have **no default password** —
  `DEMO_ACCOUNT_PASSWORD` must be set to seed or to use the switcher in Supabase mode.
- **Privacy filter** (see `docs/PRIVACY_FILTER.md`): `ingestEntry`, `updateEntryText` (body changes), voice and Vexo import
  filter raw text (up to 20,000 chars) through the `privacy-filter` workflow BEFORE anything is persisted; the filtered body
  must fit 8,000 chars. Removed text and the original are never stored, logged or returned. `journal_entries.privacy_filter`
  (counts-only receipt) is a **system-only write**: set through the system repository after create/update; the local
  repository rejects it for actors and Supabase has no insert/update column grant for it.
- Live ElevenLabs conversations are bound to the server-created voice session (never trust
  a client-supplied conversation id without verifying it belongs to that session).

### 5.2 Billing privacy rule
A usage record is itemized (a dated line) for a doctor only if it is `entry_extraction` of an entry that is currently
`approved` and readable by that doctor, or `clinician_summary`. Everything else (structuring of pending/private entries,
`privacy_filter`, `patient_summary`) is one undated "Private processing (not itemized)" total, bucketed to whole UTC
calendar months. Billing views never contain entry text, entry ids or links. Stripe receives only the doctor's customer
(name, email, `doctorloop_doctor_id`) and token counts, never patient data. Patients are never billed and see no prices.

## 6. Module contracts

### 6.1 Data access — `src/lib/data/index.ts` [CORE]
```ts
export function getRepository(actor: Actor): Repository;   // visibility rules applied
export function getSystemRepository(): Repository;          // no filtering — services only, after authz
export function resetLocalDemoData(): Promise<void>;        // local mode only (re-seed relative to now)
```
Local store: `src/lib/data/local/local-db.ts` (singleton on `globalThis`, loads/saves
`env.localDbPath` JSON; seeds from `buildSeedData()` on first use; `":memory:"` = no disk
I/O; tolerate read-only filesystems by continuing in memory with a console warning).
Supabase: `src/lib/data/supabase/repository.ts` [SUPABASE] exports
`createSupabaseRepository(opts: { mode: "actor"; actor: Actor } | { mode: "system" }): Promise<Repository>`
(user-scoped cookie client vs secret-key admin client). `getRepository` is sync in the
contract above; the Supabase factory may be async, so **`getRepository`/`getSystemRepository`
return a Repository whose methods lazily await the underlying client** (simple proxy wrapper).

### 6.2 Supabase clients — `src/lib/supabase/*` [SUPABASE]
```ts
// server.ts
export async function createSupabaseServerClient(): Promise<SupabaseClient>; // cookies getAll/setAll
// admin.ts
export function createSupabaseAdminClient(): SupabaseClient;                 // secret key, no session
// client.ts ("use client" safe)
export function createSupabaseBrowserClient(): SupabaseClient;
// proxy-session.ts
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse>;
```

### 6.3 Auth — `src/lib/auth/*` [CORE]
```ts
// session.ts (server-only)
export async function getActor(): Promise<Actor | null>;            // React cache() per request
export async function requireActor(role?: Role): Promise<Actor>;    // redirect("/login") if none; redirect to own home if wrong role
export function homePathFor(role: Role): "/patient" | "/doctor";
// demo.ts (server-only)
export function listDemoAccounts(): DemoAccount[];                   // from seed (DEMO_ACCOUNTS)
export function isDemoSwitcherEnabled(): boolean;                    // env.enableDemoSwitcher
```
Local mode session: httpOnly cookie `dl_session` = `base64url(JSON{userId, iat}).hmacSHA256`,
signed with `env.sessionSecret`, 7-day max age, `sameSite: "lax"`, `secure` in production.
Supabase mode: `supabase.auth.getUser()` (validated server-side) → profile → patient.
Server actions in `src/app/actions/auth.ts`:
`switchDemoAccountAction(userId)` (refuses unless `isDemoSwitcherEnabled()`; local → set
cookie; supabase → `signInWithPassword(demo email, env.demoAccountPassword)`; returns
`ActionResult<{ redirectTo: string }>`), `signInAction(formData)` (Supabase email/password),
`signOutAction()`, `resetDemoDataAction()` (local mode + switcher enabled only).
The switcher authenticates AS a demo account — it never skips authorization.

### 6.4 Authorization — `src/lib/authz/policies.ts` [CORE]
Pure predicate functions mirroring §5 (used by the local repository and by services), e.g.
`canReadEntry(actor, entry, isAssigned)`, `canEditEntry(actor, entry)`,
`canReadObservation(...)`, `canReadSummary(...)`, `canDoctorReview(actor, entry, isAssigned)`,
plus `assertPatientSelf(actor): string /* patientId */` and
`assertDoctor(actor): void` that throw `AppError`.

### 6.5 Services [CORE unless noted] — all `server-only`, all take `actor` first
`src/lib/services/ingest.ts`
```ts
/** Create an entry for the actor's patient, run the AI pipeline (extract → timeline → patient summary),
 *  store observations (pending_review) and return the view. Used by manual, voice and Vexo flows. */
export async function ingestEntry(actor: Actor, input: {
  source: EntrySource; body: string; occurredAt?: string;
  sourceRefId?: string | null; voiceSessionId?: string | null;
}): Promise<TimelineEntryView>;
export async function reprocessEntry(actor: Actor, entryId: string): Promise<TimelineEntryView>;
```
`src/lib/services/patient.ts`
```ts
export async function getPatientDashboard(actor: Actor): Promise<PatientDashboardData>;
export async function listPatientTimeline(actor: Actor, filters?: { source?: EntrySource; status?: ReviewStatus }): Promise<TimelineEntryView[]>;
export async function getPatientNavCounts(actor: Actor): Promise<{ pendingReview: number }>;
export async function createManualEntry(actor: Actor, input: { body: string; occurredAt?: string }): Promise<TimelineEntryView>;
export async function updateEntryText(actor: Actor, entryId: string, input: { body?: string; occurredAt?: string }): Promise<TimelineEntryView>; // pending only; body change re-runs extraction
export async function updateObservation(actor: Actor, observationId: string, patch: ObservationPatch): Promise<Observation>; // pending only; sets editedByPatient
export async function setObservationRemoved(actor: Actor, observationId: string, removed: boolean): Promise<Observation>;
export async function approveEntry(actor: Actor, entryId: string, note?: string): Promise<TimelineEntryView>;  // share + regenerate clinician summary
export async function rejectEntry(actor: Actor, entryId: string, note?: string): Promise<TimelineEntryView>;   // keep private
export async function revokeEntry(actor: Actor, entryId: string): Promise<TimelineEntryView>;                 // stop sharing + regenerate
export async function regenerateWeeklySummary(actor: Actor): Promise<GeneratedSummary>;
export async function getPatientSummaries(actor: Actor): Promise<{ weekly: GeneratedSummary | null; clinician: GeneratedSummary | null; entriesById: Record<string, TimelineEntryView> }>;
```
`src/lib/services/doctor.ts`
```ts
export async function getDoctorOverview(actor: Actor): Promise<DoctorOverviewStats>;
export async function getDoctorNavCounts(actor: Actor): Promise<{ awaitingReviewPatients: number; unreviewedUpdates: number }>;
export async function listDoctorPatients(actor: Actor, filters?: { q?: string; status?: "all" | "awaiting_review" }): Promise<DoctorPatientListItem[]>;
export async function getDoctorPatientDetail(actor: Actor, patientId: string): Promise<DoctorPatientDetail>; // NOT_FOUND if unassigned
export async function getSharedRecord(actor: Actor, entryId: string): Promise<TimelineEntryView>;          // approved + assigned only
export async function markEntryReviewed(actor: Actor, entryId: string): Promise<DoctorReview>;
export async function markAllReviewed(actor: Actor, patientId: string): Promise<number>;
export async function regenerateClinicianSummary(actor: Actor, patientId: string): Promise<GeneratedSummary>;
```
`src/lib/services/summaries.ts` (internal helpers used by patient/doctor/ingest):
`refreshClinicianSummary(patientId)` (approved entries only, system repo, via pipeline with
`audience: "clinician"`), `refreshPatientSummary(patientId)` (pending + approved entries, last 7 days).
`src/lib/services/views.ts`: `buildTimelineViews(repo, entries, opts)` helper joining observations + source refs (+ doctor reviews).

### 6.6 AI pipeline — `src/lib/ai/*`, `src/mastra/*` [AI]
```ts
// src/lib/ai/pipeline.ts
export interface RunPipelineInput {
  patientId: string;
  audience: SummaryAudience;
  patientContext: { firstName: string; procedure: string; procedureDate: string; recoveryStage: string };
  newEntries: PipelineEntry[];          // to extract (may be empty)
  contextEntries: PipelineEntry[];      // already-extracted entries in scope (for timeline/summary)
  existingObservations: Observation[];  // active observations of contextEntries
  periodStart: string; periodEnd: string;
  summarize: boolean;
}
export interface RunPipelineOutput {
  extracted: { entryId: string; observations: ExtractedObservation[] }[];
  timeline: TimelineResult;
  summary: SummaryContent | null;       // validated; every citation ∈ input entry ids
  provider: AiProvider; model: string | null;               // EXTRACTION stage provider/model
  summaryProvider: AiProvider | null; summaryModel: string | null; // SUMMARY stage (null when summarize=false)
  workflowRunId: string | null;
}
// ingestEntry(actor, input, options?: { summarize?: boolean /* default true */ })
// summaries.ts exports refreshPatientSummary(patientId) and refreshClinicianSummary(patientId)
export async function runHealthUpdatePipeline(input: RunPipelineInput): Promise<RunPipelineOutput>;
export function getAiProviderInfo(): { provider: AiProvider; model: string | null };

// src/lib/ai/timeline.ts  (pure, deterministic, also used by services for dashboards)
export type TimelineObservationInput = Pick<Observation,
  "id" | "journalEntryId" | "category" | "label" | "bodySite" | "observedAt" | "severity" | "measureValue" | "measureUnit">;
export function buildTimeline(entries: Pick<JournalEntry, "id" | "occurredAt">[], observations: TimelineObservationInput[]): TimelineResult;
// (inside the workflow, freshly extracted observations get temporary ids `${entryId}:${index}`)
```
Mastra workflow id `health-update-pipeline` with steps `extract-observations` →
`build-timeline` → `summarize`. Extraction & summary use OpenAI structured outputs (Zod)
when `OPENAI_API_KEY` is set, else deterministic mock providers. All LLM output is
re-validated with `src/lib/ai/schemas.ts` and post-checked (verbatim quotes, explicit
severity, valid citations). Services convert `ExtractedObservation` → `NewObservation`.

### 6.7 Voice [VOICE]
`src/lib/services/voice.ts`: `startVoiceSession(actor)` → `{ session, connection: { mode: "elevenlabs"; agentId: string; conversationToken: string | null; signedUrl: string | null } | { mode: "simulated" } }`;
`completeVoiceSession(actor, sessionId, { transcript, externalConversationId?, confirmedNotes? })` → `{ session, entry: TimelineEntryView | null }` (uses `ingestEntry` with `source: "voice"`, body = patient turns);
`cancelVoiceSession(actor, sessionId)`; `handleElevenLabsWebhook(rawBody, signatureHeader)`.
UI: `src/components/voice/voice-check-in.tsx` → `export function VoiceCheckIn(props: { patientFirstName: string; mode: "elevenlabs" | "simulated" })` ("use client").

### 6.8 Vexo [VEXO]
`src/lib/services/vexo.ts`: `getVexoStatus(actor)`, `previewVexoImport(actor, { query?, from, to })`
(returns health-relevant candidates only + `excludedCount`; nothing stored),
`importVexoMemories(actor, { items })` (re-fetches each item from the adapter to verify
provenance, stores `source_references` + entries via `ingestEntry` with `source: "vexo"`),
`disconnectVexo(actor)`. Adapter interface in `src/lib/integrations/vexo/types.ts`
with `MockVexoAdapter` + `LiveVexoAdapter` (MCP + OAuth 2.1 PKCE). UI page `/patient/import`.

### 6.9 Shared UI components — `src/components/shared/*` [SHELL]
Server-compatible (no `"use client"`) unless marked (C).
```tsx
SourceBadge({ source: EntrySource; mode?: IntegrationMode | null; className? })      // Voice / Note / Vexo (+ "mock"/"simulated" tag)
ReviewStatusBadge({ status: ReviewStatus; className? })                              // Pending your review / Shared with care team / Private
DoctorReviewBadge({ reviewed: boolean; className? })                                 // New / Reviewed
Timestamp({ value: string; mode?: "relative" | "absolute" | "both"; className? })   // (C)
AiGeneratedLabel({ provider?: AiProvider; model?: string | null; generatedAt?: string; compact?: boolean; className? })
PatientQuote({ children: ReactNode; attribution?: string; className? })
ObservationItem({ observation: Observation; className? })                           // read-only rendering
SummaryView({ summary: GeneratedSummary; citationHref?: (entryId: string) => string; entryLabels?: Record<string, string> })
SymptomTrendsChart({ series: TrendSeries[]; title?: string; description?: string })  // (C) self-reported, labeled
ExplicitChangesList({ changes: ExplicitChange[] })
EntryCard({ item: TimelineEntryView; actions?: ReactNode; footer?: ReactNode; highlight?: boolean; id?: string })
EntryTimeline({ items: TimelineEntryView[]; renderActions?: (item) => ReactNode; emptyTitle?: string; emptyDescription?: string }) // grouped by day
EmptyState({ icon?: LucideIcon; title: string; description?: string; action?: ReactNode })
PageHeader({ title: string; description?: string; eyebrow?: string; actions?: ReactNode })
ClinicalDisclaimer({ variant?: "patient" | "doctor"; className? })
IntegrationModeBadge({ label: string; mode: "live" | "mock" | "simulated" | "local" })
StatCard({ label: string; value: ReactNode; hint?: string; icon?: LucideIcon })
```
App shell [SHELL]: `src/components/app-shell/app-shell.tsx` (C) —
`AppShell({ actor, nav: NavItem[], integrationStatus: IntegrationStatus, demoAccounts: DemoAccount[] | null, children })`
with `NavItem = { href: string; label: string; icon: NavIconKey; badge?: number }`,
`NavIconKey = "overview" | "check-in" | "timeline" | "review" | "import" | "summary" | "patients" | "awaiting"`.
Header contains breadcrumb/title area, "Synthetic demo data" pill, integrations popover,
`DemoRoleSwitcher` (only if `demoAccounts`), user menu with sign out.

### 6.10 Privacy filter: `src/lib/ai/privacy/*`, `src/lib/ai/privacy-pipeline.ts`, `src/mastra/workflows/privacy-filter.ts` [AI]
Mastra workflow `privacy-filter`: `segment` (deterministic numbered sentences) -> `classify` (OpenAI via `callStructured`, or
the rule-based mock; returns `{ keep, redactions }` only) -> `assemble` (kept original sentences + placeholders `[name] [phone]
[email] [address] [id] [link]`, after the regex safety net). `runPrivacyFilter(text, { classifier? })` returns
`{ text, receipt, workflowRunId }`. A failing OpenAI call falls back to the mock with `receipt.fallback = true`.
Services: `applyPrivacyFilter`, `filterForStorage`, `ingestFilteredEntry` in `ingest.ts`; Vexo import filters each item once and
reports `filteredOutExternalIds`.

### 6.11 Billing [BILLING]
Usage capture (`src/lib/ai/usage.ts`, never imports billing code): `collectModelUsage(fn)` opens an AsyncLocalStorage scope and
returns `{ result, events }`; `reportModelUsage(event)` is a no-op outside a scope; `estimatedUsageEvent(...)` / `estimateTokens`
(`ceil(chars / 4)`) build estimated events. `callStructured` reports exact provider usage (or an estimate); the mock extractor and
summarizer report estimated events.
```ts
// services/billing-usage.ts
recordAiUsage({ patientId, trigger, items }): Promise<void>     // never throws
retryUsageSync(actor): Promise<{ retried; failed }>             // only within 23 h (RETRY_WINDOW_MS)
// services/billing-account.ts
startBillingSetup, activateSimulatedBilling, completeStripeCheckout, cancelSimulatedBilling,
openBillingPortal, invoiceNow, handleStripeWebhook, refreshAccount, refreshAccountReporting
// services/billing-views.ts
getDoctorBillingOverview(actor, now?)                           // current UTC calendar month
getPatientUsageStatement(actor, patientId, range) / getPatientUsageStatementCsv(...)
// integrations/stripe: getStripe(), ensureStripeCatalog(stripe, rate), operations.ts (customer, checkout, meter events, ...)
```
Payer rule: the doctor with the earliest care assignment; doctor-triggered usage bills that doctor; the payer is snapshotted on
each record. Record statuses: `not_billed | pending | billed | sync_failed`. Usage recorded while billing is not set up in the
current mode stays `not_billed` and is never backfilled. Records are inserted first, then reported concurrently (Stripe client:
5 s timeout, no retries for meter events); a Stripe failure never blocks a patient action. `getDoctorBillingOverview` and the
statement return privacy-aggregated views (§5.2): itemized lines for the range plus the private month bucket (`privatePeriod`).
A statement is available only for patients assigned to the doctor, and only covers records billed to that doctor.
Money is integer micro-USD (`amountMicros = round(totalTokens * rateMicrosPer1k / 1000)`); the default rate is $0.01 per 1,000
tokens (`BILLING_PRICE_PER_1K_TOKENS_USD`). Stripe receives meter events `doctorloop_ai_tokens` with `stripe_customer_id` and `value` only.

## 7. Demo data — `src/lib/demo/seed.ts` [SEED]
`export const DEMO_IDS` (fixed UUIDs), `export const DEMO_ACCOUNTS: DemoAccount[]`,
`export function buildSeedData(now?: Date): SeedData` — all timestamps relative to `now`
(entries over the last 6 days). `SeedData = { profiles, patients, assignments, entries,
observations, sourceRefs, voiceSessions, summaries, approvals, doctorReviews }` (arrays of
the domain types). Accounts (emails use the reserved `example.com` domain):

| Who | Email | Story |
|---|---|---|
| Patient A — Maya Thompson | maya.thompson@example.com | Right knee ACL reconstruction 18 days ago. Self-reported knee discomfort rising 3→7/10 over 6 days, sleep falling ~7h→4h, physio + crutches, asks about night aching / icing. |
| Patient B — Daniel Okafor | daniel.okafor@example.com | Left total hip replacement 5 weeks ago. Gradual mobility improvement: walking 10→30 min, walker→cane, stiffness 5→2/10, asks about driving. |
| Patient C — Priya Raman | priya.raman@example.com | Laparoscopic gallbladder removal 12 days ago. Fatigue 7→6/10, naps, worried about returning to desk job and lifting her toddler. |
| Dr. Elena Park | dr.elena.park@example.com | Post-operative care clinic; assigned to A, B, C. Primary demo doctor. |
| Dr. Marcus Bell | dr.marcus.bell@example.com | General surgery; assigned to C only (demonstrates access control). |

## 8. UI design system
- Calm clinical SaaS look: white cards on a very light slate background, teal/cyan primary,
  generous spacing, rounded-xl cards, subtle borders, no heavy shadows.
- Source colors: Voice = violet, Note (manual) = sky, Vexo = amber. Review status:
  pending = amber, shared = emerald, private = slate. Doctor "New" = blue dot.
- AI content: `AiGeneratedLabel` + sparkles icon + subtle violet tint/dashed border.
- Patient words: `PatientQuote` (left border, quote icon, "Patient's words").
- Every page: `PageHeader`; loading skeletons (`loading.tsx`), empty states, toasts on
  success/failure, inline `Alert` for errors. Mobile: sidebar collapses to a sheet.
- Charts are labeled "Self-reported · not clinical measurements".

## 9. Core demo flow (must work end-to-end, in mock mode and live mode)
1. Switch to Maya (patient) → `/patient`.
2. Record an update via voice (`/patient/check-in`, simulated or ElevenLabs) or text fallback.
3. Mastra workflow runs (OpenAI or mock) → new entry appears "Pending your review" with extracted observations.
4. Maya edits if needed → "Approve & share" → clinician summary regenerated from approved entries.
5. Switch to Dr. Park → `/doctor` shows Maya with a "new update" badge + latest shared update.
6. Open Maya → AI pre-visit summary cites the new entry → citation opens the original record.
7. "Mark reviewed" → badge clears.
8. Same via `/patient/import` (mock Vexo): preview → select relevant memories → import → review → share → doctor.
9. Billing: Dr. Park → Billing → Set up billing → simulated checkout → Maya writes a check-in (usage shows only as private processing) → Maya shares it → it becomes an itemized "Update structuring" line (plus a "Pre-visit summary") → "Invoice now (demo)" → paid SIM-0001 invoice → per-patient statement (print / CSV).
