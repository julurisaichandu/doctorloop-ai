-- DoctorLoop AI: doctor-side, usage-based AI billing (synthetic demo).
-- System-only tables (like vexo_connections): RLS enabled with no policies, no grants to API roles.

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

create index ai_usage_records_billing_doctor_idx on public.ai_usage_records (billing_doctor_id, occurred_at desc);
create index ai_usage_records_patient_idx on public.ai_usage_records (patient_id, occurred_at desc);

create trigger billing_accounts_set_updated_at before update on public.billing_accounts
  for each row execute function private.set_updated_at();

alter table public.billing_accounts  enable row level security;  -- no policies: service role only
alter table public.ai_usage_records  enable row level security;  -- no policies: service role only

-- Supabase default privileges may auto-grant new public tables to the API roles; remove that.
revoke all on public.billing_accounts, public.ai_usage_records from anon, authenticated;
grant all on public.billing_accounts, public.ai_usage_records to service_role;
