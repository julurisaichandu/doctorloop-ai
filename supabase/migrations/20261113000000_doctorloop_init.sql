-- DoctorLoop AI: initial schema + row-level security.
-- Synthetic demo data only. Mirrors docs/ARCHITECTURE.md section 5 (access rules).
--
-- Layout
--   public.*   application tables (exposed through the Data API, protected by RLS)
--   private.*  security-definer helper functions (schema NOT exposed through the Data API)

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('patient', 'doctor')),
  full_name   text not null,
  email       text not null,
  title       text,
  created_at  timestamptz not null default now()
);

create table public.patient_profiles (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references public.profiles (id) on delete cascade,
  full_name                text not null,
  date_of_birth            date,
  procedure                text not null,
  procedure_date           date not null,
  recovery_stage           text not null,
  recovery_notes           text,
  next_appointment_at      timestamptz,
  next_appointment_with    text,
  next_appointment_reason  text,
  created_at               timestamptz not null default now()
);

create table public.care_assignments (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  patient_id  uuid not null references public.patient_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (doctor_id, patient_id)
);
create index care_assignments_patient_id_idx on public.care_assignments (patient_id);

create table public.source_references (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patient_profiles (id) on delete cascade,
  provider          text not null check (provider in ('vexo', 'elevenlabs', 'manual')),
  mode              text not null check (mode in ('live', 'mock', 'simulated')),
  external_id       text,
  title             text,
  excerpt           text,
  source_timestamp  timestamptz,
  retrieved_at      timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb,
  unique (id, patient_id)
);
create index source_references_patient_id_idx on public.source_references (patient_id);

create table public.voice_sessions (
  id                        uuid primary key default gen_random_uuid(),
  patient_id                uuid not null references public.patient_profiles (id) on delete cascade,
  mode                      text not null check (mode in ('elevenlabs', 'simulated')),
  status                    text not null check (status in ('active', 'completed', 'failed', 'cancelled')),
  external_conversation_id  text,
  transcript                jsonb not null default '[]'::jsonb,
  confirmed_notes           text[] not null default '{}',
  started_at                timestamptz not null default now(),
  ended_at                  timestamptz,
  journal_entry_id          uuid,  -- FK added after journal_entries exists (circular reference)
  unique (id, patient_id)
);
create index voice_sessions_patient_id_idx on public.voice_sessions (patient_id);
create index voice_sessions_journal_entry_id_idx on public.voice_sessions (journal_entry_id);
create unique index voice_sessions_external_conversation_id_key
  on public.voice_sessions (external_conversation_id) where external_conversation_id is not null;

create table public.journal_entries (
  id                       uuid primary key default gen_random_uuid(),
  patient_id               uuid not null references public.patient_profiles (id) on delete cascade,
  source                   text not null check (source in ('manual', 'voice', 'vexo')),
  body                     text not null,
  occurred_at              timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  review_status            text not null default 'pending_review'
                             check (review_status in ('pending_review', 'approved', 'rejected')),
  reviewed_by_patient_at   timestamptz,
  processing_status        text not null default 'processing'
                             check (processing_status in ('processing', 'processed', 'failed')),
  processing_error         text,
  source_ref_id            uuid,
  voice_session_id         uuid,
  edited_by_patient        boolean not null default false,
  -- Composite FKs: a linked source reference / voice session must belong to the same patient.
  constraint journal_entries_source_ref_same_patient_fkey
    foreign key (source_ref_id, patient_id) references public.source_references (id, patient_id)
    on delete set null (source_ref_id),
  constraint journal_entries_voice_session_same_patient_fkey
    foreign key (voice_session_id, patient_id) references public.voice_sessions (id, patient_id)
    on delete set null (voice_session_id)
);
create index journal_entries_patient_occurred_idx on public.journal_entries (patient_id, occurred_at desc);
create index journal_entries_review_status_idx on public.journal_entries (review_status);
create index journal_entries_source_ref_id_idx on public.journal_entries (source_ref_id);
create index journal_entries_voice_session_id_idx on public.journal_entries (voice_session_id);

