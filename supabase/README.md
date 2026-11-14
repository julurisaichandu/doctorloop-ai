# Supabase setup (DoctorLoop AI)

Synthetic demo data only. Without Supabase credentials the app runs on its local JSON demo
database; add the variables below to switch to Postgres + Auth + row-level security.

## 1. Apply the schema

Pick one:

- **SQL editor**: open your project's SQL editor, paste
  `supabase/migrations/20261113000000_doctorloop_init.sql`, run it.
- **CLI**: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.

The migration creates the tables, a non-exposed `private` schema with security-definer helper
functions, all RLS policies, a journal-entry guard trigger, and explicit privileges. Run it once on
an empty project; it is not written to be re-run. Then apply the later migrations in order:
`20261114000000_privacy_filter.sql` and `20261114100000_billing.sql` (practice AI billing tables, service role only).

## 2. Environment variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=sb_secret_...                          # or legacy SUPABASE_SERVICE_ROLE_KEY; server only
DEMO_ACCOUNT_PASSWORD=...                                  # required for the seed script (12+ chars); no default
```

The secret key bypasses RLS and must never reach the browser. Only the two `NEXT_PUBLIC_*` values
are used client-side. `src/proxy.ts` refreshes the auth session when the URL and publishable key are set.

## 3. Seed the demo accounts and data

```
npx tsx --env-file=.env.local scripts/seed-supabase.ts          # idempotent upsert
npx tsx --env-file=.env.local scripts/seed-supabase.ts --reset  # delete demo rows first
```

The script creates (or updates) the five demo auth users with their fixed UUIDs, confirmed emails
and the demo password, then upserts profiles, assignments, entries, observations, summaries,
approvals and reviews. Timestamps are relative to the time you run it.

## 4. What RLS guarantees

Every table has RLS enabled; policies apply to `authenticated` only (`anon` has no access).

| Table | Patient (self) | Doctor |
|---|---|---|
| profiles | own + assigned doctors | own + assigned patients |
| patient_profiles, care_assignments | own | assigned |
| journal_entries | read/insert/update own | read **approved** entries of assigned patients only |
| observations | read own; update while entry is pending | read `active` observations of approved entries |
| source_references | read/insert own | refs linked from approved entries |
| voice_sessions | read/insert/update own | none |
| generated_summaries | read own (both audiences) | `clinician` audience of assigned patients |
| sharing_approvals | read/insert own | none |
| doctor_reviews | none | read/insert/update own, approved entries of assigned patients |
| vexo_connections | none | none (service role only) |
| billing_accounts, ai_usage_records | none | none (service role only) |

Additional guarantees enforced in the database:

- Patients may change an entry's body or time only while it is `pending_review`. Status changes are
  limited to pending to approved/rejected, approved to rejected (stop sharing) and rejected to approved.
- Column-level grants keep ids, owners, `source` and `created_at` immutable for clients.
- Observations, summaries, care assignments and profiles are written only by the service role.
- The service role (secret key) bypasses RLS and the guard; use it only after an app-level authorization check.

`tests/db/rls.test.ts` applies this migration to an in-process Postgres (PGlite) and verifies the
rules above. Run it with `npx vitest run tests/db`.
