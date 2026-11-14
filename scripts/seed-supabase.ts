/**
 * Seeds a Supabase project with the synthetic DoctorLoop demo data. Idempotent.
 *
 *   npx tsx --env-file=.env.local scripts/seed-supabase.ts [--reset]
 *
 * --reset deletes the demo patients' rows (entries, observations, summaries, ...) before seeding.
 * Auth users and profiles are kept and re-synced. Reads env directly: this runs outside Next.js,
 * where modules that import "server-only" would throw.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSeedData, DEMO_ACCOUNTS, type SeedData } from "@/lib/demo/seed";
import {
  approvalToRow,
  assignmentToRow,
  doctorReviewToRow,
  entryToRow,
  observationToRow,
  patientToRow,
  profileToRow,
  sourceRefToRow,
  summaryToRow,
  usageRecordToRow,
  voiceSessionToRow,
} from "@/lib/data/supabase/mappers";

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(" or ")}`);
}

async function ensureAuthUsers(admin: SupabaseClient, password: string): Promise<void> {
  for (const account of DEMO_ACCOUNTS) {
    const existing = await admin.auth.admin.getUserById(account.userId);
    const missing =
      !existing.data.user && (existing.error?.status === 404 || existing.error?.code === "user_not_found");
    if (existing.error && !missing) throw new Error(`Auth lookup failed for ${account.email}: ${existing.error.message}`);

    const result = missing
      ? await admin.auth.admin.createUser({
          id: account.userId,
          email: account.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: account.fullName },
        })
      : await admin.auth.admin.updateUserById(account.userId, { password, email_confirm: true });
    if (result.error) throw new Error(`Auth ${missing ? "create" : "update"} failed for ${account.email}: ${result.error.message}`);
    console.log(`  auth user ${missing ? "created" : "updated"}: ${account.email}`);
  }
}

async function upsert(admin: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Upsert into ${table} failed: ${error.message}`);
  console.log(`  ${table}: ${rows.length} row(s)`);
}

async function resetDemoRows(admin: SupabaseClient, data: SeedData): Promise<void> {
  const patientIds = data.patients.map((p) => p.id);
  const userIds = data.profiles.map((p) => p.id);
  // Children first. Deleting entries also cascades to their observations, approvals and reviews.
  const doctorIds = data.profiles.filter((p) => p.role === "doctor").map((p) => p.id);
  const steps: [string, string, string[]][] = [
    ["ai_usage_records", "patient_id", patientIds],
    ["billing_accounts", "doctor_id", doctorIds],
    ["doctor_reviews", "patient_id", patientIds],
    ["sharing_approvals", "patient_id", patientIds],
    ["generated_summaries", "patient_id", patientIds],
    ["observations", "patient_id", patientIds],
    ["journal_entries", "patient_id", patientIds],
    ["voice_sessions", "patient_id", patientIds],
    ["source_references", "patient_id", patientIds],
    ["vexo_connections", "user_id", userIds],
  ];
  for (const [table, column, ids] of steps) {
    const { error } = await admin.from(table).delete().in(column, ids);
    if (error) throw new Error(`Reset of ${table} failed: ${error.message}`);
  }
  console.log("  demo rows deleted");
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secret = requireEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const password = process.env.DEMO_ACCOUNT_PASSWORD?.trim();
  if (!password || password.length < 12) {
    console.error("DEMO_ACCOUNT_PASSWORD is required (at least 12 characters) to seed the demo accounts.");
    process.exit(1);
  }
  const reset = process.argv.includes("--reset");

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const data = buildSeedData(new Date());

  console.log("Seeding DoctorLoop demo data (synthetic)...");
  if (reset) await resetDemoRows(admin, data);
  await ensureAuthUsers(admin, password);

  await upsert(admin, "profiles", data.profiles.map(profileToRow));
  await upsert(admin, "patient_profiles", data.patients.map(patientToRow));
  await upsert(admin, "care_assignments", data.assignments.map(assignmentToRow));
  await upsert(admin, "source_references", data.sourceRefs.map(sourceRefToRow));

  // voice_sessions <-> journal_entries reference each other: insert sessions without the entry link,
  // insert entries, then link the sessions.
  await upsert(admin, "voice_sessions", data.voiceSessions.map((v) => voiceSessionToRow({ ...v, journalEntryId: null })));
  await upsert(admin, "journal_entries", data.entries.map(entryToRow));
  await upsert(
    admin,
    "voice_sessions",
    data.voiceSessions.map((v) => voiceSessionToRow(v)),
  );

  await upsert(admin, "observations", data.observations.map(observationToRow));
  await upsert(admin, "generated_summaries", data.summaries.map(summaryToRow));
  await upsert(admin, "ai_usage_records", data.usageRecords.map(usageRecordToRow));
  await upsert(admin, "sharing_approvals", data.approvals.map(approvalToRow));
  await upsert(admin, "doctor_reviews", data.doctorReviews.map(doctorReviewToRow));

  console.log(`Done. Demo password for all accounts: (from DEMO_ACCOUNT_PASSWORD)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