alter table public.voice_sessions
  add constraint voice_sessions_journal_entry_id_fkey
  foreign key (journal_entry_id) references public.journal_entries (id) on delete set null;

create table public.observations (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patient_profiles (id) on delete cascade,
  journal_entry_id  uuid not null references public.journal_entries (id) on delete cascade,
  category          text not null check (category in
                      ('symptom', 'sleep', 'mobility', 'activity', 'mood', 'medication', 'wound', 'question', 'other')),
  label             text not null,
  body_site         text,
  patient_quote     text not null,
  observed_at       timestamptz,
  time_description  text,
  severity          numeric check (severity is null or (severity >= 0 and severity <= 10)),
  severity_text     text,
  measure_value     numeric,
  measure_unit      text,
  context           text[] not null default '{}',
  uncertainties     text[] not null default '{}',
  status            text not null default 'active' check (status in ('active', 'removed')),
  edited_by_patient boolean not null default false,
  extracted_by      text not null check (extracted_by in ('openai', 'mock')),
  model             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index observations_patient_id_idx on public.observations (patient_id);
create index observations_journal_entry_id_idx on public.observations (journal_entry_id);

create table public.generated_summaries (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patient_profiles (id) on delete cascade,
  audience         text not null check (audience in ('patient', 'clinician')),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  content          jsonb not null,
  source_entry_ids uuid[] not null default '{}',
  generated_by     text not null check (generated_by in ('openai', 'mock')),
  model            text,
  created_at       timestamptz not null default now(),
  superseded_at    timestamptz
);
create index generated_summaries_patient_audience_idx
  on public.generated_summaries (patient_id, audience, created_at desc);

create table public.sharing_approvals (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patient_profiles (id) on delete cascade,
  journal_entry_id  uuid not null references public.journal_entries (id) on delete cascade,
  decision          text not null check (decision in ('approved', 'rejected', 'revoked')),
  decided_by        uuid not null references public.profiles (id) on delete cascade,
  decided_at        timestamptz not null default now(),
  note              text
);
create index sharing_approvals_patient_id_idx on public.sharing_approvals (patient_id);
create index sharing_approvals_journal_entry_id_idx on public.sharing_approvals (journal_entry_id);
create index sharing_approvals_decided_by_idx on public.sharing_approvals (decided_by);

create table public.doctor_reviews (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         uuid not null references public.profiles (id) on delete cascade,
  patient_id        uuid not null references public.patient_profiles (id) on delete cascade,
  journal_entry_id  uuid not null references public.journal_entries (id) on delete cascade,
  reviewed_at       timestamptz not null default now(),
  unique (doctor_id, journal_entry_id)
);
create index doctor_reviews_patient_id_idx on public.doctor_reviews (patient_id);
create index doctor_reviews_journal_entry_id_idx on public.doctor_reviews (journal_entry_id);

create table public.vexo_connections (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  tokens_enc       text not null,
  client_info_enc  text,
  scope            text,
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger journal_entries_set_updated_at before update on public.journal_entries
  for each row execute function private.set_updated_at();
create trigger observations_set_updated_at before update on public.observations
  for each row execute function private.set_updated_at();
create trigger vexo_connections_set_updated_at before update on public.vexo_connections
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Security-definer helpers (private schema, empty search_path).
-- They bypass RLS on the tables they read, which avoids recursive policies.
-- ---------------------------------------------------------------------------

-- Patient profile id of the signed-in user (null for doctors / anonymous).
create function private.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id from public.patient_profiles pp where pp.user_id = (select auth.uid())
$$;

-- Is the signed-in user a doctor assigned to the patient?
create function private.is_assigned_doctor(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.care_assignments ca
    where ca.patient_id = p_patient_id and ca.doctor_id = (select auth.uid())
  )
$$;

-- Is the entry approved by its patient AND the signed-in user an assigned doctor?
create function private.is_shared_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.journal_entries je
    join public.care_assignments ca on ca.patient_id = je.patient_id
    where je.id = p_entry_id
      and je.review_status = 'approved'
      and ca.doctor_id = (select auth.uid())
  )
$$;

-- Does the entry belong to the given patient?
create function private.entry_belongs_to(p_entry_id uuid, p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries je
    where je.id = p_entry_id and je.patient_id = p_patient_id
  )
$$;

-- Is the entry still waiting for the patient's review?
create function private.is_pending_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries je
    where je.id = p_entry_id and je.review_status = 'pending_review'
  )
