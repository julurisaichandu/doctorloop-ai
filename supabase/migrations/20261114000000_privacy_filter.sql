-- Privacy filter receipt (data minimisation).
--
-- Entries are filtered server-side before they are saved: only the kept, redacted text is stored.
-- `privacy_filter` holds a counts-only receipt (provider, model, sentence counts, redaction counts).
-- It is written by the server (service role) only. Patients must not be able to set or change it.

alter table public.journal_entries add column privacy_filter jsonb;

-- Inserts were granted table-wide, which would include the new column. Replace that grant with a
-- column list that leaves privacy_filter out (updates are already column-scoped and exclude it).
revoke insert on public.journal_entries from authenticated;
grant insert (
  id, patient_id, source, body, occurred_at, created_at, updated_at,
  review_status, reviewed_by_patient_at, processing_status, processing_error,
  source_ref_id, voice_session_id, edited_by_patient
) on public.journal_entries to authenticated;