$$;

-- Is the source reference linked from an approved entry of an assigned patient?
create function private.is_shared_source_ref(p_ref_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.journal_entries je
    join public.care_assignments ca on ca.patient_id = je.patient_id
    where je.source_ref_id = p_ref_id
      and exists (select 1 from public.source_references sr
                  where sr.id = je.source_ref_id and sr.patient_id = je.patient_id)
      and je.review_status = 'approved'
      and ca.doctor_id = (select auth.uid())
  )
$$;

-- Do the signed-in user and the given user share a care relationship (either direction)?
create function private.shares_care_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_assignments ca
    join public.patient_profiles pp on pp.id = ca.patient_id
    where (ca.doctor_id = (select auth.uid()) and pp.user_id = p_user_id)
       or (pp.user_id = (select auth.uid()) and ca.doctor_id = p_user_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Journal entry guard: edits and status transitions made by signed-in users.
-- Service-role / superuser sessions are not subject to it.
-- ---------------------------------------------------------------------------

create function private.guard_journal_entry_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.review_status is distinct from old.review_status and old.processing_status = 'processing' then
    raise exception 'Entry cannot be reviewed while it is still being processed'
      using errcode = '42501';
  end if;

  if (new.body is distinct from old.body or new.occurred_at is distinct from old.occurred_at)
     and old.review_status <> 'pending_review' then
    raise exception 'Entry text can only be edited while it is pending review'
      using errcode = '42501';
  end if;

  if new.review_status is distinct from old.review_status
     and not ((old.review_status = 'pending_review' and new.review_status in ('approved', 'rejected'))
              or (old.review_status = 'approved' and new.review_status = 'rejected')
              or (old.review_status = 'rejected' and new.review_status = 'approved')) then
    raise exception 'Invalid review status transition: % -> %', old.review_status, new.review_status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger journal_entries_guard_update before update on public.journal_entries
  for each row execute function private.guard_journal_entry_update();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.patient_profiles    enable row level security;
alter table public.care_assignments    enable row level security;
alter table public.journal_entries     enable row level security;
alter table public.observations        enable row level security;
alter table public.source_references   enable row level security;
alter table public.voice_sessions      enable row level security;
alter table public.generated_summaries enable row level security;
alter table public.sharing_approvals   enable row level security;
alter table public.doctor_reviews      enable row level security;
alter table public.vexo_connections    enable row level security;  -- no policies: service role only

-- profiles: own row, plus the other side of a care relationship. No client writes.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_care_with(id)));

-- patient_profiles: own, or assigned patients. No client writes.
create policy patient_profiles_select on public.patient_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_assigned_doctor(id)));

-- care_assignments: rows the user is part of. No client writes.
create policy care_assignments_select on public.care_assignments for select to authenticated
  using (doctor_id = (select auth.uid()) or patient_id = (select private.current_patient_id()));

-- journal_entries: patients see/insert/update their own; doctors read approved entries of assigned patients.
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (
    patient_id = (select private.current_patient_id())
    or (review_status = 'approved' and (select private.is_assigned_doctor(patient_id)))
  );
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check (
    patient_id = (select private.current_patient_id())
    and review_status = 'pending_review'
    and processing_status = 'processing'
  );
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (patient_id = (select private.current_patient_id()))
  with check (patient_id = (select private.current_patient_id()));

-- observations: patients read all own, update while the entry is pending; doctors read active
-- observations of approved entries. Inserts/deletes: service role only.
create policy observations_select on public.observations for select to authenticated
  using (
    patient_id = (select private.current_patient_id())
    or (status = 'active' and private.is_shared_entry(journal_entry_id))
  );
create policy observations_update on public.observations for update to authenticated
  using (
    patient_id = (select private.current_patient_id())
    and private.is_pending_entry(journal_entry_id)
  )
  with check (
    patient_id = (select private.current_patient_id())
    and private.is_pending_entry(journal_entry_id)
  );

-- source_references: patients read own; doctors read refs of approved entries. Inserts: service role only.
create policy source_references_select on public.source_references for select to authenticated
  using (
    patient_id = (select private.current_patient_id())
    or private.is_shared_source_ref(id)
  );

-- voice_sessions: patient-only (transcripts are never shared with doctors).
create policy voice_sessions_select on public.voice_sessions for select to authenticated
  using (patient_id = (select private.current_patient_id()));
create policy voice_sessions_insert on public.voice_sessions for insert to authenticated
  with check (patient_id = (select private.current_patient_id()));
-- voice_sessions updates: service role only.

-- generated_summaries: patients read both audiences; doctors read clinician summaries only.
create policy generated_summaries_select on public.generated_summaries for select to authenticated
  using (
    patient_id = (select private.current_patient_id())
    or (audience = 'clinician' and superseded_at is null
        and (select private.is_assigned_doctor(patient_id)))
  );

-- sharing_approvals: patient audit log (read own). Inserts: service role only.
create policy sharing_approvals_select on public.sharing_approvals for select to authenticated
  using (patient_id = (select private.current_patient_id()));

-- doctor_reviews: a doctor's own "read" markers, only for approved entries of assigned patients.
create policy doctor_reviews_select on public.doctor_reviews for select to authenticated
  using (doctor_id = (select auth.uid()) and private.is_shared_entry(journal_entry_id));
create policy doctor_reviews_insert on public.doctor_reviews for insert to authenticated
  with check (
    doctor_id = (select auth.uid())
    and private.is_shared_entry(journal_entry_id)
    and private.entry_belongs_to(journal_entry_id, patient_id)
  );
create policy doctor_reviews_update on public.doctor_reviews for update to authenticated
  using (doctor_id = (select auth.uid()) and private.is_shared_entry(journal_entry_id))
  with check (
    doctor_id = (select auth.uid())
    and private.is_shared_entry(journal_entry_id)
    and private.entry_belongs_to(journal_entry_id, patient_id)
  );

-- ---------------------------------------------------------------------------
-- Privileges. New tables are not guaranteed to be auto-granted to the API roles, so be explicit.
-- RLS still applies to every grant below.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

grant select on public.profiles, public.patient_profiles, public.care_assignments,
  public.observations, public.generated_summaries to authenticated;
grant select on public.source_references, public.sharing_approvals to authenticated;
grant select, insert on public.journal_entries, public.voice_sessions, public.doctor_reviews to authenticated;

-- Column-level update grants: ids, owners, source and created_at are immutable for clients.
-- processing_*, source_ref_id and voice_session_id are system-only (service role).
grant update (body, occurred_at, edited_by_patient, review_status, reviewed_by_patient_at)
  on public.journal_entries to authenticated;
grant update (category, label, body_site, observed_at, time_description, severity, severity_text,
  measure_value, measure_unit, context, uncertainties, status, edited_by_patient)
  on public.observations to authenticated;
-- Re-marking a review is an upsert, which rewrites the conflict-key columns too; RLS WITH CHECK pins them.
grant update (doctor_id, patient_id, journal_entry_id, reviewed_at) on public.doctor_reviews to authenticated;
-- vexo_connections: no grants for anon/authenticated (service role only).
